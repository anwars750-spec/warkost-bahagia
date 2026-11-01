"use client";

import { useEffect } from "react";

const rowSelector =
  ".manager-subcategory-page .manager-two-columns > .manager-card:first-child .manager-subcategory-row";

function parseRow(row) {
  const name = row.querySelector("strong")?.textContent?.trim() || "";
  const raw = row.querySelector("small")?.textContent?.replace(/\s+/g, " ")?.trim() || "";
  const parts = raw.split("·").map((part) => part.trim());
  const category = parts[0] || "Umum";
  const orderMatch = raw.match(/urutan\s+(\d+)/i);
  const active = /\bAktif\b/i.test(raw) && !/Nonaktif/i.test(raw);
  return {
    name,
    category,
    order: orderMatch ? Number(orderMatch[1]) : 0,
    active,
  };
}

function decorateRows(page) {
  const rows = [...document.querySelectorAll(rowSelector)];
  rows.forEach((row) => {
    const data = parseRow(row);
    row.dataset.name = data.name.toLowerCase();
    row.dataset.category = data.category;
    row.dataset.status = data.active ? "active" : "inactive";
    row.dataset.order = String(data.order);

    const main = row.firstElementChild;
    if (main) {
      main.classList.add("manager-subcategory-main");
      const oldMeta = main.querySelector(".manager-subcategory-meta");
      if (!oldMeta) {
        const meta = document.createElement("div");
        meta.className = "manager-subcategory-meta";
        meta.innerHTML = `
          <span class="manager-subcategory-category">${data.category}</span>
          <span class="manager-subcategory-order">Urutan ${data.order}</span>
          <span class="manager-subcategory-state ${data.active ? "is-active" : "is-inactive"}">${data.active ? "Aktif" : "Nonaktif"}</span>
        `;
        main.appendChild(meta);
      }
    }

    const actions = row.lastElementChild;
    if (actions) actions.classList.add("manager-subcategory-actions");
  });
  return rows;
}

function updateSummary(page, rows) {
  const summary = page.querySelector(".manager-subcategory-summary");
  if (!summary) return;
  const parsed = rows.map(parseRow);
  const active = parsed.filter((row) => row.active).length;
  const inactive = parsed.length - active;
  const categories = new Set(parsed.map((row) => row.category).filter(Boolean)).size;
  const values = [parsed.length, active, inactive, categories];
  summary.querySelectorAll("[data-summary-value]").forEach((node, index) => {
    node.textContent = String(values[index] ?? 0);
  });
}

function applyFilters(page) {
  const search = page.querySelector("[data-subcategory-search]")?.value.trim().toLowerCase() || "";
  const category = page.querySelector("[data-subcategory-category]")?.value || "all";
  const status = page.querySelector("[data-subcategory-status]")?.value || "all";
  const rows = [...document.querySelectorAll(rowSelector)];
  let visible = 0;
  rows.forEach((row) => {
    const matchSearch = !search || row.dataset.name?.includes(search);
    const matchCategory = category === "all" || row.dataset.category === category;
    const matchStatus = status === "all" || row.dataset.status === status;
    const show = matchSearch && matchCategory && matchStatus;
    row.hidden = !show;
    if (show) visible += 1;
  });
  const count = page.querySelector("[data-subcategory-visible]");
  if (count) count.textContent = `${visible} subkategori`;
}

function ensureSummary(page, rows) {
  if (page.querySelector(".manager-subcategory-summary")) {
    updateSummary(page, rows);
    return;
  }
  const title = page.querySelector(".manager-page-title");
  if (!title) return;
  const summary = document.createElement("section");
  summary.className = "manager-subcategory-summary";
  summary.innerHTML = `
    <article class="manager-subcategory-stat stat-total">
      <span class="manager-subcategory-stat-icon" aria-hidden="true">≡</span>
      <div><strong data-summary-value>0</strong><b>Total Subkategori</b><small>Seluruh struktur menu terdaftar</small></div>
    </article>
    <article class="manager-subcategory-stat stat-active">
      <span class="manager-subcategory-stat-icon" aria-hidden="true">✓</span>
      <div><strong data-summary-value>0</strong><b>Subkategori Aktif</b><small>Siap digunakan pada produk</small></div>
    </article>
    <article class="manager-subcategory-stat stat-inactive">
      <span class="manager-subcategory-stat-icon" aria-hidden="true">×</span>
      <div><strong data-summary-value>0</strong><b>Subkategori Nonaktif</b><small>Tidak tersedia untuk produk baru</small></div>
    </article>
    <article class="manager-subcategory-stat stat-category">
      <span class="manager-subcategory-stat-icon" aria-hidden="true">◇</span>
      <div><strong data-summary-value>0</strong><b>Kategori Terhubung</b><small>Kategori utama yang digunakan</small></div>
    </article>
  `;
  title.insertAdjacentElement("afterend", summary);
  updateSummary(page, rows);
}

