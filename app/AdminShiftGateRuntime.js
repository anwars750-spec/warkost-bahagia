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
  const shiftActiveRef = useRef(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    let alive = true;
    let lastAdminSurface = Boolean(document.querySelector(ADMIN_SURFACE));

    const reconcileLogin = async ({ forceOpen = false } = {}) => {
      if (checkingRef.current || submittingRef.current) return;
      checkingRef.current = true;

      const adminSurface = Boolean(document.querySelector(ADMIN_SURFACE));
      if (adminSurface && !shiftActiveRef.current) {
        setIsAdmin(true);
        setLocked(true);
        setChecking(true);
        document.body.classList.add("admin-shift-gate-checking");
      }

      try {
        const user = await readSession();
        if (!alive) return;
        const admin = user?.role === "ADMIN";

        if (!admin) {
          setIsAdmin(false);
          setLocked(false);
          setChecking(false);
          shiftActiveRef.current = false;
          autoOpened.current = false;
          document.body.classList.remove("admin-shift-gate-checking");
          return;
        }

        setIsAdmin(true);
        const state = await readCashState();
        if (!alive) return;

        const hasShift = Boolean(state?.current_shift);
        shiftActiveRef.current = hasShift;
        setLocked(!hasShift);
        setChecking(false);
        document.body.classList.remove("admin-shift-gate-checking");

        window.dispatchEvent(
          new CustomEvent("warkost:admin-session-restored", {
            detail: { hasShift, currentShift: state?.current_shift || null },
          }),
        );

        if (forceOpen) autoOpened.current = false;
      } catch {
        if (!alive) return;
        // At first Admin render we fail closed. Once an OPEN shift is known,
        // a transient read failure must never throw the operator back to start-shift.
        if (!shiftActiveRef.current && adminSurface) {
          setIsAdmin(true);
          setLocked(true);
        }
        setChecking(false);
        document.body.classList.remove("admin-shift-gate-checking");
      } finally {
        checkingRef.current = false;
      }
    };

    const onDomChange = () => {
      const adminSurface = Boolean(document.querySelector(ADMIN_SURFACE));
      if (adminSurface === lastAdminSurface) return;
      lastAdminSurface = adminSurface;

      if (adminSurface) {
        // New Admin shell means a new login render. Resolve persisted shift once,
        // before allowing the operational dashboard to be used.
        shiftActiveRef.current = false;
        autoOpened.current = false;
        setIsAdmin(true);
        setLocked(true);
        setChecking(true);
        document.body.classList.add("admin-shift-gate-checking");
        void reconcileLogin({ forceOpen: true });
      } else {
        setIsAdmin(false);
        setLocked(false);
        setChecking(false);
        shiftActiveRef.current = false;
        autoOpened.current = false;
        document.body.classList.remove("admin-shift-gate-checking");
      }
    };

    onDomChange();
    if (!lastAdminSurface) void reconcileLogin();

    const observer = new MutationObserver(onDomChange);
    observer.observe(document.body, { childList: true, subtree: true });

    const onShiftStarted = (event) => {
      shiftActiveRef.current = true;
      setIsAdmin(true);
      setLocked(false);
      setChecking(false);
      document.body.classList.remove("admin-shift-gate-checking");
      if (event?.detail?.currentShift) {
        window.dispatchEvent(
          new CustomEvent("warkost:admin-session-restored", {
            detail: { hasShift: true, currentShift: event.detail.currentShift },
          }),
        );
      }
    };

    const onShiftEnded = () => {
      shiftActiveRef.current = false;
      autoOpened.current = false;
      setLocked(true);
      setChecking(false);
      window.setTimeout(() => {
        const button = document.querySelector(CASH_NAV);
        if (button && !document.querySelector(CASH_PANEL)) button.click();
        autoOpened.current = true;
      }, 180);
    };

    const onSubmitting = (event) => {
      submittingRef.current = Boolean(event?.detail?.active);
    };

    const onVisibility = () => {
      // Only reconcile an unresolved Admin login. Do not re-decide a known OPEN
      // shift on every focus/visibility change; that caused dashboard snap-back.
      if (
        document.visibilityState === "visible" &&
        document.querySelector(ADMIN_SURFACE) &&
        !shiftActiveRef.current &&
        !submittingRef.current
      ) {
        void reconcileLogin();
      }
    };

    window.addEventListener("warkost:admin-shift-started", onShiftStarted);
    window.addEventListener("warkost:admin-shift-ended", onShiftEnded);
    window.addEventListener("warkost:admin-shift-submitting", onSubmitting);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      alive = false;
      observer.disconnect();
      window.removeEventListener("warkost:admin-shift-started", onShiftStarted);
      window.removeEventListener("warkost:admin-shift-ended", onShiftEnded);
      window.removeEventListener("warkost:admin-shift-submitting", onSubmitting);
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
      if (!document.querySelector(CASH_PANEL)) button.click();
      return true;
    };

    if (openCashControl()) return;
    const timer = window.setInterval(() => {
      if (openCashControl()) window.clearInterval(timer);
    }, 120);
    return () => window.clearInterval(timer);
  }, [isAdmin, checking]);

  useEffect(() => {
    if (!isAdmin || !locked) {
      document.body.classList.remove("admin-shift-gate-locked");
      return;
    }

    document.body.classList.add("admin-shift-gate-locked");

    const reopen = () => {
      if (submittingRef.current) return;
      if (document.querySelector(CASH_PANEL)) return;
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
    reopen();

    return () => {
      document.body.classList.remove("admin-shift-gate-locked");
      document.removeEventListener("click", blockClick, true);
      document.removeEventListener("mousedown", blockMouseDown, true);
      document.removeEventListener("keydown", blockEscape, true);
    };
  }, [isAdmin, locked]);

  return null;
}
