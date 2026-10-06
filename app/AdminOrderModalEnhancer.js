"use client";

import { useEffect } from "react";

const orderIdFromCard = (card) => {
  const text = card.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? `WB${String(match[1]).padStart(6, "0")}` : "Detail Pesanan";
};

export default function AdminOrderModalEnhancer() {
  useEffect(() => {
    let modal = null;
    let sourceCard = null;
    let timer = null;
    let closingFromModal = false;
    let previousOverflow = "";

    const findToggle = (card) =>
      [...card.querySelectorAll(":scope > button")].find((button) =>
        /detail|riwayat/i.test(button.textContent),
      );

    const removeModal = ({ collapse = false } = {}) => {
      const card = sourceCard;
      modal?.remove();
      modal = null;
      sourceCard = null;
      document.body.classList.remove("admin-order-modal-open");
      document.body.style.overflow = previousOverflow;

      if (collapse && card) {
        const toggle = findToggle(card);
        if (toggle && /tutup/i.test(toggle.textContent)) {
          closingFromModal = true;
          toggle.click();
          window.setTimeout(() => {
            closingFromModal = false;
          }, 120);
        }
      }
    };

    const buildModal = (card) => {
      const detail = card.querySelector(":scope > .admin-order-detail-v1");
      if (!detail) return;

      card.classList.add("admin-order-modalized");
      const orderId = orderIdFromCard(card);
      const paymentSummary = card.querySelector(":scope > .admin-card-preview-v2 .admin-card-commerce");
      const signature = `${detail.textContent}|${paymentSummary?.textContent || ""}`;

      if (modal && sourceCard === card && modal.dataset.signature === signature) return;

      if (modal) removeModal({ collapse: false });
      previousOverflow = document.body.style.overflow;
      sourceCard = card;

      modal = document.createElement("div");
      modal.className = "admin-order-modal-overlay";
      modal.dataset.signature = signature;
      modal.innerHTML = `
        <section class="admin-order-modal" role="dialog" aria-modal="true" aria-label="${orderId}">
          <header class="admin-order-modal-header">
            <div>
              <small>DETAIL PESANAN</small>
              <h2>${orderId}</h2>
            </div>
            <button type="button" class="admin-order-modal-close" aria-label="Tutup detail">×</button>
          </header>
          <div class="admin-order-modal-body"></div>
        </section>
      `;

      const body = modal.querySelector(".admin-order-modal-body");
      if (paymentSummary) {
        const summaryClone = paymentSummary.cloneNode(true);
        summaryClone.classList.add("admin-order-modal-payment-summary");
        body.appendChild(summaryClone);
      }

      const detailClone = detail.cloneNode(true);
      detailClone.classList.add("admin-order-modal-detail");
      body.appendChild(detailClone);

      modal.querySelector(".admin-order-modal-close")?.addEventListener("click", () =>
        removeModal({ collapse: true }),
      );
      modal.addEventListener("click", (event) => {
        if (event.target === modal) removeModal({ collapse: true });
      });

      document.body.appendChild(modal);
      document.body.classList.add("admin-order-modal-open");
      document.body.style.overflow = "hidden";
      window.requestAnimationFrame(() => modal?.classList.add("is-visible"));
    };

    const scan = () => {
      if (!document.body.classList.contains("admin-operations-view")) {
        document.querySelectorAll(".admin-order-modalized").forEach((card) =>
          card.classList.remove("admin-order-modalized"),
        );
        if (modal) removeModal({ collapse: false });
        return;
      }

      const cards = [
        ...document.querySelectorAll("main .order-list .admin-order-card-v2"),
      ];
      cards.forEach((card) => {
        const hasDetail = Boolean(card.querySelector(":scope > .admin-order-detail-v1"));
        card.classList.toggle("admin-order-modalized", hasDetail);
      });

      if (closingFromModal) return;
      const detailedCard = cards.find((card) =>
        card.querySelector(":scope > .admin-order-detail-v1"),
      );

      if (detailedCard) buildModal(detailedCard);
      else if (modal) removeModal({ collapse: false });
    };

    const scheduleScan = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(scan, 60);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && modal) removeModal({ collapse: true });
    };

    scan();
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("keydown", onKeyDown);

    return () => {
      observer.disconnect();
      window.removeEventListener("keydown", onKeyDown);
      if (timer) window.clearTimeout(timer);
      removeModal({ collapse: false });
      document.querySelectorAll(".admin-order-modalized").forEach((card) =>
        card.classList.remove("admin-order-modalized"),
      );
    };
  }, []);

  return null;
}
