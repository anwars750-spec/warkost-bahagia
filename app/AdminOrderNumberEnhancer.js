"use client";

import { useEffect } from "react";

const orderIdFromCard = (card) => {
  const text = card.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
};

const orderCode = (id) => `WB${String(id).padStart(6, "0")}`;

export default function AdminOrderNumberEnhancer() {
  useEffect(() => {
    let disposed = false;
    let timer = null;

    const decorate = () => {
      if (disposed) return;
      document.querySelectorAll("main .order-list > .order").forEach((card) => {
        const id = orderIdFromCard(card);
        if (!id) return;

        const preview = card.querySelector(":scope > .admin-card-preview-v2");
        if (!preview) return;

        let badge = preview.querySelector(":scope > .admin-order-number-v3");
        if (!badge) {
          badge = document.createElement("div");
          badge.className = "admin-order-number-v3";
          preview.prepend(badge);
        }
        badge.innerHTML = `<span>NO. PESANAN</span><strong>${orderCode(id)}</strong>`;
      });
    };

    const schedule = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(decorate, 20);
    };

    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("warkost:admin-orders-rendered", schedule);

    return () => {
      disposed = true;
      if (timer) window.clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener("warkost:admin-orders-rendered", schedule);
      document.querySelectorAll(".admin-order-number-v3").forEach((node) => node.remove());
    };
  }, []);

  return null;
}
