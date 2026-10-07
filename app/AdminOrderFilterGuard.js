"use client";

import { useEffect } from "react";

const statusGroup = (status) => {
  const normalized = String(status || "").replaceAll(" ", "_").toUpperCase();
  if (["PENDING", "CONFIRMED"].includes(normalized)) return "waiting";
  if (normalized === "PREPARING") return "preparing";
  if (normalized === "READY") return "ready";
  if (["ASSIGNED", "PICKED_UP", "ON_DELIVERY"].includes(normalized)) return "delivery";
  if (normalized === "DELIVERED") return "done";
  return "other";
};

export default function AdminOrderFilterGuard() {
  useEffect(() => {
    let raf = 0;

    const clearCardState = (card) => {
      card.hidden = false;
      card.style.removeProperty("display");
      card.removeAttribute("aria-hidden");
    };

    const apply = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        if (!document.body.classList.contains("admin-operations-view")) {
          document
            .querySelectorAll("main .order-list > .order")
            .forEach(clearCardState);
          return;
        }

        const tools = document.getElementById("admin-order-tools");
        const list = document.querySelector("main .order-list");
        if (!tools || !list) return;

        const activeButton = tools.querySelector(".admin-order-filters button.active");
        const activeFilter = activeButton?.dataset.filter || "all";
        const searchInput = tools.querySelector('input[type="search"]');
        const query = searchInput?.value.trim().toLowerCase() || "";

        list.dataset.activeFilter = activeFilter;

        [...list.querySelectorAll(":scope > .order")].forEach((card) => {
          const badgeStatus = card.querySelector(".order-head .badge")?.textContent?.trim() || "";
          const group = card.dataset.orderGroup || statusGroup(badgeStatus);
          card.dataset.orderGroup = group;

          const matchesFilter = activeFilter === "all" || group === activeFilter;
          const matchesSearch = !query || card.textContent.toLowerCase().includes(query);
          const shouldShow = matchesFilter && matchesSearch;

          card.hidden = !shouldShow;
          card.setAttribute("aria-hidden", shouldShow ? "false" : "true");

          if (shouldShow) {
            card.style.removeProperty("display");
          } else {
            // Deterministic final guard: beats card CSS that uses display:flex !important.
            card.style.setProperty("display", "none", "important");
          }
        });
      });
    };

    const onClick = (event) => {
      if (!event.target.closest("#admin-order-tools .admin-order-filters button")) return;
      setTimeout(apply, 0);
    };

    const onInput = (event) => {
      if (!event.target.matches('#admin-order-tools input[type="search"]')) return;
      apply();
    };

    const onOrdersRendered = () => apply();

    document.addEventListener("click", onClick, true);
    document.addEventListener("input", onInput, true);
    window.addEventListener("warkost:admin-orders-rendered", onOrdersRendered);

    const observer = new MutationObserver(() => apply());
    const main = document.querySelector("main");
    if (main) observer.observe(main, { childList: true, subtree: true });

    apply();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("input", onInput, true);
      window.removeEventListener("warkost:admin-orders-rendered", onOrdersRendered);
      document
        .querySelectorAll("main .order-list > .order")
        .forEach(clearCardState);
    };
  }, []);

  return null;
}