function openForm(page, mode = "add") {
  if (mode === "add") {
    const cancel = page.querySelector(".manager-subcategory-form button[type='button']");
    if (cancel) cancel.click();
  }
  page.classList.add("subcategory-form-open");
  const form = page.querySelector(".manager-subcategory-form");
  if (form && window.innerWidth > 760) {
    form.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function ensureToolbar(page, rows) {
  if (page.querySelector(".manager-subcategory-toolbar")) return;
  const columns = page.querySelector(".manager-two-columns");
  if (!columns) return;
  const categories = [...new Set(rows.map((row) => parseRow(row).category).filter(Boolean))];
  const toolbar = document.createElement("section");
  toolbar.className = "manager-subcategory-toolbar";
  toolbar.innerHTML = `
    <label class="manager-subcategory-search">
      <span aria-hidden="true">⌕</span>
      <input data-subcategory-search placeholder="Cari subkategori..." aria-label="Cari subkategori" />
    </label>
    <select data-subcategory-category aria-label="Filter kategori utama">
      <option value="all">Semua Kategori Utama</option>
      ${categories.map((name) => `<option value="${name}">${name}</option>`).join("")}
    </select>
    <select data-subcategory-status aria-label="Filter status">
      <option value="all">Semua Status</option>
      <option value="active">Aktif</option>
      <option value="inactive">Nonaktif</option>
    </select>
    <button type="button" class="manager-primary manager-subcategory-add">＋ Tambah Subkategori</button>
  `;
  columns.insertAdjacentElement("beforebegin", toolbar);
  toolbar.querySelectorAll("input, select").forEach((control) =>
    control.addEventListener("input", () => applyFilters(page)),
  );
  toolbar
    .querySelector(".manager-subcategory-add")
    ?.addEventListener("click", () => openForm(page, "add"));
}

function ensureListHeader(page) {
  const list = page.querySelector(".manager-two-columns > .manager-card:first-child");
  if (!list) return;
  list.classList.add("manager-subcategory-list");
  const h2 = list.querySelector(":scope > h2");
  if (h2 && !h2.parentElement?.classList.contains("manager-subcategory-list-heading")) {
    const heading = document.createElement("div");
    heading.className = "manager-subcategory-list-heading";
    h2.before(heading);
    heading.appendChild(h2);
    const counter = document.createElement("span");
    counter.dataset.subcategoryVisible = "true";
    counter.textContent = "0 subkategori";
    heading.appendChild(counter);
  }
}

function ensureFormPolish(page) {
  const form = page.querySelector(".manager-subcategory-form");
  if (!form) return;
  form.classList.add("manager-subcategory-form-polished");

  const title = form.querySelector(":scope > h2");
  if (title && !form.querySelector(".manager-subcategory-form-header")) {
    const header = document.createElement("div");
    header.className = "manager-subcategory-form-header";
    title.before(header);
    header.appendChild(title);
    const subtitle = document.createElement("p");
    subtitle.textContent = title.textContent?.startsWith("Edit")
      ? "Ubah struktur subkategori sesuai kebutuhan operasional."
      : "Tambahkan struktur baru untuk mengelompokkan produk.";
    header.appendChild(subtitle);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "manager-subcategory-form-close";
    close.setAttribute("aria-label", "Tutup form subkategori");
    close.textContent = "×";
    close.addEventListener("click", () => page.classList.remove("subcategory-form-open"));
    header.appendChild(close);
  }

  const labels = [...form.querySelectorAll(":scope > label")];
  labels.forEach((label) => {
    const text = label.childNodes[0]?.textContent?.trim()?.toLowerCase() || "";
    if (text.includes("kategori")) label.classList.add("field-category");
    if (text.includes("nama")) label.classList.add("field-name");
    if (text.includes("urutan")) label.classList.add("field-order");
  });

  const orderLabel = form.querySelector(".field-order");
  if (orderLabel && !orderLabel.querySelector("small")) {
    const help = document.createElement("small");
    help.textContent = "Menentukan urutan tampilan subkategori dalam kategori utama.";
    orderLabel.appendChild(help);
  }

  if (!form.querySelector(".manager-subcategory-status-note")) {
    const note = document.createElement("div");
    note.className = "manager-subcategory-status-note";
    note.innerHTML = `
      <span aria-hidden="true">✓</span>
      <div><strong>Status Subkategori</strong><small>Status aktif/nonaktif dapat diubah langsung dari daftar subkategori.</small></div>
    `;
    const primary = form.querySelector(".manager-primary");
    primary?.insertAdjacentElement("beforebegin", note);
  }

  if (!form.querySelector(".manager-subcategory-info")) {
    const info = document.createElement("aside");
    info.className = "manager-subcategory-info";
    info.innerHTML = `<strong>Informasi</strong><p>Subkategori digunakan untuk mengelompokkan produk di dalam kategori utama. Tidak memerlukan gambar karena visual produk dikelola pada Product Master.</p>`;
    form.appendChild(info);
  }
}

function bindRowActions(page) {
  page.querySelectorAll(".manager-subcategory-row").forEach((row) => {
    if (row.dataset.polishBound === "1") return;
    row.dataset.polishBound = "1";
    row.querySelectorAll("button").forEach((button) => {
      if (button.textContent?.trim() === "Edit") {
        button.addEventListener("click", () => {
          requestAnimationFrame(() => {
            ensureFormPolish(page);
            openForm(page, "edit");
          });
        });
      }
    });
  });
}

function enhance(page) {
  page.classList.add("manager-subcategory-polished");
  const rows = decorateRows(page);
  ensureSummary(page, rows);
  ensureToolbar(page, rows);
  ensureListHeader(page);
  ensureFormPolish(page);
  bindRowActions(page);
  applyFilters(page);
}

export default function ManagerSubcategoryPolish() {
  useEffect(() => {
    let scheduled = false;
    const run = () => {
      scheduled = false;
      const page = document.querySelector(".manager-subcategory-page");
      if (page) enhance(page);
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(run);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}
