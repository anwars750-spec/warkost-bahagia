"use client";

import { useEffect } from "react";

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const chatIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4.5A7 7 0 0 1 3 13V8a5 5 0 0 1 5-5h9a4 4 0 0 1 4 4v8Z"></path>
  </svg>
`;

const searchIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7"></circle>
    <path d="m20 20-4-4"></path>
  </svg>
`;

const backIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="m15 18-6-6 6-6"></path>
  </svg>
`;

const infoIcon = `
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="9"></circle>
    <path d="M12 11v5"></path>
    <path d="M12 8h.01"></path>
  </svg>
`;

const initials = (name) =>
  String(name || "CS")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();

export default function AdminCustomerServiceMobileEnhancer() {
  useEffect(() => {
    let mobileRoot = null;
    let observer = null;
    let raf = null;
    let screen = "inbox";
    let lastSignature = "";

    const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

    const getWorkspace = () => document.querySelector("#admin-customers-v1");

    const isServiceTabActive = (workspace) =>
      workspace?.querySelector('[data-customer-tab="service"].active') != null;

    const readSelectedCustomer = (workspace) => {
      const name = workspace
        ?.querySelector(".admin-service-conversation > header strong")
        ?.textContent?.trim();
      const email = workspace
        ?.querySelector(".admin-service-conversation > header span")
        ?.textContent?.trim();
      const detailButton = workspace?.querySelector(
        '.admin-service-profile button[data-customer-action="detail"]',
      );

      if (!name || name === "Pilih percakapan") return null;
      return {
        name,
        email: email && email !== "Customer Service Warkost" ? email : "",
        id: detailButton?.dataset?.id || "",
      };
    };

    const openNativeCustomerDetail = () => {
      const workspace = getWorkspace();
      workspace
        ?.querySelector('.admin-service-profile button[data-customer-action="detail"]')
        ?.click();
    };

    const renderInbox = (customer) => `
      <section class="admin-cs-mobile-head">
        <div>
          <small>CUSTOMER SERVICE</small>
          <h3>Pusat percakapan</h3>
          <p>Tangani pertanyaan customer dengan cepat dan tetap teratur.</p>
        </div>
        <span class="admin-cs-mobile-count">0 baru</span>
      </section>

      <section class="admin-cs-mobile-stats" aria-label="Ringkasan customer service">
        <article><span>Baru</span><strong>0</strong></article>
        <article><span>Aktif</span><strong>0</strong></article>
        <article><span>Selesai</span><strong>0</strong></article>
      </section>

      <label class="admin-cs-mobile-search">
        <span>${searchIcon}</span>
        <input type="search" placeholder="Cari percakapan atau pelanggan..." disabled />
      </label>

      <div class="admin-cs-mobile-tabs" aria-label="Filter percakapan">
        <button type="button" class="active">Inbox</button>
        <button type="button">Aktif</button>
        <button type="button">Selesai</button>
      </div>

      ${
        customer
          ? `
            <section class="admin-cs-mobile-selected">
              <div class="admin-cs-mobile-avatar">${esc(initials(customer.name))}</div>
              <div class="admin-cs-mobile-selected-copy">
                <small>PELANGGAN DIPILIH</small>
                <strong>${esc(customer.name)}</strong>
                <span>${esc(customer.email || "Customer Warkost")}</span>
              </div>
              <button type="button" data-admin-cs-mobile-open> Buka </button>
            </section>
          `
          : ""
      }

      <section class="admin-cs-mobile-inbox-empty">
        <span class="admin-cs-mobile-empty-icon">${chatIcon}</span>
        <strong>Belum ada percakapan</strong>
        <p>Pesan customer baru akan tampil sebagai daftar ringkas di sini, jadi inbox tetap mudah dipantau saat chat bertambah banyak.</p>
      </section>
    `;

    const renderChat = (customer) => `
      <section class="admin-cs-mobile-chat-head">
        <button type="button" class="admin-cs-mobile-icon-btn" data-admin-cs-mobile-back aria-label="Kembali">
          ${backIcon}
        </button>
        <div class="admin-cs-mobile-avatar">${esc(initials(customer?.name || "CS"))}</div>
        <div class="admin-cs-mobile-chat-title">
          <strong>${esc(customer?.name || "Customer Service")}</strong>
          <span>${esc(customer?.email || "Percakapan customer")}</span>
        </div>
        <button type="button" class="admin-cs-mobile-icon-btn" data-admin-cs-mobile-info aria-label="Info pelanggan">
          ${infoIcon}
        </button>
      </section>

      <section class="admin-cs-mobile-order-context">
        <div>
          <small>KONTEKS LAYANAN</small>
          <strong>Customer Service Warkost</strong>
          <span>Chat internal Customer ↔ Admin</span>
        </div>
        <span class="admin-cs-mobile-status">Siap</span>
      </section>

      <section class="admin-cs-mobile-chat-body">
        <span class="admin-cs-mobile-empty-icon large">${chatIcon}</span>
        <strong>Belum ada pesan</strong>
        <p>Riwayat percakapan akan tampil di area ini. Untuk panggilan langsung, customer diarahkan ke WhatsApp Warkost.</p>
      </section>

      <section class="admin-cs-mobile-composer" aria-label="Kirim pesan">
        <button type="button" disabled aria-label="Lampiran">＋</button>
        <input type="text" disabled placeholder="Ketik balasan untuk customer..." />
        <button type="button" class="send" disabled>Kirim</button>
      </section>
    `;

    const bindEvents = (customer) => {
      mobileRoot?.querySelector("[data-admin-cs-mobile-open]")?.addEventListener("click", () => {
        if (!customer) return;
        screen = "chat";
        render();
      });
      mobileRoot?.querySelector("[data-admin-cs-mobile-back]")?.addEventListener("click", () => {
        screen = "inbox";
        render();
      });
      mobileRoot?.querySelector("[data-admin-cs-mobile-info]")?.addEventListener("click", () => {
        openNativeCustomerDetail();
      });
    };

    const render = () => {
      const workspace = getWorkspace();
      if (!workspace || !isMobile() || !isServiceTabActive(workspace)) {
        mobileRoot?.remove();
        mobileRoot = null;
        lastSignature = "";
        return;
      }

      const serviceShell = workspace.querySelector(".admin-service-shell");
      if (!serviceShell) return;

      const customer = readSelectedCustomer(workspace);
      const signature = `${customer?.id || "none"}:${customer?.name || ""}:${screen}`;

      if (!mobileRoot || !mobileRoot.isConnected) {
        mobileRoot = document.createElement("div");
        mobileRoot.id = "admin-customer-service-mobile-v2";
        mobileRoot.className = "admin-cs-mobile-v2";
        serviceShell.before(mobileRoot);
      }

      if (signature === lastSignature && mobileRoot.childElementCount) return;
      lastSignature = signature;
      mobileRoot.innerHTML = screen === "chat" && customer ? renderChat(customer) : renderInbox(customer);
      bindEvents(customer);
    };

    const scheduleRender = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(render);
    };

    observer = new MutationObserver(scheduleRender);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    window.addEventListener("resize", scheduleRender);
    scheduleRender();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      observer?.disconnect();
      window.removeEventListener("resize", scheduleRender);
      mobileRoot?.remove();
    };
  }, []);

  return null;
}
