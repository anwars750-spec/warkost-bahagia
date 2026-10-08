"use client";

import { useEffect } from "react";

const orderIdFromCard = (card) => {
  const text = card?.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
};

const findSettlementCard = () => {
  const main = document.querySelector("main");
  if (!main) return null;
  const label = [...main.querySelectorAll("*")].find(
    (node) =>
      node.children.length === 0 &&
      node.textContent?.trim().toUpperCase() === "SETORAN COD",
  );
  if (!label) return null;

  let node = label.parentElement;
  while (node && node !== main) {
    const text = node.textContent || "";
    if (
      text.toUpperCase().includes("SETORAN COD") &&
      /verifikasi uang tunai driver/i.test(text)
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
};

const settlementPriority = (order) => {
  const status = String(order?.settlement_status || "").toUpperCase();
  const payment = String(order?.payment_status || "").toUpperCase();
  if (status === "SUBMITTED") return 0;
  if (status === "NEEDS_REVIEW") return 1;
  if (status === "AWAITING_COD_SETTLEMENT") return 2;
  if (status === "VERIFIED") return 3;
  if (payment === "UNPAID" || payment === "PENDING") return 4;
  return 5;
};

export default function AdminCodSettlementShortcut() {
  useEffect(() => {
    let disposed = false;
    let observer = null;
    let currentCard = null;

    const showAllOrders = () => {
      window.dispatchEvent(new CustomEvent("warkost:admin-order-filter-reset"));
    };

    const openOrder = (orderId) => {
      showAllOrders();
      window.setTimeout(() => {
        const card = [
          ...document.querySelectorAll("main .order-list > .order"),
        ].find((item) => orderIdFromCard(item) === Number(orderId));
        if (!card) return;
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        const detailButton = [...card.querySelectorAll(":scope > button")].find(
          (button) =>
            /(?:lihat|tutup)\s+(?:detail|item\s*&\s*riwayat)/i.test(
              button.textContent || "",
            ),
        );
        detailButton?.click();
      }, 80);
    };

    const activate = async () => {
      if (currentCard?.dataset.codBusy === "1") return;
      if (currentCard) currentCard.dataset.codBusy = "1";
      try {
        const response = await fetch("/api/orders", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const candidates = (data.orders || [])
          .filter((order) => {
            const method = String(order.method || "").toUpperCase();
            return (
              ["COD", "CASH"].includes(method) &&
              String(order.status || "").toUpperCase() === "DELIVERED"
            );
          })
          .sort((a, b) => {
            const byPriority = settlementPriority(a) - settlementPriority(b);
            return byPriority || Number(b.id || 0) - Number(a.id || 0);
          });
        if (disposed || !candidates.length) return;
        openOrder(candidates[0].id);
      } finally {
        if (currentCard) currentCard.dataset.codBusy = "0";
      }
    };

    const onClick = (event) => {
      event.preventDefault();
      activate();
    };

    const onKeyDown = (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      activate();
    };

    const detach = () => {
      if (!currentCard) return;
      currentCard.removeEventListener("click", onClick);
      currentCard.removeEventListener("keydown", onKeyDown);
      currentCard.classList.remove("admin-cod-settlement-shortcut");
      currentCard.removeAttribute("role");
      currentCard.removeAttribute("tabindex");
      currentCard.removeAttribute("aria-label");
      currentCard.removeAttribute("title");
      delete currentCard.dataset.codBusy;
      currentCard = null;
    };

    const bind = () => {
      const nextCard = findSettlementCard();
      if (nextCard === currentCard) return;
      detach();
      if (!nextCard) return;
      currentCard = nextCard;
      currentCard.classList.add("admin-cod-settlement-shortcut");
      currentCard.setAttribute("role", "button");
      currentCard.setAttribute("tabindex", "0");
      currentCard.setAttribute(
        "aria-label",
        "Buka setoran COD yang perlu ditinjau",
      );
      currentCard.setAttribute("title", "Buka setoran COD yang perlu ditinjau");
      currentCard.addEventListener("click", onClick);
      currentCard.addEventListener("keydown", onKeyDown);
    };

    bind();
    observer = new MutationObserver(bind);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      disposed = true;
      observer?.disconnect();
      detach();
    };
  }, []);

  return null;
}
