"use client";
import { memo, useEffect, useRef, useState } from "react";
import {
  productLineTotal,
  formatStockQuantity,
} from "../lib/product-units.mjs";

const ITEM_CACHE_TTL_MS = 120000;
const itemCache = new Map();
const itemRequests = new Map();

const cachedItems = (orderId) => {
  const cached = itemCache.get(Number(orderId));
  if (!cached) return null;
  if (Date.now() - cached.at > ITEM_CACHE_TTL_MS) {
    itemCache.delete(Number(orderId));
    return null;
  }
  return cached.items;
};

const loadOrderItems = (orderId) => {
  const id = Number(orderId);
  const cached = cachedItems(id);
  if (cached) return Promise.resolve(cached);
  if (itemRequests.has(id)) return itemRequests.get(id);

  const request = fetch(`/api/order-items?id=${encodeURIComponent(id)}`, {
    cache: "no-store",
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Gagal memuat item pesanan");
      const items = data.items || [];
      itemCache.set(id, { at: Date.now(), items });
      return items;
    })
    .finally(() => itemRequests.delete(id));

  itemRequests.set(id, request);
  return request;
};

function AdminOrderCardEnhancer({ order }) {
  const previewRef = useRef(null);
  const initialItems = cachedItems(order.id);
  const [shouldLoad, setShouldLoad] = useState(Boolean(initialItems));
  const [result, setResult] = useState({
    id: initialItems ? order.id : null,
    items: initialItems,
    error: "",
  });

  useEffect(() => {
    const cached = cachedItems(order.id);
    if (cached) {
      setResult({ id: order.id, items: cached, error: "" });
      setShouldLoad(true);
      return;
    }

    setResult({ id: null, items: null, error: "" });
    setShouldLoad(false);

    const node = previewRef.current;
    if (!node || typeof IntersectionObserver !== "function") {
      setShouldLoad(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setShouldLoad(true);
        observer.disconnect();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [order.id]);

  useEffect(() => {
    if (!shouldLoad) return;
    let active = true;
    loadOrderItems(order.id)
      .then((items) => {
        if (active) setResult({ id: order.id, items, error: "" });
      })
      .catch((error) => {
        if (active)
          setResult({ id: order.id, items: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [order.id, shouldLoad]);

  const items = result.id === order.id ? result.items : null;
  const money = (value) => "Rp" + Number(value || 0).toLocaleString("id-ID");
  const method = ["CASH", "COD"].includes(order.method)
    ? "COD"
    : order.method === "BANK_TRANSFER"
      ? "Transfer"
      : order.method || "—";
  const methodDescription =
    method === "COD"
      ? "Tunai saat diterima"
      : method === "QRIS"
        ? "Pembayaran QRIS"
        : method === "Transfer"
          ? "Transfer bank"
          : "Media pembayaran";

  return (
    <section ref={previewRef} className="admin-card-preview-v2">
      <div className="admin-order-number-v3">
        <span>NO. PESANAN</span>
        <strong>WB{String(order.id).padStart(6, "0")}</strong>
      </div>
      <div className="admin-card-commerce">
        <div className="admin-card-total">
          <small>Total</small>
          <strong>{money(order.total)}</strong>
        </div>
        <div className="admin-card-payment">
          <small>Media bayar</small>
          <div>
            <span className="admin-card-method">{method}</span>
            <span className="admin-card-payment-status">
              {order.payment_status || "—"}
            </span>
          </div>
          <em>{methodDescription}</em>
        </div>
      </div>
      <div className="admin-card-items-block">
        <div className="admin-card-items-title">
          <strong>Pesanan{items ? ` (${items.length})` : ""}</strong>
        </div>
        {items === null ? (
          <div
            className="admin-card-loading"
            role={result.error ? "alert" : undefined}
          >
            {result.error || "Memuat item pesanan…"}
          </div>
        ) : items.length ? (
          <>
            {items.slice(0, 2).map((item, index) => (
              <div className="admin-card-item-row" key={index}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.stock_unit === "GRAM"
                      ? formatStockQuantity(item.quantity, item.stock_unit)
                      : `${item.quantity}×`}
                    {item.prep_station
                      ? ` · ${item.prep_station === "KITCHEN" ? "Dapur" : "Admin · minuman"}`
                      : ""}
                  </small>
                </div>
                <span>{money(productLineTotal(item, item.quantity))}</span>
              </div>
            ))}
            {items.length > 2 && (
              <div className="admin-card-more">
                +{items.length - 2} item lainnya
              </div>
            )}
          </>
        ) : (
          <div className="admin-card-loading">Belum ada item.</div>
        )}
      </div>
    </section>
  );
}

export default memo(
  AdminOrderCardEnhancer,
  (previous, next) =>
    previous.order.id === next.order.id &&
    previous.order.total === next.order.total &&
    previous.order.method === next.order.method &&
    previous.order.payment_status === next.order.payment_status,
);
