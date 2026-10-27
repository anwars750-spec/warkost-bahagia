"use client";
import { useEffect, useState } from "react";
import {
  productLineTotal,
  formatStockQuantity,
} from "../lib/product-units.mjs";

// The name is retained for import compatibility; this is a React presentation
// component, not a DOM enhancer. Order metadata is the parent's realtime state.
export default function AdminOrderCardEnhancer({ order }) {
  const [result, setResult] = useState({ id: null, items: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/order-items?id=${encodeURIComponent(order.id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Gagal memuat item pesanan");
        if (!controller.signal.aborted)
          setResult({ id: order.id, items: data.items || [], error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({ id: order.id, items: null, error: error.message });
      });
    return () => controller.abort();
  }, [order.id]);
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
    <section className="admin-card-preview-v2">
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
