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
  const normalized = String(method || "").toUpperCase();
  if (["COD", "CASH"].includes(normalized)) {
    return ["COD", "Tunai saat diterima"];
  }
  if (normalized === "QRIS") return ["QRIS", "Pembayaran QRIS"];
  if (normalized === "BANK_TRANSFER") return ["Transfer", "Transfer bank"];
  return [method || "—", "Media pembayaran"];
};

const stationLabel = (station) =>
  station === "KITCHEN"
    ? "Dapur"
    : station === "CASHIER"
      ? "Admin minuman"
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

const formatDateTime = (value) => {
  if (!value) return "Belum tersedia";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date).replace(" pukul", " ·");
};

const statusTone = (value) =>
  String(value || "default")
    .toLowerCase()
    .replaceAll("_", "-")
    .replace(/[^a-z0-9-]/g, "");

const deliverySummary = (status) => {
  const current = String(status || "PENDING").toUpperCase();
  if (["PENDING", "CONFIRMED", "PREPARING"].includes(current)) return "Belum siap untuk driver";
  if (current === "READY") return "Menunggu driver mengambil pesanan";
  if (current === "ASSIGNED") return "Driver sudah mengambil tugas";
  if (current === "PICKED_UP") return "Pesanan sudah diambil driver";
  if (current === "ON_DELIVERY") return "Pesanan sedang menuju pelanggan";
  if (current === "DELIVERED") return "Pesanan telah diterima pelanggan";
  return current.replaceAll("_", " ");
};

const settlementMeta = (status) => {
  const normalized = String(status || "AWAITING_COD_SETTLEMENT").toUpperCase();
  const map = {
    AWAITING_COD_SETTLEMENT: {
      label: "Menunggu setoran",
      tone: "waiting",
      description: "Driver belum menyerahkan tunai COD ke Admin.",
    },
    SUBMITTED: {
      label: "Siap diverifikasi",
      tone: "submitted",
      description: "Tunai sudah dicatat Driver dan menunggu verifikasi Admin.",
    },
    NEEDS_REVIEW: {
      label: "Perlu koreksi",
      tone: "review",
      description: "Nominal setoran tidak sama dengan tagihan. Pembayaran tetap UNPAID.",
    },
    VERIFIED: {
      label: "Terverifikasi",
      tone: "verified",
      description: "Setoran COD sudah cocok dan pembayaran telah dikonfirmasi.",
    },
  };
  return {
    status: normalized,
    ...(map[normalized] || {
      label: normalized.replaceAll("_", " "),
      tone: "waiting",
      description: "Status setoran COD sedang diproses.",
    }),
  };
};

