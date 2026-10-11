"use client";

import { useEffect, useRef, useState } from "react";

const CASH_PANEL = ".admin-cash-panel";
const CASH_NAV = 'nav [data-admin-nav="Setoran"]';

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
  const autoOpened = useRef(false);
  const checking = useRef(false);

  useEffect(() => {
    let alive = true;

    const inspect = async () => {
      if (checking.current) return;
      checking.current = true;
      try {
        const user = await readSession();
        if (!alive) return;

        const admin = user?.role === "ADMIN";
        setIsAdmin(admin);
        if (!admin) {
          setLocked(false);
          autoOpened.current = false;
          return;
        }

        const state = await readCashState();
        if (!alive) return;
        setLocked(!state?.current_shift);
      } catch {
        // Fail closed only after the Admin surface is actually present.
        const adminSurface = Boolean(document.querySelector('nav [data-admin-nav="Printer"]'));
        if (alive && adminSurface) {
          setIsAdmin(true);
          setLocked(true);
        }
      } finally {
        checking.current = false;
      }
    };

    void inspect();
    const observer = new MutationObserver(() => void inspect());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-admin-nav", "class"],
    });

    return () => {
      alive = false;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!isAdmin) return;

    const openCashControl = () => {
      if (autoOpened.current) return;
      const button = document.querySelector(CASH_NAV);
      if (!button) return;
      autoOpened.current = true;
      button.click();
    };

    openCashControl();
    const observer = new MutationObserver(openCashControl);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
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

    const timer = window.setInterval(async () => {
      try {
        const state = await readCashState();
        if (state?.current_shift) {
          setLocked(false);
          window.clearInterval(timer);
        } else {
          reopen();
        }
      } catch {
        reopen();
      }
    }, 900);

    const observer = new MutationObserver(() => {
      if (document.querySelector(".admin-cash-live")) setLocked(false);
      else reopen();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    reopen();

    return () => {
      document.body.classList.remove("admin-shift-gate-locked");
      window.clearInterval(timer);
      observer.disconnect();
      document.removeEventListener("click", blockClick, true);
      document.removeEventListener("mousedown", blockMouseDown, true);
      document.removeEventListener("keydown", blockEscape, true);
    };
  }, [isAdmin, locked]);

  return null;
}
