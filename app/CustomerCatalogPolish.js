"use client";

import { useEffect } from "react";

const CATEGORY_ORDER = ["Makanan", "Minuman", "Bahan Baku"];
const CATEGORY_COPY = {
  Makanan: "Hidangan utama dan menu siap santap.",
  Minuman: "Pilihan minuman untuk menemani pesananmu.",
  "Bahan Baku": "Bahan pilihan untuk kebutuhan rumah atau usaha.",
};

const packageIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
    <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" />
    <path d="m8 5.2 8 4.5" />
  </svg>`;

function cleanText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function categoryRank(name) {
  const index = CATEGORY_ORDER.indexOf(name);
  return index === -1 ? CATEGORY_ORDER.length + 1 : index;
}

function buildSubcategoryRank(data) {
  const ranks = new Map();
  for (const category of data?.categories || []) {
    const items = (data?.subcategories || [])
      .filter((item) => Number(item.category_id) === Number(category.id))
      .sort(
        (a, b) =>
          Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
          String(a.name).localeCompare(String(b.name), "id"),
      );
    items.forEach((item, index) =>
      ranks.set(`${category.name}::${item.name}`, index),
    );
  }
  return ranks;
}

function makeCategoryHeading(name) {
  const heading = document.createElement("div");
  heading.className = "catalog-group-category-heading customer-catalog-polish-node";

  const icon = document.createElement("span");
  icon.className = "catalog-group-category-icon";
  if (name === "Bahan Baku") icon.innerHTML = packageIcon;
  else icon.textContent = name === "Minuman" ? "◌" : "•";

  const copy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = name;
  const description = document.createElement("p");
  description.textContent = CATEGORY_COPY[name] || "Pilihan produk Warkost Bahagia.";
  copy.append(title, description);
  heading.append(icon, copy);
  return heading;
}

function makeSubcategoryHeading(name) {
  const heading = document.createElement("div");
  heading.className = "catalog-group-subcategory-heading customer-catalog-polish-node";
  const title = document.createElement("h4");
  title.textContent = name || "Lainnya";
  heading.append(title);
  return heading;
}

function applyCatalogPolish(data) {
  const catalog = document.querySelector(".customer-catalog");
  if (!catalog) return;

  const categoryFilter = catalog.querySelector(
    '.filters[aria-label="Kategori produk"]',
  );
  const categoryButtons = categoryFilter
    ? [...categoryFilter.querySelectorAll(":scope > button")]
    : [];

  const rawMaterialButton = categoryButtons.find(
    (button) => cleanText(button.textContent) === "Bahan Baku",
  );
  if (rawMaterialButton) {
    const legacyIcon = rawMaterialButton.querySelector(":scope > span");
    if (legacyIcon && !legacyIcon.classList.contains("material-category-icon")) {
      legacyIcon.className = "material-category-icon";
      legacyIcon.innerHTML = packageIcon;
    }
  }

  const subcategoryFilter = catalog.querySelector(
    '.subcategory-filters[aria-label="Subkategori produk"]',
  );
  const allSubcategoryButton = subcategoryFilter?.querySelector(
    ":scope > button:first-child",
  );
  if (allSubcategoryButton && cleanText(allSubcategoryButton.textContent) !== "Semua")
    allSubcategoryButton.textContent = "Semua";

  for (const price of catalog.querySelectorAll(
    ".customer-product .product-price-stack > strong",
  )) {
    const current = cleanText(price.textContent);
    if (!current.includes("/")) continue;
    price.textContent = current.split("/")[0].trim();
  }

  const grid = catalog.querySelector("#menu-grid.customer-products");
  if (!grid) return;

  grid
    .querySelectorAll(":scope > .customer-catalog-polish-node")
    .forEach((node) => node.remove());

  const allCategoriesVisible =
    categoryButtons.length > 0 &&
    !categoryButtons.some((button) => button.classList.contains("active"));

  const catalogHeading = catalog.querySelector(".catalog-heading");
  const headingTitle = catalogHeading?.querySelector("h2");
  const headingDescription = catalogHeading?.querySelector("p");
  if (headingTitle && !headingTitle.dataset.defaultText)
    headingTitle.dataset.defaultText = headingTitle.textContent;
  if (headingDescription && !headingDescription.dataset.defaultText)
    headingDescription.dataset.defaultText = headingDescription.textContent;

  if (!allCategoriesVisible) {
    if (headingTitle?.dataset.defaultText)
      headingTitle.textContent = headingTitle.dataset.defaultText;
    if (headingDescription?.dataset.defaultText)
      headingDescription.textContent = headingDescription.dataset.defaultText;
    grid.classList.remove("catalog-grouped-view");
    return;
  }

  if (headingTitle) headingTitle.textContent = "Semua Menu";
  if (headingDescription)
    headingDescription.textContent =
      "Jelajahi pilihan Warkost berdasarkan kategori dan subkategori.";
  grid.classList.add("catalog-grouped-view");

  const subcategoryRanks = buildSubcategoryRank(data);
  const cards = [...grid.querySelectorAll(":scope > article.customer-product")];
  const cardMeta = cards.map((card, originalIndex) => {
    const body = card.querySelector(".product-body");
    const categoryName = cleanText(body?.querySelector(":scope > small:not(.product-subcategory)")?.textContent);
    const subcategoryName = cleanText(
      body?.querySelector(".product-subcategory")?.textContent,
    );
    return { card, categoryName, subcategoryName, originalIndex };
  });

  cardMeta.sort((a, b) => {
    const categoryDelta = categoryRank(a.categoryName) - categoryRank(b.categoryName);
    if (categoryDelta) return categoryDelta;
    const aSub = subcategoryRanks.get(`${a.categoryName}::${a.subcategoryName}`) ?? 999;
    const bSub = subcategoryRanks.get(`${b.categoryName}::${b.subcategoryName}`) ?? 999;
    if (aSub !== bSub) return aSub - bSub;
    return a.originalIndex - b.originalIndex;
  });

  let lastCategory = null;
  let lastSubcategory = null;
  for (const item of cardMeta) {
    if (item.categoryName !== lastCategory) {
      grid.appendChild(makeCategoryHeading(item.categoryName || "Lainnya"));
      lastCategory = item.categoryName;
      lastSubcategory = null;
    }
    if (item.subcategoryName !== lastSubcategory) {
      grid.appendChild(makeSubcategoryHeading(item.subcategoryName || "Lainnya"));
      lastSubcategory = item.subcategoryName;
    }
    grid.appendChild(item.card);
  }
}

export default function CustomerCatalogPolish() {
  useEffect(() => {
    let menuData = null;
    let observer;
    let frame = 0;

    const observe = () => {
      observer?.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
      });
    };

    const run = () => {
      frame = 0;
      observer?.disconnect();
      try {
        applyCatalogPolish(menuData);
      } finally {
        observe();
      }
    };

    const schedule = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(run);
    };

    observer = new MutationObserver(schedule);
    observe();
    schedule();

    fetch("/api/menu", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        menuData = data;
        schedule();
      })
      .catch(() => {});

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return null;
}