const discrepancyCopy = (value) => {
  const amount = Number(value || 0);
  if (amount === 0) return { label: "Cocok", value: "Rp0", tone: "match" };
  return {
    label: amount < 0 ? "Kurang" : "Lebih",
    value: money(Math.abs(amount)),
    tone: "mismatch",
  };
};

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
            <div class="admin-order-modal-heading">
              <small>DETAIL PESANAN</small>
              <h2 id="admin-modal-title">#${escapeHtml(displayOrderId(id))}</h2>
              <p id="admin-modal-meta">Memuat informasi pesanan…</p>
            </div>
            <button type="button" class="admin-order-modal-close" aria-label="Tutup detail">×</button>
          </header>
          <div class="admin-order-modal-body">
            <div class="admin-modal-loading">
              <span></span>
              <strong>Memuat rincian pesanan…</strong>
              <small>Menyiapkan informasi transaksi dan perjalanan order.</small>
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
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `Gagal memuat data (${response.status})`);
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

    const postJson = async (url, payload) => {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || `Gagal memproses data (${response.status})`);
        }
        return data;
      } catch (error) {
        if (error?.name === "AbortError") {
          throw new Error("Proses verifikasi terlalu lama. Silakan coba lagi.");
        }
        throw error;
      } finally {
        window.clearTimeout(timeout);
      }
    };

    const buildTimeline = (status, events = []) => {
      const currentIndex = Math.max(
        0,
        ORDER_STEPS.findIndex(([key]) => key === status),
      );
      const eventMap = new Map(
        events.map((event) => [String(event.next_status || "").toUpperCase(), event.created_at || ""]),
      );
      return ORDER_STEPS.map(([key, label], index) => {
        const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "upcoming";
        const marker = index < currentIndex ? "✓" : index + 1;
        const time = eventMap.get(key) || (index === currentIndex ? "Status saat ini" : "");
        return `
          <div class="admin-modal-step ${state}">
            <span class="admin-modal-step-marker">${marker}</span>
            <div class="admin-modal-step-copy">
              <strong>${escapeHtml(label)}</strong>
              ${time ? `<small>${escapeHtml(formatDateTime(time))}</small>` : ""}
            </div>
          </div>
        `;
      }).join("");
    };

    const buildSettlementPanel = (order) => {
      const method = String(order.method || "").toUpperCase();
      const status = String(order.status || "").toUpperCase();
      if (!["CASH", "COD"].includes(method) || status !== "DELIVERED") return "";

      const meta = settlementMeta(order.settlement_status);
      const expected = Number(order.expected_amount ?? order.payment_amount ?? order.total ?? 0);
      const submitted = order.cash_amount == null ? null : Number(order.cash_amount);
      const discrepancy = discrepancyCopy(order.discrepancy_amount);
      const driverLabel = order.driver_id ? `Driver #${Number(order.driver_id)}` : "Belum tersedia";
      const verifierLabel = order.admin_verifier_id
        ? `Admin #${Number(order.admin_verifier_id)}`
        : "Belum diverifikasi";
      const canVerify = meta.status === "SUBMITTED";
      const correctionNote = meta.status === "NEEDS_REVIEW"
        ? '<div class="admin-cod-settlement-alert"><strong>Setoran perlu diperbaiki</strong><span>Driver harus mengirim ulang nominal yang sesuai sebelum Admin dapat menyelesaikan verifikasi.</span></div>'
        : "";

      return `
        <section class="admin-modal-panel admin-cod-settlement-panel" data-settlement-status="${escapeHtml(meta.status)}">
          <div class="admin-cod-settlement-heading">
            <div>
              <small>SETORAN COD</small>
              <h3>Rekonsiliasi tunai</h3>
            </div>
            <span class="admin-cod-settlement-status ${escapeHtml(meta.tone)}">${escapeHtml(meta.label)}</span>
          </div>

          <p class="admin-cod-settlement-description">${escapeHtml(meta.description)}</p>

          <div class="admin-cod-settlement-amounts">
            <div class="admin-cod-amount-card">
              <span>Tagihan COD</span>
              <strong>${escapeHtml(money(expected))}</strong>
              <small>Nominal dari sistem</small>
            </div>
            <div class="admin-cod-amount-card">
              <span>Setoran Driver</span>
              <strong>${submitted == null ? "—" : escapeHtml(money(submitted))}</strong>
              <small>${submitted == null ? "Belum diserahkan" : "Tunai tercatat"}</small>
            </div>
            <div class="admin-cod-amount-card ${escapeHtml(discrepancy.tone)}">
              <span>Selisih</span>
              <strong>${escapeHtml(discrepancy.value)}</strong>
              <small>${escapeHtml(discrepancy.label)}</small>
            </div>
          </div>

          ${correctionNote}

          <div class="admin-cod-settlement-meta">
            <div><span>Driver</span><strong>${escapeHtml(driverLabel)}</strong></div>
            <div><span>Waktu setoran</span><strong>${escapeHtml(order.submitted_at ? formatDateTime(order.submitted_at) : "Belum ada")}</strong></div>
            <div><span>Referensi</span><strong>${escapeHtml(order.evidence_reference || "Tidak ada")}</strong></div>
            <div><span>Verifikator</span><strong>${escapeHtml(verifierLabel)}</strong></div>
            ${order.verified_at ? `<div><span>Waktu verifikasi</span><strong>${escapeHtml(formatDateTime(order.verified_at))}</strong></div>` : ""}
          </div>

          <div class="admin-cod-settlement-feedback" role="status" aria-live="polite"></div>

          ${canVerify ? `
            <button type="button" class="admin-cod-settlement-verify" data-order-id="${Number(order.id)}">
              <span aria-hidden="true">✓</span>
              Verifikasi setoran COD
            </button>
          ` : ""}
        </section>
      `;
    };

    const buildModalContent = (order, details) => {
      if (!modal) return;
      const [methodShort, methodLong] = methodLabel(order.method);
      const items = details?.items || [];
      const events = details?.events || [];
      const status = String(order.status || "PENDING").toUpperCase();
      const paymentStatus = String(order.payment_status || "—").toUpperCase();
      const createdAt = order.created_at || order.createdAt || events?.[0]?.created_at || "";
      const customerName = order.customer_name || "Pelanggan";
      const customerInitial = String(customerName).trim().charAt(0).toUpperCase() || "P";

      const itemsMarkup = items.length
        ? items.map((item, index) => `
            <div class="admin-modal-item">
              <div class="admin-modal-item-index">${index + 1}</div>
              <div class="admin-modal-item-copy">
                <strong>${escapeHtml(item.name)}</strong>
                <small>${escapeHtml(item.quantity)} × ${escapeHtml(money(item.price))}${item.prep_station ? ` · ${escapeHtml(stationLabel(item.prep_station))}` : ""}</small>
              </div>
              <strong class="admin-modal-item-price">${escapeHtml(money(Number(item.price || 0) * Number(item.quantity || 0)))}</strong>
            </div>
          `).join("")
        : '<div class="admin-modal-empty">Belum ada item pesanan.</div>';

      const stations = [
        order.kitchen_status ? ["Dapur", order.kitchen_status] : null,
        order.cashier_status ? ["Admin minuman", order.cashier_status] : null,
      ].filter(Boolean);

      const stationRows = stations.length
        ? stations.map(([label, value]) => `
            <div class="admin-modal-operation-row">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(String(value).replaceAll("_", " "))}</strong>
            </div>
          `).join("")
        : '<div class="admin-modal-operation-row muted"><span>Station</span><strong>Belum tersedia</strong></div>';

      const settlementPanel = buildSettlementPanel(order);

      const headerMeta = modal.querySelector("#admin-modal-meta");
      if (headerMeta) {
        headerMeta.textContent = `${customerName} · ${formatDateTime(createdAt)}`;
      }

      const body = modal.querySelector(".admin-order-modal-body");
      if (!body) return;
      body.innerHTML = `
        <section class="admin-modal-hero">
          <div class="admin-modal-hero-copy">
            <small>STATUS ORDER</small>
            <div class="admin-modal-status-stack">
              <span class="admin-modal-status-pill status-${escapeHtml(statusTone(status))}">${escapeHtml(status.replaceAll("_", " "))}</span>
              <span class="admin-modal-payment-pill payment-${escapeHtml(statusTone(paymentStatus))}">${escapeHtml(paymentStatus)}</span>
            </div>
            <p>${escapeHtml(deliverySummary(status))}</p>
          </div>
          <div class="admin-modal-hero-total">
            <small>TOTAL PESANAN</small>
            <strong>${escapeHtml(money(order.total))}</strong>
            <span>${escapeHtml(methodShort)} · ${escapeHtml(methodLong)}</span>
          </div>
        </section>

        <div class="admin-modal-content-grid">
          <div class="admin-modal-main-column">
            <section class="admin-modal-panel admin-modal-items-panel">
              <div class="admin-modal-panel-heading">
                <div>
                  <small>RINGKASAN ORDER</small>
                  <h3>Item pesanan</h3>
                </div>
                <span>${items.length} item</span>
              </div>
              <div class="admin-modal-items">${itemsMarkup}</div>
              <div class="admin-modal-total-row">
                <div>
                  <span>Total transaksi</span>
                  <small>${escapeHtml(methodShort)} · ${escapeHtml(paymentStatus)}</small>
                </div>
                <strong>${escapeHtml(money(order.total))}</strong>
              </div>
            </section>

            <section class="admin-modal-panel admin-modal-progress-panel">
              <div class="admin-modal-panel-heading">
                <div>
                  <small>PROGRESS PESANAN</small>
                  <h3>Perjalanan order</h3>
                </div>
                <span class="admin-modal-current-state">${escapeHtml(status.replaceAll("_", " "))}</span>
              </div>
              <div class="admin-modal-timeline">${buildTimeline(status, events)}</div>
            </section>
          </div>

          <aside class="admin-modal-side-column">
            <section class="admin-modal-panel admin-modal-customer-panel">
              <div class="admin-modal-customer-head">
                <div class="admin-modal-avatar">${escapeHtml(customerInitial)}</div>
                <div>
                  <small>PELANGGAN</small>
                  <strong>${escapeHtml(customerName)}</strong>
                </div>
              </div>
              <div class="admin-modal-address-block">
                <small>ALAMAT PENGIRIMAN</small>
                <span>${escapeHtml(order.address || "Alamat belum tersedia")}</span>
              </div>
              <button type="button" class="admin-modal-message-button" disabled>
                <span class="admin-modal-message-icon" aria-hidden="true">↗</span>
                Kirim pesan ke customer
              </button>
              <p class="admin-modal-backend-note">Chat internal siap dihubungkan saat backend komunikasi selesai.</p>
            </section>

            <section class="admin-modal-panel admin-modal-operations-panel">
              <div class="admin-modal-panel-heading compact">
                <div>
                  <small>OPERASIONAL</small>
                  <h3>Status penanganan</h3>
                </div>
              </div>
              <div class="admin-modal-operation-list">
                ${stationRows}
                <div class="admin-modal-operation-row">
                  <span>Pengiriman</span>
                  <strong>${escapeHtml(deliverySummary(status))}</strong>
                </div>
                <div class="admin-modal-operation-row">
                  <span>Pembayaran</span>
                  <strong>${escapeHtml(methodShort)} · ${escapeHtml(paymentStatus)}</strong>
                </div>
              </div>
            </section>

            ${settlementPanel}
          </aside>
        </div>
      `;

      const verifyButton = body.querySelector(".admin-cod-settlement-verify");
      if (verifyButton) {
        verifyButton.addEventListener("click", async () => {
          const feedback = body.querySelector(".admin-cod-settlement-feedback");
          const originalText = verifyButton.innerHTML;
          verifyButton.disabled = true;
          verifyButton.innerHTML = '<span class="admin-cod-settlement-spinner" aria-hidden="true"></span> Memverifikasi…';
          if (feedback) {
            feedback.className = "admin-cod-settlement-feedback";
            feedback.textContent = "";
          }
          try {
            await postJson("/api/cod-settlement-verify", { orderId: Number(order.id) });
            const ordersData = await fetchJson("/api/orders");
            const updatedOrder = (ordersData.orders || []).find(
              (item) => Number(item.id) === Number(order.id),
            );
            if (!updatedOrder) throw new Error("Pesanan tidak ditemukan setelah verifikasi");
            buildModalContent(updatedOrder, details);
          } catch (error) {
            verifyButton.disabled = false;
            verifyButton.innerHTML = originalText;
            if (feedback) {
              feedback.className = "admin-cod-settlement-feedback error";
              feedback.textContent = error.message || "Setoran belum dapat diverifikasi.";
            }
          }
        });
      }
    };

    const openModal = async (card) => {
      const id = orderIdFromCard(card);
      if (!id) return;

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
          body.innerHTML = `
            <div class="admin-modal-error">
              <strong>Detail belum dapat dimuat.</strong>
              <span>${escapeHtml(error.message)}</span>
              <small>Tutup popup lalu coba buka kembali detail pesanan.</small>
            </div>
          `;
        }
      }
    };

    const onClickCapture = (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      const card = button.closest("main .order-list .order");
      if (!card) return;
      const text = button.textContent.trim();
      const isDetailButton =
        button.classList.contains("admin-card-detail-button") ||
        /(?:lihat|tutup)\s+(?:item\s*&\s*riwayat|detail)/i.test(text);
      if (!isDetailButton) return;

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
