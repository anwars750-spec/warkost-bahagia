"use client";

import { useEffect } from "react";

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const methodLabel = (method) => {
  if (method === "COD") return ["COD", "Tunai saat diterima"];
  if (method === "QRIS") return ["QRIS", "Pembayaran QRIS"];
  if (method === "BANK_TRANSFER") return ["Transfer", "Transfer bank"];
  return [method || "—", method ? "Media pembayaran" : "Memuat media bayar…"];
};

const stationLabel = (station) =>
  station === "KITCHEN"
    ? "Dapur"
    : station === "CASHIER"
      ? "Admin · minuman"
      : station || "";

const orderIdFromCard = (card) => {
  const text = card.querySelector(".order-head small")?.textContent || "";
  const match = text.match(/#(\d+)/);
  return match ? Number(match[1]) : null;
};

const isAdminOperations = () => {
  const hasAdminNav = [...document.querySelectorAll("header.top nav button")].some(
    (button) => button.textContent.trim().startsWith("Operasional"),
  );
  const heading = document.querySelector("main .heading h1")?.textContent?.trim();
  return hasAdminNav && heading === "Pantau pesanan hari ini";
};

export default function AdminOrderCardEnhancer() {
  useEffect(() => {
    const ordersById = new Map();
    const itemCache = new Map();
    const itemPending = new Set();
    let orderRequest = null;
    let timer = null;
    let disposed = false;

    const schedule = (delay = 40) => {
      if (disposed) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(decorate, delay);
    };

    const loadOrders = async () => {
      if (orderRequest) return orderRequest;
      orderRequest = fetch("/api/orders", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error("Gagal memuat ringkasan pesanan");
          const data = await response.json();
          ordersById.clear();
          (data.orders || []).forEach((order) => ordersById.set(Number(order.id), order));
        })
        .catch(() => {})
        .finally(() => {
          orderRequest = null;
          schedule(0);
        });
      return orderRequest;
    };

    const loadItems = async (id) => {
      if (!id || itemCache.has(id) || itemPending.has(id)) return;
      itemPending.add(id);
      try {
        const response = await fetch(`/api/order-items?id=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Gagal memuat item");
        const data = await response.json();
        itemCache.set(id, data.items || []);
      } catch {
        itemCache.set(id, []);
      } finally {
        itemPending.delete(id);
        schedule(0);
      }
    };

    const enhanceDetailMessage = (card) => {
      const customerCard = card.querySelector(
        ":scope > .admin-order-detail-v1 .admin-detail-info-card:first-child",
      );
      if (!customerCard) return;
      const button = customerCard.querySelector("button");
      if (!button) return;
      button.classList.add("admin-customer-message-button");
      if (button.textContent.trim() !== "Kirim pesan ke customer") {
        button.textContent = "Kirim pesan ke customer";
      }
      button.title = "Akan aktif setelah backend chat customer tersedia";

      if (!customerCard.querySelector(".admin-chat-backend-note")) {
        const note = document.createElement("small");
        note.className = "admin-chat-backend-note";
        note.textContent = "Chat internal akan diaktifkan saat backend komunikasi selesai.";
        button.insertAdjacentElement("afterend", note);
      }
    };

    const renderPreview = (card, id) => {
      const order = ordersById.get(id);
      const items = itemCache.get(id);
      const total = card.querySelector(":scope > .line strong")?.textContent?.trim() || "Rp0";
      const paymentStatus =
        card.querySelector(":scope > .line span")?.textContent?.trim() ||
        order?.payment_status ||
        "—";
      const [methodShort, methodLong] = methodLabel(order?.method);
      const statusTone = String(paymentStatus).toUpperCase();

      card.dataset.paymentMethod = order?.method || "";
      card.dataset.paymentStatusV2 = statusTone;

      let preview = card.querySelector(":scope > .admin-card-preview-v2");
      if (!preview) {
        preview = document.createElement("section");
        preview.className = "admin-card-preview-v2";
        const anchor =
          card.querySelector(":scope > .station-statuses") ||
          [...card.querySelectorAll(":scope > button")].find((button) =>
            /detail|riwayat/i.test(button.textContent),
          ) ||
          card.querySelector(":scope > .actions");
        if (anchor) anchor.before(preview);
        else card.appendChild(preview);
      }

      const visibleItems = (items || []).slice(0, 2);
      const remaining = Math.max(0, (items || []).length - visibleItems.length);
      const itemMarkup =
        items === undefined
          ? '<div class="admin-card-loading">Memuat item pesanan…</div>'
          : visibleItems.length
            ? visibleItems
                .map(
                  (item) => `
                    <div class="admin-card-item-row">
                      <div>
                        <strong>${escapeHtml(item.name)}</strong>
                        <small>${escapeHtml(item.quantity)}×${item.prep_station ? ` · ${escapeHtml(stationLabel(item.prep_station))}` : ""}</small>
                      </div>
                      <span>${escapeHtml(
                        "Rp" + Number(item.price * item.quantity || 0).toLocaleString("id-ID"),
                      )}</span>
                    </div>
                  `,
                )
                .join("") +
              (remaining
                ? `<div class="admin-card-more">+${remaining} item lainnya</div>`
                : "")
            : '<div class="admin-card-loading">Belum ada item.</div>';

      const signature = JSON.stringify({
        total,
        paymentStatus,
        methodShort,
        methodLong,
        items: items || null,
      });
      if (preview.dataset.signature === signature) return;
      preview.dataset.signature = signature;

      preview.innerHTML = `
        <div class="admin-card-commerce">
          <div class="admin-card-total">
            <small>Total</small>
            <strong>${escapeHtml(total)}</strong>
          </div>
          <div class="admin-card-payment">
            <small>Media bayar</small>
            <div>
              <span class="admin-card-method">${escapeHtml(methodShort)}</span>
              <span class="admin-card-payment-status">${escapeHtml(paymentStatus)}</span>
            </div>
            <em>${escapeHtml(methodLong)}</em>
          </div>
        </div>
        <div class="admin-card-items-block">
          <div class="admin-card-items-title">
            <strong>Pesanan${items ? ` (${items.length})` : ""}</strong>
          </div>
          ${itemMarkup}
        </div>
      `;
    };

    const decorateCard = (card) => {
      const id = orderIdFromCard(card);
      if (!id) return;

      card.classList.add("admin-order-card", "admin-order-card-v2");
      card.classList.toggle(
        "admin-order-card-v2-expanded",
        Boolean(card.querySelector(":scope > .admin-order-detail-v1")),
      );

      if (!ordersById.has(id)) loadOrders();
      if (!itemCache.has(id)) loadItems(id);
      renderPreview(card, id);
      enhanceDetailMessage(card);

      const detailButton = [...card.querySelectorAll(":scope > button")].find((button) =>
        /detail|riwayat/i.test(button.textContent),
      );
      if (detailButton) {
        detailButton.classList.add("admin-card-detail-button");
        const nextLabel = card.querySelector(":scope > .admin-order-detail-v1")
          ? "Tutup detail"
          : "Lihat detail";
        if (detailButton.textContent.trim() !== nextLabel) {
          detailButton.textContent = nextLabel;
        }
      }
    };

    function decorate() {
      if (!isAdminOperations()) return;

      document.body.classList.add("admin-ui-mode", "admin-operations-view");
      const list = document.querySelector("main .order-list");
      if (!list) return;

      list.classList.add("admin-order-list", "admin-order-list-v2");
      [...list.querySelectorAll(":scope > .order")].forEach(decorateCard);
    }

    loadOrders();
    schedule(0);

    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    const uiHeartbeat = window.setInterval(() => schedule(0), 800);
    const dataHeartbeat = window.setInterval(() => {
      if (!isAdminOperations()) return;
      loadOrders();
      schedule(0);
    }, 10000);

    return () => {
      disposed = true;
      observer.disconnect();
      window.clearInterval(uiHeartbeat);
      window.clearInterval(dataHeartbeat);
      if (timer) window.clearTimeout(timer);
      document
        .querySelector("main .order-list.admin-order-list-v2")
        ?.classList.remove("admin-order-list-v2");
      document.querySelectorAll(".admin-order-card-v2").forEach((card) => {
        card.classList.remove("admin-order-card-v2", "admin-order-card-v2-expanded");
        card.querySelector(":scope > .admin-card-preview-v2")?.remove();
      });
    };
  }, []);

  return null;
}
