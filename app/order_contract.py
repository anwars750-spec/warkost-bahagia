"""V1.7B-04 order identity/response contract.

The customer UI currently speaks in terms of a stable app-facing integer
order_id. Supabase uses a UUID primary key. During migration we keep those
identifiers separate: the bridge row owns the legacy-facing integer while
supabase_order_id remains the operational source-of-truth identifier.

This module intentionally contains no checkout switching logic.
"""

ORDER_CONTRACT_VERSION = "v1.7b-04"


def normalize_supabase_order(row):
    """Map a Supabase order row to the stable customer-facing order contract."""
    if not row:
        return None
    return {
        "supabase_order_id": row.get("id"),
        "order_no": row.get("order_number") or row.get("order_no"),
        "customer_id": row.get("customer_id"),
        "status": row.get("status"),
        "payment_status": row.get("payment_status"),
        "subtotal": int(row.get("subtotal") or 0),
        "discount": int(row.get("discount") or 0),
        "delivery_fee": int(row.get("delivery_fee") or 0),
        "total": int(row.get("total") or 0),
        "address": row.get("delivery_address") or row.get("address"),
        "latitude": row.get("delivery_latitude") if row.get("delivery_latitude") is not None else row.get("latitude"),
        "longitude": row.get("delivery_longitude") if row.get("delivery_longitude") is not None else row.get("longitude"),
        "distance_km": row.get("delivery_distance_km") if row.get("delivery_distance_km") is not None else row.get("distance_km"),
        "created_at": row.get("created_at"),
    }


def create_order_bridge(db, customer_id, supabase_order_id, order_no):
    """Create a local UI reference for a Supabase order without duplicating it."""
    existing = db.execute(
        "SELECT id FROM supabase_order_links WHERE supabase_order_id=?",
        (str(supabase_order_id),),
    ).fetchone()
    if existing:
        return int(existing["id"])

    cur = db.execute(
        """INSERT INTO supabase_order_links
           (customer_id, supabase_order_id, order_no)
           VALUES (?, ?, ?)""",
        (int(customer_id), str(supabase_order_id), str(order_no)),
    )
    return int(cur.lastrowid)


def resolve_order_bridge(db, bridge_id, customer_id=None):
    """Resolve an app-facing order_id to the Supabase UUID, enforcing ownership."""
    if customer_id is None:
        row = db.execute(
            "SELECT * FROM supabase_order_links WHERE id=?",
            (int(bridge_id),),
        ).fetchone()
    else:
        row = db.execute(
            "SELECT * FROM supabase_order_links WHERE id=? AND customer_id=?",
            (int(bridge_id), int(customer_id)),
        ).fetchone()
    return row


def order_contract_status():
    return {
        "version": ORDER_CONTRACT_VERSION,
        "app_order_id": "integer bridge id for legacy-compatible customer UI",
        "supabase_order_id": "uuid operational source-of-truth id",
        "order_number": "human-readable stable order number",
        "checkout_switch": False,
    }
