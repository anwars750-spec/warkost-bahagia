"use client";

import { useLayoutEffect } from "react";

const VISIBLE_TABS = new Set(["Dashboard", "Pelanggan", "Notifikasi", "Keluar"]);

const MENU_META = {
  Dashboard: { icon: "home" },
  Pelanggan: { icon: "users" },
  Notifikasi: { icon: "bell" },
  Keluar: { icon: "logout" },
};

const ICON_PATHS = {
  home: ["M3 11.5 12 4l9 7.5", "M5.5 10.5V20h13v-9.5", "M9 20v-6h6v6"],
  users: [
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
    "M22 21v-2a4 4 0 0 0-3-3.87",
    "M16 3.13a4 4 0 0 1 0 7.75",
  ],
  bell: [
    "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9",
    "M13.7 21a2 2 0 0 1-3.4 0",
  ],
  logout: [
    "M10 17l5-5-5-5",
    "M15 12H3",
    "M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5",
  ],
};

function normalizeLabel(button) {
  const ownText = [...button.childNodes]
    .filter((node) => node.nodeType === Node.TEXT_NODE)
    .map((node) => node.textContent)
    .join(" ")
    .trim();
  if (ownText) return ownText.replace(/\s+/g, " ");
  return String(button.textContent || "")
    .replace(/\s+/g, " ")
    .replace(/^Rp\s*/i, "")
    .trim();
}

function ownerNavigationSignaturePresent() {
  const buttons = [...document.querySelectorAll("header.top nav button")];
  const labels = new Set(buttons.map(normalizeLabel));
  return (
    labels.has("Dashboard") &&
    labels.has("Pelanggan") &&
    labels.has("Pengaturan") &&
    labels.has("Loyalty") &&
    labels.has("Staf") &&
    labels.has("Audit log") &&
    labels.has("Laporan")
  );
}

function makeIcon(name) {
  const span = document.createElement("span");
  span.className = "owner-nav-icon-v2";
  span.setAttribute("aria-hidden", "true");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  (ICON_PATHS[name] || ICON_PATHS.home).forEach((pathValue) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", pathValue);
    svg.appendChild(path);
  });
  span.appendChild(svg);
  return span;
}

function hasNativeIcon(button) {
  return [...button.children].some((child) => {
    if (child.classList?.contains("owner-nav-icon-v2")) return false;
    return child.tagName?.toLowerCase() === "svg" || Boolean(child.querySelector?.("svg"));
  });
}

function decorate(button, label) {
  button.dataset.ownerNavKey = label;
  button.dataset.ownerNavVisible = VISIBLE_TABS.has(label) ? "true" : "false";
  if (!VISIBLE_TABS.has(label)) return;

  const injectedIcon = button.querySelector(":scope > .owner-nav-icon-v2");
  if (hasNativeIcon(button)) {
    injectedIcon?.remove();
    return;
  }
  if (!injectedIcon) button.prepend(makeIcon(MENU_META[label]?.icon || "home"));
}

