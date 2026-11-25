"use client";

import { useEffect } from "react";

const STYLE_ID = "warkost-admin-eta-extension-style";

function orderIdFromCard(card) {
  const text = card?.querySelector(".order-head small")?.textContent || "";
  const warkost = text.match(/WB0*(\d+)/i);
  if (warkost) return Number(warkost[1]);
  const hash = text.match(/#\s*(\d+)/);
  return hash ? Number(hash[1]) : null;
}

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .preparing-eta-extend-button {
      margin-left: auto;
      flex: 0 0 auto;
      min-height: 36px;
      padding: 8px 12px;
      border: 1px solid #d5a24f;
      border-radius: 10px;
      background: #fff5d9;
      color: #7b5009;
      font: inherit;
      font-size: 12px;
      font-weight: 850;
      cursor: pointer;
    }
    .preparing-eta-extend-button:hover {
      background: #ffedbd;
      border-color: #b97e20;
    }
    .preparing-eta-extend-button:disabled {
      opacity: .6;
      cursor: default;
    }
    .preparing-eta-extension-feedback {
      grid-column: 1 / -1;
      margin-top: 2px;
      color: #866b5c;
      font-size: 11px;
      font-style: normal;
    }
    .preparing-eta-extension-feedback.error { color: #a33b30; }
    @media (max-width: 620px) {
      .preparing-eta-ops { flex-wrap: wrap; }
      .preparing-eta-extend-button { width: 100%; margin-left: 42px; }
    }
  `;
  document.head.appendChild(style);
}

function syncButtons(root = document) {
  root.querySelectorAll("article.panel.order").forEach((card) => {
    if (card.classList.contains("customer-order-card")) return;
    const timer = card.querySelector(":scope > .preparing-eta-ops");
    const canExtend =
      timer?.classList.contains("active") || timer?.classList.contains("overdue");
    const existing = card.querySelector(".preparing-eta-extend-button");

    if (!timer || !canExtend) {
      existing?.remove();
      card.querySelector(".preparing-eta-extension-feedback")?.remove();
      return;
    }

    if (existing) return;
    const orderId = orderIdFromCard(card);
    if (!Number.isSafeInteger(orderId) || orderId < 1) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "preparing-eta-extend-button";
    button.textContent = "+5 menit";
    button.setAttribute("aria-label", `Tambah 5 menit estimasi pesanan WB${String(orderId).padStart(6, "0")}`);

    button.addEventListener("click", async () => {
      if (button.disabled) return;
      button.disabled = true;
      button.textContent = "Menambah…";
      card.querySelector(".preparing-eta-extension-feedback")?.remove();
      try {
        const response = await fetch("/api/preparing-eta/extend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
          cache: "no-store",
          credentials: "same-origin",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal menambah waktu");
        const feedback = document.createElement("span");
        feedback.className = "preparing-eta-extension-feedback";
        feedback.textContent = `Estimasi ditambah 5 menit · total tambahan ${Number(data.extraMinutes || 0)} menit`;
        timer.querySelector(".preparing-eta-ops-copy")?.appendChild(feedback);
        button.textContent = "+5 menit";
        window.dispatchEvent(new Event("warkost:realtime-recovered"));
      } catch (error) {
        const feedback = document.createElement("span");
        feedback.className = "preparing-eta-extension-feedback error";
        feedback.textContent = error.message || "Gagal menambah waktu";
        timer.querySelector(".preparing-eta-ops-copy")?.appendChild(feedback);
        button.textContent = "Coba +5 menit";
      } finally {
        button.disabled = false;
      }
    });

    timer.appendChild(button);
  });
}

export default function AdminEtaExtensionRuntime() {
  useEffect(() => {
    installStyles();
    let scheduled = false;
    const run = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        syncButtons(document);
      });
    };
    syncButtons(document);
    const observer = new MutationObserver(run);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => {
      observer.disconnect();
      document.querySelectorAll(".preparing-eta-extend-button").forEach((node) => node.remove());
      document.getElementById(STYLE_ID)?.remove();
    };
  }, []);
  return null;
}
