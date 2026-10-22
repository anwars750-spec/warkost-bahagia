"use client";

import { useEffect } from "react";

const PICKUP_LABEL = "Ambil di Warkost";

function parseOrderId(card) {
  const text = card.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
}

function installStyle() {
  if (document.getElementById("pickup-order-completion-style")) return;
  const style = document.createElement("style");
  style.id = "pickup-order-completion-style";
  style.textContent = `
    .pickup-complete-button{width:100%;margin-top:10px;background:#176c42!important;color:#fff!important;border-color:#176c42!important}
    .pickup-complete-button:disabled{opacity:.6;cursor:wait}
    .pickup-order-badge{display:inline-flex;align-items:center;gap:6px;margin-top:8px;padding:6px 10px;border-radius:999px;background:#edf8f1;color:#176c42;font-size:12px;font-weight:700}
  `;
  document.head.appendChild(style);
}

function polishCustomerPickupTracking(orders) {
  const bodyText = document.body?.innerText || "";
  if (!bodyText.includes(PICKUP_LABEL)) return;

  const visibleNumber = bodyText.match(/WB0*(\d+)/i);
  const visibleId = visibleNumber ? Number(visibleNumber[1]) : null;
  const pickupOrder = orders.find(
    (order) =>
      order.fulfillment_type === "PICKUP" &&
      (visibleId === null || Number(order.id) === visibleId),
  );
  if (!pickupOrder) return;

  for (const node of document.querySelectorAll("h1,h2,h3,h4,strong,span,p,small")) {
    const text = node.textContent?.trim();
    if (text === "Status Pengantaran") node.textContent = "Status Pesanan";
    if (text === "Siap Diantar") node.textContent = "Siap Diambil";
    if (text === "Diantar") node.textContent = "Siap Diambil";
    if (text === "Sampai") node.textContent = "Selesai";
    if (pickupOrder.status === "READY" && text === "Pesanan sedang diproses oleh dapur")
      node.textContent = "Pesanan siap diambil di Warkost";
    if (pickupOrder.status === "DELIVERED" && text === "Pesanan telah selesai diantar")
      node.textContent = "Pesanan sudah diambil di Warkost";
  }
}

export default function PickupOrderCompletionRuntime() {
  useEffect(() => {
    installStyle();
    let orders = [];
    let disposed = false;
    let timer = null;
    let loading = false;

    const schedule = (delay = 40) => {
      if (disposed) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(decorate, delay);
    };

    const loadOrders = async () => {
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        orders = data.orders || [];
      } catch {
        return;
      } finally {
        loading = false;
      }
      schedule(0);
    };

    const completePickup = async (button, orderId) => {
      button.disabled = true;
      const original = button.textContent;
      button.textContent = "Menyelesaikan…";
      try {
        const response = await fetch("/api/pickup-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Gagal menyelesaikan pickup");
        window.dispatchEvent(new Event("warkost:realtime-recovered"));
        await loadOrders();
      } catch (error) {
        window.alert(error.message);
      } finally {
        button.disabled = false;
        button.textContent = original;
      }
    };

    function decorate() {
      polishCustomerPickupTracking(orders);

      document.querySelectorAll("main .order-list > .order").forEach((card) => {
        const orderId = parseOrderId(card);
        if (!orderId) return;
        const order = orders.find((item) => Number(item.id) === orderId);
        if (!order || order.fulfillment_type !== "PICKUP") return;

        if (!card.querySelector(".pickup-order-badge")) {
          const badge = document.createElement("div");
          badge.className = "pickup-order-badge";
          badge.textContent = "🏪 Ambil di tempat";
          const head = card.querySelector(":scope > .order-head");
          head?.insertAdjacentElement("afterend", badge);
        }

        const existing = card.querySelector(".pickup-complete-button");
        if (order.status !== "READY") {
          existing?.remove();
          return;
        }
        if (existing) return;

        const actions = card.querySelector(":scope > .actions") || card;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "primary pickup-complete-button";
        button.textContent = "Pesanan Sudah Diambil";
        button.addEventListener("click", () => completePickup(button, orderId));
        actions.appendChild(button);
      });
    }

    void loadOrders();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { childList: true, subtree: true });
    const onRealtime = () => void loadOrders();
    window.addEventListener("warkost:realtime", onRealtime);
    window.addEventListener("warkost:orders-refreshed", onRealtime);

    return () => {
      disposed = true;
      observer.disconnect();
      window.removeEventListener("warkost:realtime", onRealtime);
      window.removeEventListener("warkost:orders-refreshed", onRealtime);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  return null;
}
