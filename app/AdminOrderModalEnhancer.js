"use client";

import { useEffect } from "react";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const money = (value) =>
  `Rp${Number(value || 0).toLocaleString("id-ID")}`;

const methodLabel = (method) => {
  if (["COD", "CASH"].includes(String(method || "").toUpperCase())) {
    return ["COD", "Tunai saat diterima"];
  }
  if (method === "QRIS") return ["QRIS", "Pembayaran QRIS"];
  if (method === "BANK_TRANSFER") return ["Transfer", "Transfer bank"];
  return [method || "—", "Media pembayaran"];
};

const stationLabel = (station) =>
  station === "KITCHEN"
    ? "Dapur"
    : station === "CASHIER"
      ? "Admin · minuman"
      : station || "";

const ORDER_STEPS = [
  ["PENDING", "Pesanan masuk"],
  ["CONFIRMED", "Dikonfirmasi"],
  ["PREPARING", "Disiapkan"],
  ["READY", "Siap antar"],
  ["ASSIGNED", "Driver mengambil"],
  ["PICKED_UP", "Pickup"],
  ["ON_DELIVERY", "Dalam pengantaran"],
  ["DELIVERED", "Selesai"],
];

const orderIdFromCard = (card) => {
  const text = card?.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
};

const displayOrderId = (id) => `WB${String(id).padStart(6, "0")}`;

