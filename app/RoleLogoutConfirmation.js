"use client";

import { useEffect } from "react";

const LOGOUT_ICON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg>`;

const TARGET_ROLES = new Set(["ADMIN", "DRIVER", "CUSTOMER"]);

const COPY = {
  ADMIN: {
    kicker: "AKHIRI SESI ADMIN",
    title: "Keluar dari akun Admin?",
    description:
      "Pastikan proses operasional dan transaksi yang sedang ditangani sudah tersimpan sebelum mengakhiri sesi.",
  },
  DRIVER: {
    kicker: "AKHIRI SESI DRIVER",
    title: "Keluar dari akun Driver?",
    description:
      "Pastikan status pengantaran dan setoran COD sudah diperbarui sebelum mengakhiri sesi.",
  },
  CUSTOMER: {
    kicker: "AKHIRI SESI CUSTOMER",
    title: "Keluar dari akun Customer?",
    description:
      "Pesanan dan riwayat akun tetap tersimpan. Anda dapat masuk kembali kapan saja.",
  },
};

const normalize = (value) =>
  String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();

function isKitchenHeaderLogout(button) {
  if (!button?.closest("header.top nav")) return false;
  const nav = button.closest("header.top nav");
  const labels = Array.from(nav.querySelectorAll("button")).map((item) =>
    normalize(item.textContent),
  );
  return (
    labels.some((label) => label.startsWith("DAPUR")) &&
    labels.some((label) => label.startsWith("PRINTER")) &&
    labels.some((label) => label.startsWith("NOTIFIKASI")) &&
    labels.some((label) => label.startsWith("KELUAR")) &&
    !labels.some((label) => label.startsWith("OPERASIONAL"))
  );
}

async function getCurrentRole() {
  const response = await fetch("/api/me", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal memeriksa sesi");
  return data.user?.role || null;
}

async function performLogout() {
  const response = await fetch("/api/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Gagal keluar dari akun");
  window.location.replace("/");
}

export default function RoleLogoutConfirmation() {
  useEffect(() => {
    let layer = null;
    let sourceButton = null;

    const close = () => {
      if (!layer) return;
      const current = layer;
      layer = null;
      current.classList.remove("open");
      document.body.style.overflow = "";
      window.setTimeout(() => current.remove(), 170);
      sourceButton?.focus?.();
      sourceButton = null;
    };

    const open = (role, button) => {
      close();
      const copy = COPY[role] || COPY.CUSTOMER;
      sourceButton = button;
      layer = document.createElement("div");
      layer.className = "kitchen-logout-layer role-logout-layer";
      layer.innerHTML = `
        <section class="kitchen-logout-dialog role-logout-dialog" role="dialog" aria-modal="true" aria-label="Konfirmasi keluar ${role}">
          <span class="kitchen-logout-icon">${LOGOUT_ICON}</span>
          <div class="kitchen-logout-copy">
            <small>${copy.kicker}</small>
            <h2>${copy.title}</h2>
            <p>${copy.description}</p>
          </div>
          <div class="kitchen-logout-error" data-role-logout-error hidden></div>
          <div class="kitchen-logout-actions">
            <button type="button" class="kitchen-logout-cancel" data-role-logout-cancel>Batal</button>
            <button type="button" class="kitchen-logout-confirm" data-role-logout-confirm>Keluar</button>
          </div>
        </section>
      `;
      document.body.appendChild(layer);
      document.body.style.overflow = "hidden";
      requestAnimationFrame(() => layer?.classList.add("open"));
      layer.querySelector("[data-role-logout-cancel]")?.focus();
    };

    const onClick = async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.closest(".role-logout-layer") || button.closest(".kitchen-logout-layer")) {
        return;
      }
      if (normalize(button.textContent) !== "KELUAR") return;
      if (isKitchenHeaderLogout(button)) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      try {
        const role = await getCurrentRole();
        if (TARGET_ROLES.has(role)) {
          open(role, button);
          return;
        }
        await performLogout();
      } catch (error) {
        console.error("Logout confirmation failed:", error);
      }
    };

    const onLayerClick = async (event) => {
      if (!layer) return;
      if (event.target === layer || event.target.closest("[data-role-logout-cancel]")) {
        close();
        return;
      }
      const confirm = event.target.closest("[data-role-logout-confirm]");
      if (!confirm) return;
      const cancel = layer.querySelector("[data-role-logout-cancel]");
      const errorBox = layer.querySelector("[data-role-logout-error]");
      confirm.disabled = true;
      if (cancel) cancel.disabled = true;
      confirm.textContent = "Keluar...";
      if (errorBox) errorBox.hidden = true;
      try {
        await performLogout();
      } catch (error) {
        if (errorBox) {
          errorBox.hidden = false;
          errorBox.textContent = error.message || "Gagal keluar dari akun";
        }
        confirm.disabled = false;
        if (cancel) cancel.disabled = false;
        confirm.textContent = "Keluar";
      }
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape" && layer) close();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("click", onLayerClick, false);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("click", onLayerClick, false);
      document.removeEventListener("keydown", onKeyDown);
      layer?.remove();
      document.body.style.overflow = "";
    };
  }, []);

  return null;
}
