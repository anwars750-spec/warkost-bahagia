import json
import os
import urllib.error
import urllib.request
from urllib.parse import urljoin

from flask import current_app


class SupabaseGatewayError(RuntimeError):
    """Raised when the server-side Supabase gateway cannot complete an operation."""


def _config():
    url = str(current_app.config.get("SUPABASE_URL") or "").strip().rstrip("/") + "/"
    key = str(current_app.config.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
    backend = str(current_app.config.get("WARKOST_BACKEND") or "sqlite").strip().lower()
    return backend, url, key


def enabled():
    backend, _, key = _config()
    return backend == "supabase" and bool(key)


def configured():
    _, url, key = _config()
    return bool(url.rstrip("/")) and bool(key)


def rpc(function_name, payload):
    """Call a server-side Supabase RPC using the service-role key.

    This module is intentionally server-only. The service-role key must never
    be returned to the browser or embedded in frontend assets.
    """
    _, base_url, key = _config()
    if not key or not base_url.rstrip("/"):
        raise SupabaseGatewayError("Supabase server configuration is incomplete.")

    endpoint = urljoin(base_url, f"rest/v1/rpc/{function_name}")
    body = json.dumps(payload or {}).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "apikey": key,
            "Authorization": f"Bearer {key}",
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise SupabaseGatewayError(
            f"Supabase RPC failed ({exc.code}): {detail[:500]}"
        ) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SupabaseGatewayError("Supabase connection failed.") from exc


def customer_delivery_quote(customer_id, latitude, longitude):
    return rpc(
        "server_customer_delivery_quote",
        {
            "p_customer": customer_id,
            "p_latitude": latitude,
            "p_longitude": longitude,
        },
    )


def customer_delivery_order(
    customer_id,
    items,
    address,
    latitude,
    longitude,
    notes=None,
):
    return rpc(
        "server_customer_delivery_order",
        {
            "p_customer": customer_id,
            "p_items": items,
            "p_address": address,
            "p_latitude": latitude,
            "p_longitude": longitude,
            "p_notes": notes,
        },
    )


def customer_promo_claim(customer_id, code):
    return rpc("server_customer_promo_claim", {"p_customer": customer_id, "p_code": code})


def customer_promo_validate(customer_id, code, subtotal):
    return rpc("server_customer_promo_validate", {"p_customer": customer_id, "p_code": code, "p_subtotal": subtotal})


def customer_delivery_order_v2(customer_id, items, address, latitude, longitude, notes=None, promo_code=None):
    return rpc(
        "server_customer_delivery_order_v2",
        {
            "p_customer": customer_id,
            "p_items": items,
            "p_address": address,
            "p_latitude": latitude,
            "p_longitude": longitude,
            "p_notes": notes,
            "p_promo_code": promo_code,
        },
    )


def get_customer_order(customer_id, supabase_order_id):
    """Fetch one customer-owned order through the server-only gateway."""
    rows = rest_json(
        "GET",
        "/rest/v1/orders",
        query={
            "id": f"eq.{supabase_order_id}",
            "customer_id": f"eq.{customer_id}",
            "select": "id,order_number,customer_id,status,subtotal,discount,delivery_fee,total,delivery_address,delivery_latitude,delivery_longitude,distance_km,created_at",
            "limit": "1",
        },
    )
    return rows[0] if rows else None


def get_customer_order_items(supabase_order_id):
    """Fetch immutable order-item snapshots for one Supabase order."""
    return rest_json(
        "GET",
        "/rest/v1/order_items",
        query={
            "order_id": f"eq.{supabase_order_id}",
            "select": "id,order_id,product_name,quantity,unit_price,normal_price,discount_amount,final_unit_price,subtotal,notes,station",
            "order": "id.asc",
        },
    ) or []


def backend_status():
    backend, url, key = _config()
    return {
        "backend": backend,
        "configured": bool(url.rstrip("/")) and bool(key),
        "enabled": backend == "supabase" and bool(key),
    }


def rest_json(method, path, payload=None, query=None):
    """Server-only Supabase REST helper for controlled identity bridge operations."""
    _, base_url, key = _config()
    if not key or not base_url.rstrip("/"):
        raise SupabaseGatewayError("Supabase server configuration is incomplete.")
    url = urljoin(base_url, path.lstrip("/"))
    if query:
        from urllib.parse import urlencode
        url += "?" + urlencode(query, doseq=True)
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    headers = {"Accept":"application/json", "apikey":key, "Authorization":f"Bearer {key}"}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw=response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail=exc.read().decode("utf-8", errors="replace")
        raise SupabaseGatewayError(f"Supabase REST failed ({exc.code}): {detail[:500]}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise SupabaseGatewayError("Supabase connection failed.") from exc


def get_profile(profile_id):
    rows = rest_json("GET", "/rest/v1/profiles", query={"id":f"eq.{profile_id}","select":"id,full_name,phone,role,legacy_user_id,is_active"})
    return rows[0] if rows else None


def link_legacy_user(profile_id, legacy_user_id):
    return rest_json("PATCH", "/rest/v1/profiles", payload={"legacy_user_id": int(legacy_user_id)}, query={"id":f"eq.{profile_id}"})


def verify_payment(
    order_id,
    status,
    provider_reference,
    transaction_reference=None,
    verified_at=None,
):
    """Verify a Supabase payment through the protected server-side wrapper.

    This never simulates payment locally. The Supabase transaction updates the
    payment/order state and triggers the existing stock/fulfillment flow.
    """
    payload = {
        "p_order_id": order_id,
        "p_status": status,
        "p_provider_reference": provider_reference,
        "p_transaction_reference": transaction_reference,
    }
    if verified_at:
        payload["p_verified_at"] = verified_at
    return rpc("server_verify_payment", payload)


def list_supabase_products_by_legacy_ids(legacy_ids):
    ids = [str(int(x)) for x in legacy_ids]
    if not ids:
        return []
    return rest_json(
        "GET",
        "/rest/v1/products",
        query={
            "legacy_product_id": "in.(" + ",".join(ids) + ")",
            "select": "id,legacy_product_id,name,selling_price,active",
        },
    ) or []


def upsert_supabase_product(
    legacy_product_id,
    category_id,
    name,
    description,
    normal_price,
    selling_price,
    stock,
    image_url=None,
):
    payload = {
        "legacy_product_id": int(legacy_product_id),
        "category_id": category_id,
        "name": name,
        "description": description,
        "normal_price": normal_price,
        "selling_price": selling_price,
        "stock": int(stock),
        "active": bool(True),
    }
    if image_url:
        payload["image_url"] = image_url

    existing = list_supabase_products_by_legacy_ids([legacy_product_id])
    if existing:
        product_id = existing[0]["id"]
        return rest_json(
            "PATCH",
            "/rest/v1/products",
            payload=payload,
            query={"id": f"eq.{product_id}", "select": "id,legacy_product_id,name,selling_price,active"},
        )
    return rest_json(
        "POST",
        "/rest/v1/products",
        payload=payload,
        query={"select": "id,legacy_product_id,name,selling_price,active"},
    )


def list_supabase_products_by_legacy_ids(legacy_ids):
    ids = [str(int(x)) for x in legacy_ids]
    if not ids:
        return []
    return rest_json(
        "GET",
        "/rest/v1/products",
        query={
            "legacy_product_id": "in.(" + ",".join(ids) + ")",
            "select": "id,legacy_product_id,name,selling_price,active",
        },
    ) or []


def upsert_supabase_product(
    legacy_product_id,
    category_id,
    name,
    description,
    normal_price,
    selling_price,
    stock,
    image_url=None,
):
    payload = {
        "legacy_product_id": int(legacy_product_id),
        "category_id": category_id,
        "name": name,
        "description": description,
        "normal_price": normal_price,
        "selling_price": selling_price,
        "stock": int(stock),
        "active": bool(True),
    }
    if image_url:
        payload["image_url"] = image_url

    existing = list_supabase_products_by_legacy_ids([legacy_product_id])
    if existing:
        product_id = existing[0]["id"]
        return rest_json(
            "PATCH",
            "/rest/v1/products",
            payload=payload,
            query={"id": f"eq.{product_id}", "select": "id,legacy_product_id,name,selling_price,active"},
        )
    return rest_json(
        "POST",
        "/rest/v1/products",
        payload=payload,
        query={"select": "id,legacy_product_id,name,selling_price,active"},
    )
