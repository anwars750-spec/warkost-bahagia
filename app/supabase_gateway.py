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
