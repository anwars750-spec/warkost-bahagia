"use client";

import { useEffect } from "react";

const ICONS = {
  order: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6"/></svg>`,
  printer: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9V3h12v6"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="7" rx="1"/></svg>`,
  system: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>`,
  check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>`,
};

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const normalize = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

const categoryOf = (message) => {
  const value = String(message || "").toLowerCase();
  if (/printer|cetak|print|thermal|timeout/.test(value)) return "printer";
  if (/pesanan|order|dapur|kitchen|makanan|siap|ready|masak/.test(value)) return "order";
  return "system";
};

const titleOf = (message) => {
  const category = categoryOf(message);
  if (category === "printer") return "Status printer";
  if (category === "order") return "Update dapur";
  return "Informasi sistem";
};

const relativeTime = (value) => {
  if (!value) return "Baru saja";
  const normalized = String(value).replace(" ", "T");
  const date = new Date(normalized.endsWith("Z") ? normalized : normalized + "Z");
  if (Number.isNaN(date.getTime())) return String(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = Math.floor(diff / 60000);
  if (minute < 1) return "Baru saja";
  if (minute < 60) return `${minute} menit lalu`;
  const hour = Math.floor(minute / 60);
  if (hour < 24) return `${hour} jam lalu`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day} hari lalu`;
  return date.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
};

function isKitchenHeader() {
  const nav = document.querySelector("header.top nav");
  if (!nav) return false;
  const labels = Array.from(nav.querySelectorAll("button")).map((button) =>
    normalize(button.textContent),
  );
  return (
    labels.some((label) => label.startsWith("DAPUR")) &&
    labels.some((label) => label.startsWith("PRINTER")) &&
    labels.some((label) => label.startsWith("NOTIFIKASI")) &&
    labels.some((label) => label.startsWith("KELUAR")) &&
    !labels.some((label) => label.startsWith("OPERASIONAL"))
  );
}

export default function KitchenHeaderActions() {
  useEffect(() => {
    let panel = null;
    let anchor = null;
    let notifications = [];
    let unread = 0;
    let loading = false;
    let error = "";
    let filter = "all";
    let controller = null;
    let refreshTimer = null;
    let logoutLayer = null;

    const findNotificationButton = () =>
      Array.from(document.querySelectorAll("header.top nav button")).find((button) =>
        normalize(button.textContent).startsWith("NOTIFIKASI"),
      );

    const findLogoutButton = () =>
      Array.from(document.querySelectorAll("header.top nav button")).find((button) =>
        normalize(button.textContent).startsWith("KELUAR"),
      );

    const syncHeaderState = () => {
      if (!isKitchenHeader()) return;
      const notificationButton = findNotificationButton();
      const logoutButton = findLogoutButton();
      notificationButton?.classList.add("kitchen-header-notification");
      logoutButton?.classList.add("kitchen-header-logout");
      const badge = notificationButton?.querySelector(".notification-count");
      if (badge) {
        badge.textContent = unread > 99 ? "99+" : String(unread);
        badge.style.display = unread > 0 ? "inline-flex" : "none";
      }
    };

    const filtered = () =>
      filter === "unread"
        ? notifications.filter((item) => !item.read_at)
        : notifications;

    const positionPanel = () => {
      if (!panel || !anchor) return;
      const rect = anchor.getBoundingClientRect();
      if (window.innerWidth <= 760) {
        panel.style.left = "12px";
        panel.style.right = "12px";
        panel.style.width = "auto";
        panel.style.top = `${Math.min(rect.bottom + 10, 92)}px`;
      } else {
        const width = 410;
        const right = Math.max(18, window.innerWidth - rect.right);
        panel.style.left = "auto";
        panel.style.right = `${right}px`;
        panel.style.width = `${width}px`;
        panel.style.top = `${rect.bottom + 10}px`;
      }
    };

    const render = () => {
      if (!panel) return;
      const list = filtered();
      panel.innerHTML = `
        <section class="admin-notification-popover-card kitchen-notification-card" role="dialog" aria-label="Notifikasi Kitchen">
          <header class="admin-notification-head">
            <div>
              <small>NOTIFIKASI DAPUR</small>
              <div class="admin-notification-title-row">
                <h2>Notifikasi Kitchen</h2>
                ${unread ? `<span>${unread} baru</span>` : ""}
              </div>
              <p class="kitchen-notification-subtitle">Pesanan makanan, status printer, dan informasi operasional dapur.</p>
            </div>
            ${unread ? `<button type="button" class="admin-notification-mark-all" data-kitchen-notif-mark-all>${ICONS.check}<span>Tandai semua</span></button>` : ""}
          </header>
          <div class="admin-notification-filters" role="tablist" aria-label="Filter notifikasi Kitchen">
            <button type="button" data-kitchen-notif-filter="all" class="${filter === "all" ? "active" : ""}">Semua <span>${notifications.length}</span></button>
            <button type="button" data-kitchen-notif-filter="unread" class="${filter === "unread" ? "active" : ""}">Belum dibaca <span>${unread}</span></button>
          </div>
          <div class="admin-notification-list">
            ${loading ? `
              <div class="admin-notification-state">
                <span class="admin-notification-spinner"></span>
                <strong>Memuat notifikasi dapur...</strong>
              </div>` : error ? `
              <div class="admin-notification-state error">
                <span class="admin-notification-state-icon">${ICONS.system}</span>
                <strong>Notifikasi belum dapat dimuat</strong>
                <p>${esc(error)}</p>
                <button type="button" data-kitchen-notif-retry>Coba lagi</button>
              </div>` : !list.length ? `
              <div class="admin-notification-state">
                <span class="admin-notification-state-icon">${ICONS.system}</span>
                <strong>${filter === "unread" ? "Semua sudah dibaca" : "Belum ada notifikasi"}</strong>
                <p>${filter === "unread" ? "Tidak ada notifikasi baru yang perlu ditangani." : "Pesanan baru dan kendala printer akan muncul di sini."}</p>
              </div>` : list.map((item) => {
                const category = categoryOf(item.message);
                return `
                  <article class="admin-notification-item ${item.read_at ? "read" : "unread"}" data-kitchen-notif-id="${esc(item.id)}">
                    <span class="admin-notification-item-icon ${category}">${ICONS[category] || ICONS.system}</span>
                    <div class="admin-notification-item-body">
                      <div class="admin-notification-item-top">
                        <strong>${esc(titleOf(item.message))}</strong>
                        <time>${esc(relativeTime(item.created_at))}</time>
                      </div>
                      <p>${esc(item.message)}</p>
                      ${!item.read_at ? `<button type="button" data-kitchen-notif-read="${esc(item.id)}">Tandai dibaca</button>` : ""}
                    </div>
                    ${!item.read_at ? `<span class="admin-notification-unread-dot" aria-label="Belum dibaca"></span>` : ""}
                  </article>`;
              }).join("")}
          </div>
          <footer class="kitchen-notification-footer"><span class="kitchen-live-dot"></span>Sinkron otomatis saat panel terbuka</footer>
        </section>
      `;
    };

    const closePanel = () => {
      controller?.abort();
      controller = null;
      if (refreshTimer) clearInterval(refreshTimer);
      refreshTimer = null;
      panel?.remove();
      panel = null;
      anchor?.classList.remove("kitchen-notification-open");
      anchor = null;
    };

    const load = async ({ quiet = false } = {}) => {
      controller?.abort();
      controller = new AbortController();
      if (!quiet) loading = true;
      error = "";
      if (!quiet) render();
      try {
        const response = await fetch("/api/notifications", {
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal memuat notifikasi");
        notifications = Array.isArray(data.notifications) ? data.notifications : [];
        unread = Number.isFinite(Number(data.unread))
          ? Number(data.unread)
          : notifications.filter((item) => !item.read_at).length;
      } catch (loadError) {
        if (loadError.name === "AbortError") return;
        error = loadError.message || "Gagal memuat notifikasi";
      } finally {
        loading = false;
        render();
        syncHeaderState();
      }
    };

    const markRead = async (id) => {
      const target = notifications.find((item) => String(item.id) === String(id));
      if (!target || target.read_at) return;
      try {
        const response = await fetch("/api/notification-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: target.id }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal menandai notifikasi");
        target.read_at = new Date().toISOString();
        unread = Math.max(0, unread - 1);
        render();
        syncHeaderState();
      } catch (markError) {
        error = markError.message || "Gagal menandai notifikasi";
        render();
      }
    };

    const markAll = async () => {
      const pending = notifications.filter((item) => !item.read_at);
      if (!pending.length) return;
      loading = true;
      render();
      try {
        for (const item of pending) {
          const response = await fetch("/api/notification-read", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: item.id }),
          });
          if (!response.ok) throw new Error("Sebagian notifikasi belum berhasil ditandai");
          item.read_at = new Date().toISOString();
        }
        unread = 0;
      } catch (markError) {
        error = markError.message || "Gagal menandai semua notifikasi";
        unread = notifications.filter((item) => !item.read_at).length;
      } finally {
        loading = false;
        render();
        syncHeaderState();
      }
    };

    const openPanel = (button) => {
      closePanel();
      anchor = button;
      anchor.classList.add("kitchen-notification-open");
      panel = document.createElement("div");
      panel.className = "admin-notification-popover kitchen-notification-popover";
      document.body.appendChild(panel);
      positionPanel();
      render();
      void load();
      refreshTimer = setInterval(() => {
        if (panel && document.visibilityState === "visible") void load({ quiet: true });
      }, 5000);
    };

    const closeLogout = () => {
      logoutLayer?.remove();
      logoutLayer = null;
      findLogoutButton()?.classList.remove("kitchen-logout-open");
    };

    const openLogout = (button) => {
      closePanel();
      closeLogout();
      button.classList.add("kitchen-logout-open");
      logoutLayer = document.createElement("div");
      logoutLayer.className = "kitchen-logout-layer";
      logoutLayer.innerHTML = `
        <section class="kitchen-logout-dialog" role="dialog" aria-modal="true" aria-label="Konfirmasi keluar Kitchen">
          <span class="kitchen-logout-icon">${ICONS.logout}</span>
          <div class="kitchen-logout-copy">
            <small>AKHIRI SESI KITCHEN</small>
            <h2>Keluar dari akun Kitchen?</h2>
            <p>Pastikan proses dapur yang sedang berjalan sudah diperbarui sebelum mengakhiri sesi.</p>
          </div>
          <div class="kitchen-logout-error" data-kitchen-logout-error hidden></div>
          <div class="kitchen-logout-actions">
            <button type="button" class="kitchen-logout-cancel" data-kitchen-logout-cancel>Batal</button>
            <button type="button" class="kitchen-logout-confirm" data-kitchen-logout-confirm>Keluar</button>
          </div>
        </section>
      `;
      document.body.appendChild(logoutLayer);
      requestAnimationFrame(() => logoutLayer?.classList.add("open"));
      logoutLayer.querySelector("[data-kitchen-logout-cancel]")?.focus();
    };

    const confirmLogout = async () => {
      if (!logoutLayer) return;
      const confirm = logoutLayer.querySelector("[data-kitchen-logout-confirm]");
      const cancel = logoutLayer.querySelector("[data-kitchen-logout-cancel]");
      const errorBox = logoutLayer.querySelector("[data-kitchen-logout-error]");
      confirm.disabled = true;
      cancel.disabled = true;
      confirm.textContent = "Keluar...";
      if (errorBox) errorBox.hidden = true;
      try {
        const response = await fetch("/api/logout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Gagal keluar dari akun");
        document.body.classList.remove(
          "admin-printer-stable-view",
          "kitchen-dashboard-active",
          "kitchen-dashboard-transition",
          "printer-center-transition",
        );
        window.location.replace("/");
      } catch (logoutError) {
        confirm.disabled = false;
        cancel.disabled = false;
        confirm.textContent = "Keluar";
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = logoutError.message || "Gagal keluar. Coba lagi.";
        }
      }
    };

    const onCapture = (event) => {
      if (!isKitchenHeader()) return;
      const button = event.target.closest?.("header.top nav button");
      if (!button) return;
      const label = normalize(button.textContent);

      if (label.startsWith("NOTIFIKASI")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        if (panel && anchor === button) closePanel();
        else openPanel(button);
        return;
      }

      if (label.startsWith("KELUAR")) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openLogout(button);
      }
    };

    const onClick = (event) => {
      if (panel) {
        const filterButton = event.target.closest?.("[data-kitchen-notif-filter]");
        if (filterButton && panel.contains(filterButton)) {
          filter = filterButton.dataset.kitchenNotifFilter;
          render();
          return;
        }
        const readButton = event.target.closest?.("[data-kitchen-notif-read]");
        if (readButton && panel.contains(readButton)) {
          void markRead(readButton.dataset.kitchenNotifRead);
          return;
        }
        const markAllButton = event.target.closest?.("[data-kitchen-notif-mark-all]");
        if (markAllButton && panel.contains(markAllButton)) {
          void markAll();
          return;
        }
        const retry = event.target.closest?.("[data-kitchen-notif-retry]");
        if (retry && panel.contains(retry)) {
          void load();
          return;
        }
        if (!panel.contains(event.target) && !anchor?.contains(event.target)) closePanel();
      }

      if (logoutLayer) {
        if (event.target.closest?.("[data-kitchen-logout-cancel]")) {
          closeLogout();
          return;
        }
        if (event.target.closest?.("[data-kitchen-logout-confirm]")) {
          void confirmLogout();
          return;
        }
        if (event.target === logoutLayer) closeLogout();
      }
    };

    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (logoutLayer) closeLogout();
      else closePanel();
    };

    const onViewportChange = () => positionPanel();
    const observer = new MutationObserver(syncHeaderState);
    observer.observe(document.body, { childList: true, subtree: true });
    syncHeaderState();

    document.addEventListener("click", onCapture, true);
    document.addEventListener("click", onClick, false);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("scroll", onViewportChange, true);

    return () => {
      observer.disconnect();
      closePanel();
      closeLogout();
      document.removeEventListener("click", onCapture, true);
      document.removeEventListener("click", onClick, false);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("scroll", onViewportChange, true);
    };
  }, []);

  return null;
}
