"use client";

import { useEffect } from "react";

const closeIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`;

function text(node, fallback = "") {
  return node?.textContent?.replace(/\s+/g, " ")?.trim() || fallback;
}

function buildRuntimeDrawer() {
  let shell = document.querySelector('[data-manager-stock-runtime="true"]');
  if (shell) return shell;

  shell = document.createElement("div");
  shell.dataset.managerStockRuntime = "true";
  shell.className = "manager-stock-drawer-shell manager-stock-runtime-shell";
  shell.hidden = true;
  shell.innerHTML = `
    <div class="manager-stock-drawer-backdrop" data-runtime-close></div>
    <aside class="manager-stock-drawer" role="dialog" aria-modal="true" aria-label="Atur stok produk">
      <header>
        <div>
          <span>PENYESUAIAN STOK</span>
          <h2>Atur Stok Produk</h2>
          <p>Tambah atau kurangi stok. Setiap perubahan wajib memiliki alasan agar ledger tetap dapat diaudit.</p>
        </div>
        <button type="button" class="manager-stock-drawer-close" data-runtime-close aria-label="Tutup">${closeIcon}</button>
      </header>
      <form data-runtime-form>
        <div class="manager-stock-selected" data-runtime-selected></div>
        <label class="manager-stock-field">Jumlah penyesuaian
          <input data-runtime-quantity type="number" required placeholder="Contoh: 10 atau -5" />
          <small>Angka positif menambah stok, angka negatif mengurangi stok.</small>
        </label>
        <label class="manager-stock-field">Alasan penyesuaian
          <textarea data-runtime-reason required minlength="3" maxlength="240" rows="3" placeholder="Contoh: Restock supplier, koreksi opname, barang rusak..."></textarea>
        </label>
        <div class="manager-stock-drawer-actions">
          <button type="button" data-runtime-close>Batal</button>
          <button class="manager-primary" type="submit">Simpan Stok</button>
        </div>
      </form>
    </aside>
  `;
  document.body.appendChild(shell);
  return shell;
}

export default function ManagerStockActionRuntime() {
  useEffect(() => {
    const shell = buildRuntimeDrawer();
    const form = shell.querySelector("[data-runtime-form]");
    const quantity = shell.querySelector("[data-runtime-quantity]");
    const reason = shell.querySelector("[data-runtime-reason]");
    const selected = shell.querySelector("[data-runtime-selected]");
    let activeRow = null;

    const close = () => {
      shell.hidden = true;
      activeRow = null;
      document.documentElement.classList.remove("manager-stock-drawer-open");
      if (quantity) quantity.value = "";
      if (reason) reason.value = "";
    };

    const openFor = (row) => {
      if (!row) return;
      activeRow = row;

      const identity = row.querySelector(".manager-stock-identity") || row.firstElementChild;
      const name = text(identity?.querySelector("strong"), "Produk");
      const meta = text(identity?.querySelector("small"), "Produk Warkost");
      const image = identity?.querySelector("img")?.getAttribute("src") || "/demo/promo-warkost.webp";
      const available = text(
        [...row.querySelectorAll("dl > div")].find((item) =>
          text(item.querySelector("dt")).toLowerCase().includes("available"),
        )?.querySelector("dd"),
        "-",
      );

      if (selected) {
        selected.innerHTML = "";
        const img = document.createElement("img");
        img.src = image;
        img.alt = "";
        const info = document.createElement("div");
        const strong = document.createElement("strong");
        strong.textContent = name;
        const small = document.createElement("small");
        small.textContent = meta;
        const span = document.createElement("span");
        span.textContent = `Available ${available}`;
        info.append(strong, small, span);
        selected.append(img, info);
      }

      const sourceQuantity = row.querySelector('input[name="quantity"]');
      if (sourceQuantity?.step && quantity) quantity.step = sourceQuantity.step;
      if (quantity) quantity.value = "";
      if (reason) reason.value = "";

      shell.hidden = false;
      document.documentElement.classList.add("manager-stock-drawer-open");
      setTimeout(() => quantity?.focus(), 20);
    };

    shell.querySelectorAll("[data-runtime-close]").forEach((button) =>
      button.addEventListener("click", close),
    );

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !shell.hidden) close();
    };

    const onDocumentClick = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const action = target.closest(".manager-stock-action, .manager-stock-adjust-all");
      if (!action) return;
      const page = action.closest(".manager-stock-page");
      if (!page) return;

      let row = action.closest(".manager-stock-row");
      if (!row) {
        row = [...page.querySelectorAll(".manager-stock-row")].find(
          (candidate) => !candidate.hidden,
        );
      }
      if (!row) return;

      event.preventDefault();
      event.stopPropagation();
      openFor(row);
    };

    const onSubmit = (event) => {
      event.preventDefault();
      if (!activeRow) return;

      const sourceQuantity = activeRow.querySelector('input[name="quantity"]');
      const sourceReason = activeRow.querySelector('input[name="reason"]');
      if (!sourceQuantity || !sourceReason) return;

      const qty = String(quantity?.value || "").trim();
      const why = String(reason?.value || "").trim();
      if (!qty || why.length < 3) return;

      sourceQuantity.value = qty;
      sourceReason.value = why;

      if (typeof activeRow.requestSubmit === "function") {
        activeRow.requestSubmit();
      } else {
        activeRow.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }

      close();
    };

    form?.addEventListener("submit", onSubmit);
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      form?.removeEventListener("submit", onSubmit);
      document.removeEventListener("click", onDocumentClick, true);
      document.removeEventListener("keydown", onKeyDown);
      shell.remove();
      document.documentElement.classList.remove("manager-stock-drawer-open");
    };
  }, []);

  return null;
}
