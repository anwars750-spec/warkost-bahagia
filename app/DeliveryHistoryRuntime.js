"use client";

import { useEffect, useState } from "react";
import DeliveryHistoryCenter from "./DeliveryHistoryCenter";
import styles from "./DeliveryHistoryRuntime.module.css";

function attachManagerLauncher(menu, open) {
  if (!menu || menu.querySelector('[data-delivery-history-launcher="true"]'))
    return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.deliveryHistoryLauncher = "true";
  button.textContent = "Riwayat Delivery";
  button.addEventListener("click", open);
  const logout = [...menu.querySelectorAll("button")].find(
    (item) => item.textContent.trim() === "Keluar",
  );
  menu.insertBefore(button, logout || null);
}

function makeManagerLauncher(open) {
  attachManagerLauncher(document.querySelector("header.top nav"), open);
  attachManagerLauncher(document.querySelector(".manager-more-menu"), open);
}

function makeOwnerLauncher(open) {
  const grid = document.querySelector(".owner-control-grid-v3");
  if (!grid || grid.querySelector('[data-delivery-history-launcher="true"]')) return;
  const button = document.createElement("button");
  button.type = "button";
  button.dataset.deliveryHistoryLauncher = "true";
  button.innerHTML = `
    <span class="${styles.ownerIcon}" aria-hidden="true">✓</span>
    <div><strong>Riwayat Delivery</strong><small>Bukti pengantaran dan timeline order selesai.</small></div>
    <span class="${styles.ownerArrow}" aria-hidden="true">→</span>
  `;
  button.addEventListener("click", open);
  grid.appendChild(button);
}

function visibleRoleSignature() {
  if (document.querySelector(".manager-control-center")) return "MANAGER";
  if (
    document.querySelector(".owner-control-grid-v3") ||
    document.querySelector(
      'header.top nav button[data-owner-nav-key="Dashboard"]',
    )
  )
    return "OWNER";
  return null;
}

export default function DeliveryHistoryRuntime() {
  const [role, setRole] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let stopped = false;
    let verifyTimer = null;
    let currentRole = null;

    const applyRole = (nextRole) => {
      currentRole = nextRole;
      if (!stopped) setRole(nextRole);
    };

    const verify = async () => {
      try {
        const response = await fetch("/api/me", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        applyRole(
          response.ok && ["MANAGER", "OWNER"].includes(data.user?.role)
            ? data.user.role
            : null,
        );
      } catch {
        applyRole(null);
      }
    };

    const scheduleVerify = () => {
      const signature = visibleRoleSignature();
      if (signature === currentRole || verifyTimer || stopped) return;
      verifyTimer = window.setTimeout(() => {
        verifyTimer = null;
        verify();
      }, 80);
    };

    verify();
    const observer = new MutationObserver(scheduleVerify);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(verify, 120000);
    return () => {
      stopped = true;
      observer.disconnect();
      window.clearInterval(interval);
      if (verifyTimer) window.clearTimeout(verifyTimer);
    };
  }, []);

  useEffect(() => {
    if (!role) return;
    const launch = () => setOpen(true);
    const sync = () => {
      if (role === "MANAGER") makeManagerLauncher(launch);
      if (role === "OWNER") makeOwnerLauncher(launch);
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [role]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const close = (event) => event.key === "Escape" && setOpen(false);
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  if (!open || !role) return null;
  return (
    <div className={styles.backdrop} role="presentation">
      <div className={styles.surface}>
        <DeliveryHistoryCenter onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
