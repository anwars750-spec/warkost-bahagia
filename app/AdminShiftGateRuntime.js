"use client";

import { useEffect, useRef, useState } from "react";

const CASH_PANEL = ".admin-cash-panel";
const CASH_NAV = 'nav [data-admin-nav="Setoran"]';
const ADMIN_SURFACE = 'nav [data-admin-nav="Printer"]';

async function readSession() {
  const response = await fetch("/api/me", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  return data?.user || null;
}

async function readCashState() {
  const response = await fetch("/api/admin-cash-control", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal membaca shift Admin");
  return data;
}

export default function AdminShiftGateRuntime() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [locked, setLocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const autoOpened = useRef(false);
  const checkingRef = useRef(false);
  const resolvedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let lastAdminSurface = Boolean(document.querySelector(ADMIN_SURFACE));
    let refreshTimer = null;

    const refreshAdminState = async ({ forceOpen = false } = {}) => {
      if (checkingRef.current) return;
      checkingRef.current = true;

      const adminSurface = Boolean(document.querySelector(ADMIN_SURFACE));
      if (adminSurface) document.body.classList.add("admin-shift-gate-checking");

      try {
        const user = await readSession();
        if (!alive) return;
        const admin = user?.role === "ADMIN";

        if (!admin) {
          setIsAdmin(false);
          setLocked(false);
          setChecking(false);
          autoOpened.current = false;
          resolvedRef.current = false;
          document.body.classList.remove("admin-shift-gate-checking");
          return;
        }

        setIsAdmin(true);
        setChecking(true);

        const state = await readCashState();
        if (!alive) return;

        const hasShift = Boolean(state?.current_shift);
        setLocked(!hasShift);
        resolvedRef.current = true;
        setChecking(false);
        document.body.classList.remove("admin-shift-gate-checking");

        // Force all Admin cash surfaces to reload from the persisted ledger after login/relogin.
        window.dispatchEvent(new CustomEvent("warkost:admin-session-restored", {
          detail: { hasShift },
        }));
        window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated"));
        window.setTimeout(
          () => window.dispatchEvent(new CustomEvent("warkost:cod-batch-updated")),
          350,
        );

        if (forceOpen) autoOpened.current = false;
      } catch {
        // Initial Admin resolution fails closed. Once a valid shift has already been
        // resolved, a transient read failure must not bounce the UI back to start-shift.
        if (!alive) return;
        if (!resolvedRef.current && adminSurface) {
          setIsAdmin(true);
          setLocked(true);
          setChecking(false);
        }
        document.body.classList.remove("admin-shift-gate-checking");
      } finally {
        checkingRef.current = false;
      }
    };

    void refreshAdminState({ forceOpen: true });

    const observer = new MutationObserver(() => {
      const adminSurface = Boolean(document.querySelector(ADMIN_SURFACE));
      if (adminSurface === lastAdminSurface) return;
      lastAdminSurface = adminSurface;
      if (adminSurface) document.body.classList.add("admin-shift-gate-checking");
      void refreshAdminState({ forceOpen: adminSurface });
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const onFocus = () => void refreshAdminState();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshAdminState();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    // Light reconciliation only. Avoid the old 900ms ledger polling that could
    // queue transactions in front of End Shift writes on SQLite.
    refreshTimer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (!document.querySelector(ADMIN_SURFACE)) return;
      void refreshAdminState();
    }, 6000);

    return () => {
      alive = false;
      observer.disconnect();
      if (refreshTimer) window.clearInterval(refreshTimer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      document.body.classList.remove("admin-shift-gate-checking");
    };
  }, []);

  useEffect(() => {
    if (!isAdmin || checking) return;

    const openCashControl = () => {
      if (autoOpened.current) return true;
      const button = document.querySelector(CASH_NAV);
      if (!button) return false;
      autoOpened.current = true;
      button.click();
      return true;
    };

    if (openCashControl()) return;
    const timer = window.setInterval(() => {
      if (openCashControl()) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
  }, [isAdmin, checking]);

  useEffect(() => {
    if (!isAdmin) return;

    const onStarted = () => {
      resolvedRef.current = true;
      setLocked(false);
      setChecking(false);
      document.body.classList.remove("admin-shift-gate-checking");
    };

    const onEnded = () => {
      resolvedRef.current = true;
      setLocked(true);
      autoOpened.current = false;
      window.setTimeout(() => {
        document.querySelector(CASH_NAV)?.click();
        autoOpened.current = true;
      }, 180);
    };

    window.addEventListener("warkost:admin-shift-started", onStarted);
    window.addEventListener("warkost:admin-shift-ended", onEnded);
    return () => {
      window.removeEventListener("warkost:admin-shift-started", onStarted);
      window.removeEventListener("warkost:admin-shift-ended", onEnded);
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !locked) {
      document.body.classList.remove("admin-shift-gate-locked");
      return;
    }

    document.body.classList.add("admin-shift-gate-locked");

    const reopen = () => {
      const panel = document.querySelector(CASH_PANEL);
      if (panel) return;
      document.querySelector(CASH_NAV)?.click();
    };

    const blockClick = (event) => {
      const closeButton = event.target.closest(".admin-cash-header > button");
      if (closeButton) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const navButton = event.target.closest("nav button");
      if (!navButton) return;
      const navName = navButton.dataset?.adminNav || "";
      const label = String(navButton.textContent || "").replace(/\s+/g, " ").trim();
      const allowed = navName === "Setoran" || /^Keluar/i.test(label);
      if (allowed) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      reopen();
    };

    const blockMouseDown = (event) => {
      const overlay = event.target.closest(".admin-cash-overlay");
      if (overlay && event.target === overlay) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    const blockEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      reopen();
    };

    document.addEventListener("click", blockClick, true);
    document.addEventListener("mousedown", blockMouseDown, true);
    document.addEventListener("keydown", blockEscape, true);

    const domObserver = new MutationObserver(() => {
      if (document.querySelector(".admin-cash-live")) {
        window.dispatchEvent(new CustomEvent("warkost:admin-shift-started"));
      } else if (!document.querySelector(".admin-shift-settlement-panel")) {
        reopen();
      }
    });
    domObserver.observe(document.body, { childList: true, subtree: true });

    // Slow fallback only while locked, in case a UI event is missed.
    const stateTimer = window.setInterval(async () => {
      try {
        const state = await readCashState();
        if (state?.current_shift) {
          window.dispatchEvent(new CustomEvent("warkost:admin-shift-started"));
        } else if (!document.querySelector(".admin-shift-settlement-panel")) {
          reopen();
        }
      } catch {
        if (!document.querySelector(".admin-shift-settlement-panel")) reopen();
      }
    }, 3500);

    reopen();

    return () => {
      document.body.classList.remove("admin-shift-gate-locked");
      domObserver.disconnect();
      window.clearInterval(stateTimer);
      document.removeEventListener("click", blockClick, true);
      document.removeEventListener("mousedown", blockMouseDown, true);
      document.removeEventListener("keydown", blockEscape, true);
    };
  }, [isAdmin, locked]);

  return null;
}
