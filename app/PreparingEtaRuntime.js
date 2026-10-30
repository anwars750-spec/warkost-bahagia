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

function timestampMs(value) {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/i.test(raw)
    ? raw
    : raw.replace(" ", "T") + "Z";
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimer(seconds) {
  const safe = Math.max(0, Math.floor(Number(seconds || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hours > 0)
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
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

function stationSnapshot(order, stationName, serverOffsetMs) {
  if (!order) return null;
  const station = order.stations?.find((item) => item.station === stationName);
  if (!station) return null;
  if (station.status === "READY")
    return { ...station, state: "COMPLETE", order };

  const now = Date.now() + serverOffsetMs;
  if (station.status === "PREPARING" && station.estimatedReadyAt) {
    const deadline = Date.parse(station.estimatedReadyAt);
    if (Number.isFinite(deadline)) {
      const deltaMs = deadline - now;
      return {
        ...station,
        order,
        state: deltaMs < 0 ? "OVERDUE" : "PREPARING",
        remainingSeconds: Math.max(0, Math.ceil(deltaMs / 1000)),
        overdueSeconds: Math.max(0, Math.floor(-deltaMs / 1000)),
      };
    }
  }

  const createdAt = timestampMs(order.createdAt);
  return {
    ...station,
    order,
    state: "WAITING_START",
    waitingSeconds: Number.isFinite(createdAt)
      ? Math.max(0, Math.floor((now - createdAt) / 1000))
      : 0,
  };
}

function customerCopy(order) {
  if (!order) return null;
  if (order.state === "WAITING_START")
    return {
      tone: "waiting",
      eyebrow: "MENUNGGU PERSIAPAN",
      timer: `±${order.defaultMinutes} menit`,
      detail: "Countdown dimulai saat pesanan mulai disiapkan.",
    };
  if (order.state === "PREPARING")
    return {
      tone: "active",
      eyebrow: "SISA WAKTU PERSIAPAN",
      timer: formatTimer(order.remainingSeconds),
      detail: `Estimasi siap ${readyTimeLabel(order.estimatedReadyAt)} WIB`,
    };
  if (order.state === "OVERDUE")
    return {
      tone: "overdue",
      eyebrow: "MELEWATI ESTIMASI",
      timer: `+${formatTimer(order.overdueSeconds)}`,
      detail: "Tim sedang menyelesaikan pesananmu.",
    };
  return null;
}

function ensureCustomerTimer(container, order) {
  if (!container) return;
  const timers = [...container.querySelectorAll(".preparing-eta-banner")];
  const copy = customerCopy(order);
  if (!copy) {
    timers.forEach((element) => element.remove());
    return;
  }

  let timer = timers.find(
    (element) => element.dataset.etaOrder === String(order.orderId),
  );
  timers.forEach((element) => {
    if (element !== timer) element.remove();
  });

  if (!timer) {
    timer = document.createElement("div");
    timer.dataset.etaOrder = String(order.orderId);
    timer.setAttribute("role", "timer");
    timer.setAttribute("aria-live", "off");
    timer.innerHTML = `
      <span class="preparing-eta-icon" aria-hidden="true">◷</span>
      <span class="preparing-eta-copy">
        <small class="preparing-eta-eyebrow"></small>
        <strong class="preparing-eta-countdown"></strong>
        <small class="preparing-eta-detail"></small>
      </span>`;
    container.appendChild(timer);
  }

  timer.className = `preparing-eta-banner ${copy.tone}`;
  timer.querySelector(".preparing-eta-eyebrow").textContent = copy.eyebrow;
  timer.querySelector(".preparing-eta-countdown").textContent = copy.timer;
  timer.querySelector(".preparing-eta-detail").textContent = copy.detail;
}

function applyCustomer(map, serverOffsetMs) {
  const tracking = document.querySelector(".customer-tracking");
  if (tracking) {
    const orderId = orderIdFromText(
      tracking.querySelector(".tracking-order-number strong")?.textContent,
    );
    const container = tracking.querySelector(".delivery-status-card");
    ensureCustomerTimer(
      container,
      orderId ? liveSnapshot(map.get(orderId), serverOffsetMs) : null,
    );
  }

  document.querySelectorAll(".customer-order-card").forEach((card) => {
    const orderId = orderIdFromText(
      card.querySelector(".customer-order-meta strong")?.textContent,
    );
    ensureCustomerTimer(
      card,
      orderId ? liveSnapshot(map.get(orderId), serverOffsetMs) : null,
    );
  });
}

function operationalCopy(snapshot, label) {
  if (!snapshot || snapshot.state === "COMPLETE") return null;
  if (snapshot.state === "WAITING_START") {
    const urgent = snapshot.waitingSeconds >= snapshot.order.defaultMinutes * 60;
    return {
      tone: urgent ? "overdue" : "waiting",
      label: "Menunggu mulai",
      timer: formatTimer(snapshot.waitingSeconds),
      detail: `${label} belum mulai · target ≤ ${snapshot.order.defaultMinutes}:00`,
    };
  }
  if (snapshot.state === "PREPARING")
    return {
      tone: "active",
      label: "Sisa waktu",
      timer: formatTimer(snapshot.remainingSeconds),
      detail: `Estimasi siap ${readyTimeLabel(snapshot.estimatedReadyAt)} WIB`,
    };
  if (snapshot.state === "OVERDUE")
    return {
      tone: "overdue",
      label: "Lewat estimasi",
      timer: `+${formatTimer(snapshot.overdueSeconds)}`,
      detail: `Segera selesaikan ${label.toLowerCase()}.`,
    };
  return null;
}

function ensureAdminTimer(card, snapshot) {
  const existing = card.querySelector(":scope > .preparing-eta-ops");
  const copy = operationalCopy(snapshot, "Admin minuman");
  if (!copy) {
    existing?.remove();
    return;
  }

  const timer = existing || document.createElement("div");
  timer.className = `preparing-eta-ops ${copy.tone}`;
  timer.setAttribute("role", "timer");
  timer.innerHTML = `
    <span class="preparing-eta-ops-icon" aria-hidden="true">◷</span>
    <span class="preparing-eta-ops-copy">
      <small></small><strong></strong><em></em>
    </span>`;
  timer.querySelector("small").textContent = copy.label;
  timer.querySelector("strong").textContent = copy.timer;
  timer.querySelector("em").textContent = copy.detail;

  if (!existing) {
    const statuses = card.querySelector(".station-statuses");
    if (statuses) statuses.insertAdjacentElement("afterend", timer);
    else card.querySelector(".order-head")?.insertAdjacentElement("afterend", timer);
  }
}

function applyAdmin(map, serverOffsetMs) {
  document.querySelectorAll("article.panel.order").forEach((card) => {
    if (card.classList.contains("customer-order-card")) return;
    const orderId = orderIdFromText(card.querySelector(".order-head small")?.textContent);
    const snapshot = orderId
      ? stationSnapshot(map.get(orderId), "CASHIER", serverOffsetMs)
      : null;
    ensureAdminTimer(card, snapshot);
  });
}

function applyKitchen(map, serverOffsetMs) {
  document.querySelectorAll(".kitchen-order-card").forEach((card) => {
    const orderId = orderIdFromText(
      card.querySelector(".kitchen-order-topline strong")?.textContent,
    );
    const chip = card.querySelector(".kitchen-time-chip");
    if (!orderId || !chip) return;
    const snapshot = stationSnapshot(map.get(orderId), "KITCHEN", serverOffsetMs);
    const copy = operationalCopy(snapshot, "Dapur");

    let label = "Siap";
    let urgent = false;
    if (copy) {
      urgent = copy.tone === "overdue";
      label = `${copy.label} ${copy.timer}`;
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
    .querySelectorAll(".preparing-eta-banner, .preparing-eta-ops")
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
      if (role === "ADMIN") applyAdmin(currentMap, serverOffsetMs);
      if (role === "KITCHEN") applyKitchen(currentMap, serverOffsetMs);
    };

    const loadEta = async () => {
      if (!role || !["CUSTOMER", "ADMIN", "KITCHEN"].includes(role)) return;
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
        if (["CUSTOMER", "ADMIN", "KITCHEN"].includes(role)) await loadEta();
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