export default function OwnerNavigationRuntime() {
  useLayoutEffect(() => {
    let stopped = false;
    let ownerActive = false;
    let verifying = false;
    let logoutTriggered = false;

    const cleanupLegacyRuntime = () => {
      document
        .querySelectorAll(
          ".owner-nav-more-toggle,.owner-nav-more-panel,.owner-nav-mobile-toggle,.owner-nav-mobile-drawer,.owner-nav-mobile-backdrop",
        )
        .forEach((node) => node.remove());
      document.body.classList.remove("owner-nav-more-open", "owner-nav-mobile-open");
    };

    const clearNavigation = () => {
      document.body.classList.remove("owner-navigation-v2-active");
      document.querySelectorAll("header.top nav.owner-nav-v2").forEach((nav) => {
        nav.classList.remove("owner-nav-v2");
        nav.querySelectorAll("button[data-owner-nav-key]").forEach((button) => {
          delete button.dataset.ownerNavKey;
          delete button.dataset.ownerNavVisible;
          button.classList.remove("owner-nav-active");
          button.removeAttribute("aria-current");
          button.querySelector(":scope > .owner-nav-icon-v2")?.remove();
        });
      });
    };

    const triggerExpiredSessionLogout = () => {
      if (logoutTriggered || stopped) return;
      logoutTriggered = true;
      sessionStorage.removeItem("warkost-owner-nav-active");
      const logoutButton = [...document.querySelectorAll("header.top nav button")].find(
        (button) => normalizeLabel(button) === "Keluar",
      );
      logoutButton?.click();
    };

    const setActive = (label) => {
      document
        .querySelectorAll("header.top nav.owner-nav-v2 button[data-owner-nav-visible='true']")
        .forEach((item) => {
          const active = item.dataset.ownerNavKey === label;
          item.classList.toggle("owner-nav-active", active);
          if (active) item.setAttribute("aria-current", "page");
          else item.removeAttribute("aria-current");
        });
      if (VISIBLE_TABS.has(label) && label !== "Keluar" && label !== "Notifikasi") {
        sessionStorage.setItem("warkost-owner-nav-active", label);
      }
    };

    const sync = () => {
      if (!ownerActive) {
        clearNavigation();
        return;
      }

      const header = document.querySelector("header.top");
      const nav = header?.querySelector("nav");
      if (!header || !nav) return;

      cleanupLegacyRuntime();
      document.body.classList.add("owner-navigation-v2-active");
      nav.classList.add("owner-nav-v2");

      const buttons = [...nav.querySelectorAll("button")];
      buttons.forEach((button) => {
        const label = normalizeLabel(button);
        decorate(button, label);
        if (VISIBLE_TABS.has(label) && !button.dataset.ownerNavClickBound) {
          button.dataset.ownerNavClickBound = "true";
          button.addEventListener("click", () => {
            if (label !== "Notifikasi") setActive(label);
          });
        }
      });

      // Derive the active Owner tab from the page that is actually rendered.
      // This prevents a stale sessionStorage value (for example Pelanggan)
      // from making the wrong tab look active immediately after Owner login.
      const customerViewVisible = Boolean(
        document.querySelector('[aria-label="Owner Customer Center"]'),
      );
      setActive(customerViewVisible ? "Pelanggan" : "Dashboard");
    };

    const verifyOwnerRole = async () => {
      if (verifying || stopped) return;
      verifying = true;
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const result = await response.json().catch(() => ({}));

        if (response.status === 401) {
          const ownerUiStillVisible =
            ownerActive || document.body.classList.contains("owner-dashboard-v3-active");
          if (ownerUiStillVisible) triggerExpiredSessionLogout();
          ownerActive = false;
          clearNavigation();
          return;
        }

        const nextOwnerActive = response.ok && result.user?.role === "OWNER";
        if (nextOwnerActive) logoutTriggered = false;
        if (ownerActive !== nextOwnerActive) {
          ownerActive = nextOwnerActive;
          sync();
        } else if (ownerActive) {
          sync();
        }
      } catch {
        if (ownerActive) {
          ownerActive = false;
          clearNavigation();
        }
      } finally {
        verifying = false;
      }
    };

    const syncFromDom = () => {
      if (stopped) return;

      // The legacy Owner header is rendered immediately by page.js after login.
      // Detect its unique menu signature synchronously and collapse it to the
      // four approved tabs before waiting for the network role verification.
      if (!ownerActive && ownerNavigationSignaturePresent()) {
        ownerActive = true;
        logoutTriggered = false;
        sync();
        verifyOwnerRole();
        return;
      }

      if (ownerActive) sync();
    };

    syncFromDom();
    verifyOwnerRole();

    const observer = new MutationObserver(syncFromDom);
    observer.observe(document.body, { childList: true, subtree: true });

    const roleTimer = window.setInterval(verifyOwnerRole, 2000);

    return () => {
      stopped = true;
      observer.disconnect();
      window.clearInterval(roleTimer);
      clearNavigation();
    };
  }, []);

  return null;
}
