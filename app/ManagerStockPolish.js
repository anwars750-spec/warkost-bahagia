"use client";

import { useEffect } from "react";

const FALLBACK_IMAGE = "/demo/promo-warkost.webp";

const icons = {
  total: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z"/><path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21"/></svg>`,
  safe: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8.5 12 2.2 2.2 4.8-5"/></svg>`,
  low: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 3.5 19h17L12 4Z"/><path d="M12 9v4M12 16.5h.01"/></svg>`,
  out: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6M15 9l-6 6"/></svg>`,
  search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/></svg>`,
  adjust: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M10 17h10M4 17h2M14 4v6M10 14v6"/></svg>`,
  close: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>`,
};

const CATEGORY_ORDER = new Map([
  ["makanan", 0],
  ["minuman", 1],
  ["bahan baku", 2],
]);

const normalize = (value) => String(value || "").trim().toLowerCase();

function parseIdentity(row) {
  const identity = row.firstElementChild;
  const name = identity?.querySelector("strong")?.textContent?.trim() || "Produk";
  const raw = identity?.querySelector("small")?.textContent?.replace(/\s+/g, " ")?.trim() || "";
  const [category = "Umum", subcategory = "Umum"] = raw.split("·").map((part) => part.trim());
  return { name, category, subcategory };
}

function metricMap(row) {
  const result = {};
  row.querySelectorAll("dl > div").forEach((item) => {
    const key = item.querySelector("dt")?.textContent?.trim()?.toLowerCase();
    const value = item.querySelector("dd")?.textContent?.replace(/\s+/g, " ")?.trim();
    if (key) result[key] = value || "";
  });
  return result;
}

function parseQuantity(label, unit) {
  const text = String(label || "").toLowerCase().replace(",", ".");
  const number = Number((text.match(/-?\d+(?:\.\d+)?/) || [0])[0]);
  if (String(unit).toUpperCase() === "GRAM" && text.includes("kg")) return number * 1000;
  return Number.isFinite(number) ? number : 0;
}

function stockState(row, master) {
  const metrics = metricMap(row);
  const available = parseQuantity(metrics.available, master?.stock_unit);
  const threshold = Number(master?.low_stock_threshold || 0);
  if (available <= 0) return "out";
  if (available <= threshold) return "low";
  return "safe";
}

function imageFor(master, name) {
  if (master?.image_url) return master.image_url;
  const normalized = normalize(name);
  if (normalized.includes("nasi goreng")) return "/demo/nasi-goreng-warkost.webp";
  if (normalized.includes("mie ayam")) return "/demo/mie-ayam-bahagia.webp";
  if (normalized.includes("kopi susu")) return "/demo/kopi-susu-rumah.webp";
  if (normalized.includes("biji kopi")) return "/demo/bahan-baku-kopi.svg";
  return FALLBACK_IMAGE;
}

async function loadMaster() {
  try {
    const response = await fetch("/api/inventory", { cache: "no-store" });
    return response.ok ? await response.json() : { products: [] };
  } catch {
    return { products: [] };
  }
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function sortRows(page, rows, inventory, masterByName) {
  const subcategoryOrder = new Map(
    (inventory.subcategories || []).map((row) => [
      Number(row.id),
      Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 9999,
    ]),
  );

  const sorted = [...rows].sort((left, right) => {
    const leftIdentity = parseIdentity(left);
    const rightIdentity = parseIdentity(right);
    const leftMaster = masterByName.get(normalize(leftIdentity.name));
    const rightMaster = masterByName.get(normalize(rightIdentity.name));

    const leftCategory = CATEGORY_ORDER.get(normalize(leftIdentity.category)) ?? 99;
    const rightCategory = CATEGORY_ORDER.get(normalize(rightIdentity.category)) ?? 99;
    if (leftCategory !== rightCategory) return leftCategory - rightCategory;

    const leftSubcategory = subcategoryOrder.get(Number(leftMaster?.subcategory_id)) ?? 9999;
    const rightSubcategory = subcategoryOrder.get(Number(rightMaster?.subcategory_id)) ?? 9999;
    if (leftSubcategory !== rightSubcategory) return leftSubcategory - rightSubcategory;

    const subcategoryName = leftIdentity.subcategory.localeCompare(
      rightIdentity.subcategory,
      "id",
      { sensitivity: "base" },
    );
    if (subcategoryName !== 0) return subcategoryName;

    return leftIdentity.name.localeCompare(rightIdentity.name, "id", {
      sensitivity: "base",
    });
  });

  const list = page.querySelector(".manager-stock-list");
  sorted.forEach((row) => list?.appendChild(row));
  return sorted;
}

function ensureSummary(page, rows, masterByName) {
  let summary = page.querySelector(".manager-stock-summary");
  if (!summary) {
    summary = document.createElement("section");
    summary.className = "manager-stock-summary";
    summary.innerHTML = `
      <article class="manager-stock-kpi kpi-total"><span class="manager-stock-kpi-icon">${icons.total}</span><div><strong data-value>0</strong><b>Total Item Stok</b><small>Semua kategori</small></div></article>
      <article class="manager-stock-kpi kpi-safe"><span class="manager-stock-kpi-icon">${icons.safe}</span><div><strong data-value>0</strong><b>Stok Aman</b><small>Di atas minimum</small></div></article>
      <article class="manager-stock-kpi kpi-low"><span class="manager-stock-kpi-icon">${icons.low}</span><div><strong data-value>0</strong><b>Stok Rendah</b><small>Perlu perhatian</small></div></article>
      <article class="manager-stock-kpi kpi-out"><span class="manager-stock-kpi-icon">${icons.out}</span><div><strong data-value>0</strong><b>Stok Habis</b><small>Tidak tersedia</small></div></article>
    `;
    page.querySelector(".manager-page-title")?.insertAdjacentElement("afterend", summary);
  }
  const counts = { total: rows.length, safe: 0, low: 0, out: 0 };
  rows.forEach((row) => {
    const { name } = parseIdentity(row);
    counts[stockState(row, masterByName.get(normalize(name)))] += 1;
  });
  [counts.total, counts.safe, counts.low, counts.out].forEach((value, index) => {
    setText(summary.querySelectorAll("[data-value]")[index], String(value));
  });
}

function applyFilters(page) {
  const search = normalize(page.querySelector("[data-stock-search]")?.value);
  const category = page.querySelector("[data-stock-category]")?.value || "all";
  const status = page.querySelector("[data-stock-status]")?.value || "all";
  let visible = 0;
  page.querySelectorAll(".manager-stock-row").forEach((row) => {
    const show =
      (!search || normalize(row.dataset.search).includes(search)) &&
      (category === "all" || row.dataset.category === category) &&
      (status === "all" || row.dataset.stockState === status);
    row.hidden = !show;
    if (show) visible += 1;
  });
  setText(page.querySelector("[data-stock-visible]"), `${visible} item`);
}

function createDrawer(page, rows, masterByName) {
  let drawer = document.querySelector('[data-manager-stock-drawer="true"]');
  if (drawer) {
    const previousRows = drawer.__stockRows || [];
    const sameRows = previousRows.length === rows.length && previousRows.every((row, index) => row === rows[index]);
    if (sameRows) return drawer;
    drawer.remove();
  }

  drawer = document.createElement("div");
  drawer.dataset.managerStockDrawer = "true";
  drawer.__stockRows = rows;
  drawer.className = "manager-stock-drawer-shell";
  drawer.hidden = true;
  drawer.innerHTML = `
    <div class="manager-stock-drawer-backdrop" data-stock-close></div>
    <aside class="manager-stock-drawer" role="dialog" aria-modal="true" aria-label="Penyesuaian stok">
      <header>
        <div><span>PENYESUAIAN STOK</span><h2>Atur Stok Produk</h2><p>Tambah atau kurangi stok. Setiap perubahan wajib memiliki alasan.</p></div>
        <button type="button" class="manager-stock-drawer-close" data-stock-close aria-label="Tutup">${icons.close}</button>
      </header>
      <form data-stock-drawer-form>
        <label class="manager-stock-field wide">Produk
          <select data-stock-product required></select>
        </label>
        <div class="manager-stock-selected" data-stock-selected></div>
        <label class="manager-stock-field">Jumlah penyesuaian
          <input data-stock-quantity type="number" required placeholder="Contoh: 10 atau -5" />
          <small>Gunakan angka positif untuk menambah, negatif untuk mengurangi.</small>
        </label>
        <label class="manager-stock-field">Alasan penyesuaian
          <textarea data-stock-reason required minlength="3" maxlength="240" rows="3" placeholder="Contoh: Restock supplier, koreksi opname, barang rusak..."></textarea>
        </label>
        <div class="manager-stock-drawer-actions"><button type="button" data-stock-close>Batal</button><button class="manager-primary" type="submit">Simpan Stok</button></div>
      </form>
    </aside>
  `;
  document.body.appendChild(drawer);

  const select = drawer.querySelector("[data-stock-product]");
  rows.forEach((row, index) => {
    const { name, category, subcategory } = parseIdentity(row);
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `${category} · ${subcategory} · ${name}`;
    select.appendChild(option);
  });

  const updateSelected = () => {
    const row = rows[Number(select.value || 0)];
    if (!row) return;
    const { name, category, subcategory } = parseIdentity(row);
    const metrics = metricMap(row);
    const master = masterByName.get(normalize(name));
    const target = drawer.querySelector("[data-stock-selected]");
    target.replaceChildren();
    const img = document.createElement("img");
    img.src = imageFor(master, name);
    img.alt = "";
    img.addEventListener("error", () => {
      if (!img.src.endsWith(FALLBACK_IMAGE)) img.src = FALLBACK_IMAGE;
    });
    const info = document.createElement("div");
    const strong = document.createElement("strong");
    strong.textContent = name;
    const small = document.createElement("small");
    small.textContent = `${category} · ${subcategory}`;
    const meta = document.createElement("span");
    meta.textContent = `Available ${metrics.available || "-"}`;
    info.append(strong, small, meta);
    target.append(img, info);
    const sourceQuantity = row.querySelector('input[name="quantity"]');
    const drawerQuantity = drawer.querySelector("[data-stock-quantity]");
    if (sourceQuantity?.step) drawerQuantity.step = sourceQuantity.step;
  };
  select.addEventListener("change", updateSelected);

  const close = () => {
    drawer.hidden = true;
    document.documentElement.classList.remove("manager-stock-drawer-open");
  };
  drawer.querySelectorAll("[data-stock-close]").forEach((button) => button.addEventListener("click", close));

  drawer.querySelector("[data-stock-drawer-form]").addEventListener("submit", (event) => {
    event.preventDefault();
    const row = rows[Number(select.value || 0)];
    if (!row) return;
    const quantityInput = row.querySelector('input[name="quantity"]');
    const reasonInput = row.querySelector('input[name="reason"]');
    if (!quantityInput || !reasonInput) return;
    quantityInput.value = drawer.querySelector("[data-stock-quantity]").value;
    reasonInput.value = drawer.querySelector("[data-stock-reason]").value.trim();
    row.requestSubmit();
    close();
    drawer.querySelector("[data-stock-quantity]").value = "";
    drawer.querySelector("[data-stock-reason]").value = "";
  });

  drawer.openFor = (row) => {
    const index = rows.indexOf(row);
    select.value = String(Math.max(0, index));
    updateSelected();
    drawer.hidden = false;
    document.documentElement.classList.add("manager-stock-drawer-open");
    setTimeout(() => drawer.querySelector("[data-stock-quantity]")?.focus(), 30);
  };
  updateSelected();
  return drawer;
}

function ensureToolbar(page, rows, masterByName) {
  let toolbar = page.querySelector(".manager-stock-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("section");
    toolbar.className = "manager-stock-toolbar";
    toolbar.innerHTML = `
      <label class="manager-stock-search"><span>${icons.search}</span><input data-stock-search aria-label="Cari stok" placeholder="Cari nama produk, kategori, atau subkategori..." /></label>
      <select data-stock-category aria-label="Filter kategori"><option value="all">Semua Kategori</option><option>Makanan</option><option>Minuman</option><option>Bahan Baku</option></select>
      <select data-stock-status aria-label="Filter status"><option value="all">Semua Status</option><option value="safe">Aman</option><option value="low">Stok Rendah</option><option value="out">Stok Habis</option></select>
      <button type="button" class="manager-primary manager-stock-adjust-all"><span>${icons.adjust}</span> Penyesuaian Stok</button>
    `;
    page.querySelector(".manager-stock-tabs")?.insertAdjacentElement("afterend", toolbar);
    toolbar.querySelectorAll("input, select").forEach((control) => control.addEventListener("input", () => applyFilters(page)));
  }
  const drawer = createDrawer(page, rows, masterByName);
  const adjust = toolbar.querySelector(".manager-stock-adjust-all");
  if (adjust && adjust.dataset.bound !== "1") {
    adjust.dataset.bound = "1";
    adjust.addEventListener("click", () => drawer.openFor(rows[0]));
  }
}

function decorateRows(page, rows, masterByName) {
  rows.forEach((row) => {
    const { name, category, subcategory } = parseIdentity(row);
    const master = masterByName.get(normalize(name));
    const state = stockState(row, master);
    row.dataset.category = category;
    row.dataset.stockState = state;
    row.dataset.search = `${name} ${category} ${subcategory}`;

    const identity = row.firstElementChild;
    identity?.classList.add("manager-stock-identity");
    if (identity && !identity.querySelector(".manager-stock-thumb")) {
      const img = document.createElement("img");
      img.className = "manager-stock-thumb";
      img.src = imageFor(master, name);
      img.alt = "";
      img.addEventListener("error", () => {
        if (!img.src.endsWith(FALLBACK_IMAGE)) img.src = FALLBACK_IMAGE;
      });
      identity.prepend(img);
    }
    if (identity && !identity.querySelector(".manager-stock-category-chip")) {
      const copy = identity.querySelector("small");
      const chip = document.createElement("span");
      chip.className = `manager-stock-category-chip cat-${normalize(category).replaceAll(" ", "-")}`;
      chip.textContent = category;
      copy?.insertAdjacentElement("afterend", chip);
    }

    row.querySelector("dl")?.classList.add("manager-stock-metrics");
    const oldStatus = row.querySelector("dl .manager-status");
    if (oldStatus) {
      oldStatus.className = `manager-stock-state state-${state}`;
      oldStatus.textContent = state === "safe" ? "Aman" : state === "low" ? "Rendah" : "Habis";
    }

    if (!row.querySelector(".manager-stock-action")) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "manager-stock-action";
      action.textContent = "Atur Stok";
      row.appendChild(action);
    }
  });
}

function ensureListHeader(page) {
  const list = page.querySelector(".manager-stock-list");
  if (!list) return;
  list.classList.add("manager-stock-list-polished");
  if (!list.querySelector(".manager-stock-list-heading")) {
    const heading = document.createElement("div");
    heading.className = "manager-stock-list-heading";
    heading.innerHTML = `<div><h2>Daftar Stok</h2><p>Urutan: Makanan → Minuman → Bahan Baku, lalu mengikuti urutan Subkategori di Product Master.</p></div><span data-stock-visible>0 item</span>`;
    list.prepend(heading);
  }
  if (!list.querySelector(".manager-stock-columns")) {
    const columns = document.createElement("div");
    columns.className = "manager-stock-columns";
    columns.innerHTML = `<span>Produk</span><span>Current / Reserved / Available</span><span>Status</span><span>Aksi</span>`;
    list.querySelector(".manager-stock-list-heading")?.insertAdjacentElement("afterend", columns);
  }
}

async function enhance(page) {
  if (page.dataset.stockEnhancing === "1") return;
  page.dataset.stockEnhancing = "1";
  try {
    page.classList.add("manager-stock-polished");
    const title = page.querySelector(".manager-page-title p");
    const subtitle = "Pantau dan sesuaikan stok Makanan, Minuman, dan Bahan Baku dari satu ledger. Gambar mengikuti Product Master.";
    if (title && title.textContent !== subtitle) title.textContent = subtitle;

    const inventory = await loadMaster();
    const masterByName = new Map((inventory.products || []).map((product) => [normalize(product.name), product]));
    let rows = [...page.querySelectorAll(".manager-stock-row")];
    rows = sortRows(page, rows, inventory, masterByName);
    decorateRows(page, rows, masterByName);
    ensureSummary(page, rows, masterByName);
    ensureToolbar(page, rows, masterByName);
    ensureListHeader(page);

    const drawer = createDrawer(page, rows, masterByName);
    rows.forEach((row) => {
      const action = row.querySelector(".manager-stock-action");
      if (action && action.dataset.bound !== "1") {
        action.dataset.bound = "1";
        action.addEventListener("click", () => drawer.openFor(row));
      }
    });
    applyFilters(page);
  } finally {
    page.dataset.stockEnhancing = "0";
  }
}

export default function ManagerStockPolish() {
  useEffect(() => {
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        const page = document.querySelector(".manager-stock-page");
        if (page) enhance(page);
      });
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      document.querySelector('[data-manager-stock-drawer="true"]')?.remove();
      document.documentElement.classList.remove("manager-stock-drawer-open");
    };
  }, []);
  return null;
}
