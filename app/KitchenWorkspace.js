"use client";
import { useLayoutEffect } from "react";
import { saveKitchenView } from "./kitchen-workspace-state.mjs";
const icons = {
  kitchen: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 14h16a8 8 0 0 1-16 0Z" />
      <path d="M7 11c-1-1.3 1-2.2 0-3.5M12 11c-1-1.3 1-2.2 0-3.5M17 11c-1-1.3 1-2.2 0-3.5" />
    </svg>
  ),
  stock: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 7 8-4 8 4-8 4-8-4Z" />
      <path d="m4 7 8 4 8-4v10l-8 4-8-4V7Z" />
      <path d="M12 11v10" />
    </svg>
  ),
  printer: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="7" rx="1" />
    </svg>
  ),
  notification: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5" />
    </svg>
  ),
};
export function KitchenNavIcon({ name }) {
  return (
    <span className="kitchen-nav-symbol" aria-hidden="true">
      {icons[name]}
    </span>
  );
}
// The active view is supplied by App. Body flags support the existing approved
// CSS only; no content is discovered, hidden, moved or inferred here.
export default function KitchenWorkspace({ view, userId }) {
  useLayoutEffect(() => {
    document.body.classList.add("kitchen-shell-active");
    document.body.classList.toggle(
      "kitchen-dashboard-active",
      view === "orders",
    );
    document.body.classList.toggle(
      "kitchen-stock-modern-active",
      view === "stock",
    );
    document.body.classList.toggle(
      "kitchen-printer-active",
      view === "printing",
    );
    try {
      saveKitchenView(window.sessionStorage, userId, view);
    } catch {
      /* Storage can be disabled. */
    }
    return () =>
      document.body.classList.remove(
        "kitchen-shell-active",
        "kitchen-dashboard-active",
        "kitchen-stock-modern-active",
        "kitchen-printer-active",
      );
  }, [view, userId]);
  return null;
}
