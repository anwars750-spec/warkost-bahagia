"use client";

import { useEffect } from "react";

const RELOAD_EVENTS = new Set([
  "ORDER_CREATED",
  "ORDER_AUTO_CONFIRMED",
  "ORDER_STATUS_CHANGED",
  "KITCHEN_ORDER_CREATED",
  "STATION_STATUS_CHANGED",
]);

function orderIdFromText(value) {
  const text = String(value || "");
  const warkost = text.match(/WB0*(\d+)/i);
  if (warkost) return Number(warkost[1]);
  const hash = text.match(/#\s*(\d+)/);
  return hash ? Number(hash[1]) : null;
}

function etaMap(data) {
  return new Map(
    (data?.orders || []).map((order) => [Number(order.orderId), order]),
  );
}

function minuteLabel(seconds, overdue = false) {
  const safeSeconds = Math.max(0, Number(seconds || 0));
  if (safeSeconds < 60) return overdue ? "<1 menit" : "<1 menit";
  return `${Math.ceil(safeSeconds / 60)} menit`;
}

function readyTimeLabel(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function liveSnapshot(order, serverOffsetMs) {
  if (!order?.estimatedReadyAt) return order;
  const deadline = Date.parse(order.estimatedReadyAt);
  if (!Number.isFinite(deadline)) return order;
  const now = Date.now() + serverOffsetMs;
  const deltaMs = deadline - now;
  return {
    ...order,
    state: deltaMs < 0 ? "OVERDUE" : "PREPARING",
    remainingSeconds: Math.max(0, Math.ceil(deltaMs / 1000)),
    overdueSeconds: Math.max(0, Math.floor(-deltaMs / 1000)),
    overdue: deltaMs < 0,
  };
}

function customerCopy(order) {
  if (!order) return null;
  if (order.state === "WAITING_START")
    return {
      tone: "waiting",
      title: `Estimasi persiapan ±${order.defaultMinutes} menit`,
      detail: "Hitung mundur dimulai saat pesanan mulai disiapkan.",
    };
  if (order.state === "PREPARING")
    return {
      tone: "active",
      title: `Estimasi siap ${readyTimeLabel(order.estimatedReadyAt)} WIB`,
      detail: `Sisa sekitar ${minuteLabel(order.remainingSeconds)}.`,
    };
  if (order.state === "OVERDUE")
    return {
      tone: "overdue",
      title: "Persiapan melewati estimasi",
      detail: `Lewat sekitar ${minuteLabel(order.overdueSeconds, true)}. Status tetap diperbarui secara realtime.`,
    };
  return null;
}

function ensureCustomerBanner(container, order) {
  if (!container) return;
  const existing = container.querySelector(":scope > .preparing-eta-banner");
  const copy = customerCopy(order);
  if (!copy) {
    existing?.remove();
    return;
  }
  const banner = existing || document.createElement("div");
  banner.className = `preparing-eta-banner ${copy.tone}`;
  banner.dataset.etaOrder = String(order.orderId);
  banner.setAttribute("role", "status");
  banner.innerHTML = `<span class="preparing-eta-icon" aria-hidden="true">◷</span><span><strong></strong><small></small></span>`;
  banner.querySelector("strong").textContent = copy.title;
  banner.querySelector("small").textContent = copy.detail;
  if (!existing) {
    const progress = container.querySelector(".order-progress");
    if (progress) progress.insertAdjacentElement("afterend", banner);
    else container.appendChild(banner);
  }
}

function applyCustomer(map, serverOffsetMs) {
  const tracking = document.querySelector(".customer-tracking");
  if (tracking) {
    const orderId = orderIdFromText(
      tracking.querySelector(".tracking-order-number strong")?.textContent,
    );
    const container = tracking.querySelector(".delivery-status-card");
    ensureCustomerBanner(
      container,
      orderId ? liveSnapshot(map.get(orderId), serverOffsetMs) : null,
    );
  }

  document.querySelectorAll(".customer-order-card").forEach((card) => {
    const orderId = orderIdFromText(
      card.querySelector(".customer-order-meta strong")?.textContent,
    );
    ensureCustomerBanner(
      card,
      orderId ? liveSnapshot(map.get(orderId), serverOffsetMs) : null,
    );
  });
}

function applyKitchen(map, serverOffsetMs) {
  document.querySelectorAll(".kitchen-order-card").forEach((card) => {
    const orderId = orderIdFromText(
      card.querySelector(".kitchen-order-topline strong")?.textContent,
    );
    const chip = card.querySelector(".kitchen-time-chip");
    if (!orderId || !chip) return;
    const order = map.get(orderId);
    const station = order?.stations?.find((item) => item.station === "KITCHEN");
    if (!station) return;

    let label = `ETA ±${order.defaultMinutes} menit`;
    let urgent = false;
    if (station.status === "READY") label = "Siap";
    else if (station.status === "PREPARING" && station.estimatedReadyAt) {
      const live = liveSnapshot(
        {
          ...station,
          state: station.overdue ? "OVERDUE" : "PREPARING",
        },
        serverOffsetMs,
      );
      if (live.state === "OVERDUE") {
        urgent = true;
        label = `Lewat ${minuteLabel(live.overdueSeconds, true)}`;
      } else label = `Sisa ${minuteLabel(live.remainingSeconds)}`;
    }

    chip.classList.toggle("urgent", urgent);
    for (const node of [...chip.childNodes])
      if (node.nodeType === Node.TEXT_NODE) node.remove();
    let value = chip.querySelector("[data-preparing-eta-value]");
    if (!value) {
      value = document.createElement("span");
      value.dataset.preparingEtaValue = "true";
      chip.appendChild(value);
    }
    value.textContent = label;
  });
}

function clearInjectedUi() {
  document
    .querySelectorAll(".preparing-eta-banner")
    .forEach((element) => element.remove());
}

export default function PreparingEtaRuntime() {
  useEffect(() => {
    let disposed = false;
    let role = null;
    let currentMap = new Map();
    let serverOffsetMs = 0;
    let poll = null;
    let tick = null;

    const apply = () => {
      if (disposed) return;
      if (role === "CUSTOMER") applyCustomer(currentMap, serverOffsetMs);
      if (role === "KITCHEN") applyKitchen(currentMap, serverOffsetMs);
    };

    const loadEta = async () => {
      if (!role || !["CUSTOMER", "KITCHEN"].includes(role)) return;
      try {
        const response = await fetch("/api/preparing-eta", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (disposed) return;
        currentMap = etaMap(data);
        serverOffsetMs = Number(data.serverNowMs || Date.now()) - Date.now();
        apply();
      } catch {}
    };

    const detectRole = async () => {
      try {
        const response = await fetch("/api/me", {
          cache: "no-store",
          credentials: "same-origin",
        });
        if (!response.ok) return;
        const data = await response.json();
        if (disposed) return;
        role = data.user?.role || null;
        currentMap = new Map();
        clearInjectedUi();
        if (["CUSTOMER", "KITCHEN"].includes(role)) await loadEta();
      } catch {}
    };

    const onRealtime = (event) => {
      if (RELOAD_EVENTS.has(event.detail?.type)) void loadEta();
    };
    const onSessionStarted = () => void detectRole();
    const onSessionEnded = () => {
      role = null;
      currentMap = new Map();
      clearInjectedUi();
    };

    void detectRole();
    poll = window.setInterval(() => void loadEta(), 60_000);
    tick = window.setInterval(apply, 1_000);
    window.addEventListener("warkost:realtime", onRealtime);
    window.addEventListener("warkost:realtime-recovered", loadEta);
    window.addEventListener("warkost:session-started", onSessionStarted);
    window.addEventListener("warkost:session-ended", onSessionEnded);
    window.addEventListener("warkost:session-invalidated", onSessionEnded);

    return () => {
      disposed = true;
      if (poll) window.clearInterval(poll);
      if (tick) window.clearInterval(tick);
      window.removeEventListener("warkost:realtime", onRealtime);
      window.removeEventListener("warkost:realtime-recovered", loadEta);
      window.removeEventListener("warkost:session-started", onSessionStarted);
      window.removeEventListener("warkost:session-ended", onSessionEnded);
      window.removeEventListener("warkost:session-invalidated", onSessionEnded);
      clearInjectedUi();
    };
  }, []);

  return null;
}
