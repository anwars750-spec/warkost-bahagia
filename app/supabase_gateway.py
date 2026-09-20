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