export default function AdminOrderModalEnhancer() {
  useEffect(() => {
    let modal = null;
    let previousOverflow = "";
    let requestToken = 0;

    const closeModal = () => {
      requestToken += 1;
      modal?.remove();
      modal = null;
      document.body.classList.remove("admin-order-modal-open");
      document.body.style.overflow = previousOverflow;
    };

    const renderLoadingModal = (id) => {
      closeModal();
      previousOverflow = document.body.style.overflow;
      modal = document.createElement("div");
      modal.className = "admin-order-modal-overlay is-visible";
      modal.innerHTML = `
        <section class="admin-order-modal" role="dialog" aria-modal="true" aria-labelledby="admin-modal-title">
          <header class="admin-order-modal-header">
            <div>
              <small>DETAIL PESANAN</small>
              <h2 id="admin-modal-title">#${escapeHtml(displayOrderId(id))}</h2>
            </div>
            <button type="button" class="admin-order-modal-close" aria-label="Tutup detail">×</button>
          </header>
          <div class="admin-order-modal-body">
            <div class="admin-modal-loading">
              <span></span>
              <strong>Memuat rincian pesanan…</strong>
            </div>
          </div>
        </section>
      `;
      modal.querySelector(".admin-order-modal-close")?.addEventListener("click", closeModal);
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });
      document.body.appendChild(modal);
      document.body.classList.add("admin-order-modal-open");
      document.body.style.overflow = "hidden";
    };

    const fetchJson = async (url) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`Gagal memuat data (${response.status})`);
        }
        return await response.json();
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Waktu memuat detail habis. Silakan coba lagi.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const buildTimeline = (status, events = []) => {
      const currentIndex = ORDER_STEPS.findIndex(([key]) => key === status);
      const eventMap = new Map(
        events.map((event) => [String(event.next_status || "").toUpperCase(), event.created_at || ""]),
      );
      return ORDER_STEPS.map(([key, label], index) => {
        const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        const marker = index < currentIndex ? "✓" : index + 1;
        const time = eventMap.get(key) || (index === currentIndex ? "Status saat ini" : "");
        return `
          <div class="admin-modal-step ${state}">
            <span>${marker}</span>
            <div>
              <strong>${escapeHtml(label)}</strong>
              ${time ? `<small>${escapeHtml(time)}</small>` : ""}
            </div>
          </div>
        `;
      }).join("");
    };

    const buildModalContent = (order, details) => {
      if (!modal) return;
      const [methodShort, methodLong] = methodLabel(order.method);
      const items = details?.items || [];
      const events = details?.events || [];
      const status = String(order.status || "PENDING").toUpperCase();
      const itemsMarkup = items.length
        ? items.map((item) => `
            <div class="admin-modal-item">
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.quantity)}×${item.prep_station ? ` · ${escapeHtml(stationLabel(item.prep_station))}` : ""}</small>
              </div>
              <strong>${escapeHtml(money(Number(item.price || 0) * Number(item.quantity || 0)))}</strong>
            </div>
          `).join("")
        : '<div class="admin-modal-empty">Belum ada item pesanan.</div>';

      const stationChips = [
        order.kitchen_status ? `Dapur · ${order.kitchen_status}` : "",
        order.cashier_status ? `Admin minuman · ${order.cashier_status}` : "",
      ].filter(Boolean).map((label) => `<span>${escapeHtml(label)}</span>`).join("");

      const body = modal.querySelector(".admin-order-modal-body");
      if (!body) return;
      body.innerHTML = `
        <div class="admin-modal-top-grid">
          <section class="admin-modal-summary-card">
            <small>STATUS PESANAN</small>
            <div class="admin-modal-status-row">
              <strong>${escapeHtml(status.replaceAll("_", " "))}</strong>
              <span>${escapeHtml(order.payment_status || "—")}</span>
            </div>
            <div class="admin-modal-money-row">
              <div><small>Total</small><strong>${escapeHtml(money(order.total))}</strong></div>
              <div><small>Media bayar</small><strong>${escapeHtml(methodShort)}</strong><em>${escapeHtml(methodLong)}</em></div>
            </div>
            ${stationChips ? `<div class="admin-modal-stations">${stationChips}</div>` : ""}
          </section>

          <section class="admin-modal-customer-card">
            <small>PELANGGAN</small>
            <strong>${escapeHtml(order.customer_name || "Pelanggan")}</strong>
            <span>${escapeHtml(order.address || "Alamat belum tersedia")}</span>
            <button type="button" class="admin-modal-message-button" disabled>Kirim pesan ke customer</button>
            <p>Chat internal akan aktif setelah backend komunikasi selesai.</p>
          </section>
        </div>

        <section class="admin-modal-section">
          <div class="admin-modal-section-heading">
            <div><small>RINGKASAN</small><h3>Item pesanan (${items.length})</h3></div>
          </div>
          <div class="admin-modal-items">${itemsMarkup}</div>
          <div class="admin-modal-total"><span>Total pesanan</span><strong>${escapeHtml(money(order.total))}</strong></div>
        </section>

        <section class="admin-modal-section">
          <div class="admin-modal-section-heading">
            <div><small>PROGRESS</small><h3>Perjalanan pesanan</h3></div>
          </div>
          <div class="admin-modal-timeline">${buildTimeline(status, events)}</div>
        </section>
      `;
    };

    const openModal = async (card) => {
      const id = orderIdFromCard(card);
      if (!id) return;

      // renderLoadingModal closes any previous modal and advances requestToken.
      // Capture the token only after the new modal exists so the response is not discarded.
      renderLoadingModal(id);
      const token = requestToken;

      try {
        const [ordersData, detailsData] = await Promise.all([
          fetchJson("/api/orders"),
          fetchJson(`/api/order-items?id=${encodeURIComponent(id)}`),
        ]);
        if (token !== requestToken || !modal) return;
        const order = (ordersData.orders || []).find((item) => Number(item.id) === id);
        if (!order) throw new Error("Pesanan tidak ditemukan");
        buildModalContent(order, detailsData);
      } catch (error) {
        if (token !== requestToken || !modal) return;
        const body = modal.querySelector(".admin-order-modal-body");
        if (body) {
          body.innerHTML = `<div class="admin-modal-error"><strong>Detail belum dapat dimuat.</strong><span>${escapeHtml(error.message)}</span></div>`;
        }
      }
    };

    const onClickCapture = (event) => {
      if (!document.body.classList.contains("admin-operations-view")) return;
      const button = event.target.closest("button");
      if (!button) return;
      const card = button.closest("main .order-list .order");
      if (!card) return;
      const text = button.textContent.trim();
      const isDetailButton = button.classList.contains("admin-card-detail-button") || /lihat\s+(item\s*&\s*riwayat|detail)/i.test(text);
      if (!isDetailButton || /tutup/i.test(text)) return;

      event.preventDefault();
      event.stopPropagation();
      if (typeof event.stopImmediatePropagation === "function") event.stopImmediatePropagation();
      openModal(card);
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && modal) closeModal();
    };

    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("click", onClickCapture, true);
      window.removeEventListener("keydown", onKeyDown);
      closeModal();
    };
  }, []);

  return null;
}
