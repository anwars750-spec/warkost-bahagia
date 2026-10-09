"use client";

import { useEffect } from "react";

const CATEGORY_ORDER = ["Makanan", "Minuman", "Bahan Baku"];
const CATEGORY_COPY = {
  Makanan: "Menu favorit yang siap dipesan.",
  Minuman: "Temani pesananmu dengan minuman pilihan.",
  "Bahan Baku": "Pilihan bahan berkualitas untuk kebutuhanmu.",
};

const allIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="4" y="4" width="6" height="6" rx="1.5" />
    <rect x="14" y="4" width="6" height="6" rx="1.5" />
    <rect x="4" y="14" width="6" height="6" rx="1.5" />
    <rect x="14" y="14" width="6" height="6" rx="1.5" />
  </svg>`;
const foodIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 12h16a8 8 0 0 1-16 0Z" />
    <path d="M7 20h10M8 8c0-2 2-2 2-4M13 8c0-2 2-2 2-4" />
  </svg>`;
const drinkIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M7 8h10l-1 13H8L7 8Z" />
    <path d="M9 4h8M15 4l-2 5" />
  </svg>`;
const packageIcon = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" />
    <path d="m4.5 7.5 7.5 4 7.5-4M12 11.5V21" />
    <path d="m8 5.2 8 4.5" />
  </svg>`;

function iconForCategory(name) {
  if (name === "Minuman") return drinkIcon;
  if (name === "Bahan Baku") return packageIcon;
  return foodIcon;
}

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

function makeCategoryHeading(name, count) {
  const heading = document.createElement("div");
  heading.className =
    "catalog-group-category-heading customer-catalog-polish-node";

  const icon = document.createElement("span");
  icon.className = "catalog-group-category-icon";
  icon.innerHTML = iconForCategory(name);

  const copy = document.createElement("div");
  copy.className = "catalog-group-category-copy";
  const kicker = document.createElement("span");
  kicker.className = "catalog-group-kicker";
  kicker.textContent = "KATEGORI";
  const title = document.createElement("h3");
  title.textContent = name;
  const description = document.createElement("p");
  description.textContent =
    CATEGORY_COPY[name] || "Pilihan produk Warkost Bahagia.";
  copy.append(kicker, title, description);

  const badge = document.createElement("span");
  badge.className = "catalog-group-count";
  badge.textContent = `${count} menu`;

  heading.append(icon, copy, badge);
  return heading;
}

function makeSubcategoryHeading(name) {
  const heading = document.createElement("div");
  heading.className =
    "catalog-group-subcategory-heading customer-catalog-polish-node";

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
  if (!categoryFilter) return;

  const catalogHeading = catalog.querySelector(".catalog-heading");
  const legacyAllButton = catalogHeading?.querySelector(":scope > button");

  let allButton = categoryFilter.querySelector(":scope > .catalog-all-filter");
  if (!allButton) {
    allButton = document.createElement("button");
    allButton.type = "button";
    allButton.className = "catalog-all-filter";
    allButton.setAttribute("aria-label", "Tampilkan semua kategori");
    allButton.innerHTML = `<span class="catalog-filter-icon">${allIcon}</span><span>Semua</span>`;
    allButton.addEventListener("click", () => legacyAllButton?.click());
    categoryFilter.prepend(allButton);
  }

  const categoryButtons = [
    ...categoryFilter.querySelectorAll(":scope > button:not(.catalog-all-filter)"),
  ];
  const activeCategoryButton = categoryButtons.find((button) =>
    button.classList.contains("active"),
  );
  const allCategoriesVisible = !activeCategoryButton;
  allButton.classList.toggle("active", allCategoriesVisible);
  allButton.setAttribute("aria-pressed", allCategoriesVisible ? "true" : "false");

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
  if (
    allSubcategoryButton &&
    cleanText(allSubcategoryButton.textContent) !== "Semua"
  )
    allSubcategoryButton.textContent = "Semua";

  for (const price of catalog.querySelectorAll(
    ".customer-product .product-price-stack > strong",
  )) {
    const current = cleanText(price.textContent);
    if (!current.includes("/")) continue;
    price.textContent = current.split("/")[0].trim();
  }

  const headingCopy = catalogHeading?.querySelector(":scope > div");
  const headingTitle = catalogHeading?.querySelector("h2");
  const headingDescription = catalogHeading?.querySelector("p");
  let headingKicker = headingCopy?.querySelector(".catalog-heading-kicker");
  if (headingCopy && !headingKicker) {
    headingKicker = document.createElement("span");
    headingKicker.className = "catalog-heading-kicker";
    headingCopy.insertBefore(headingKicker, headingTitle || headingCopy.firstChild);
  }

  const activeSubcategoryButton = subcategoryFilter?.querySelector(
    ":scope > button.active:not(:first-child)",
  );
  const activeCategoryName = cleanText(activeCategoryButton?.textContent);
  const activeSubcategoryName = cleanText(activeSubcategoryButton?.textContent);

  if (headingTitle && headingDescription && headingKicker) {
    if (allCategoriesVisible) {
      headingKicker.textContent = "KATALOG WARKOST";
      headingTitle.textContent = "Semua Menu";
      headingDescription.textContent =
        "Temukan favoritmu, tambahkan ke keranjang, lalu pesan dengan cepat.";
    } else if (activeSubcategoryName) {
      headingKicker.textContent = activeCategoryName || "MENU";
      headingTitle.textContent = activeSubcategoryName;
      headingDescription.textContent = "Pilihan yang tersedia dan siap dipesan.";
    } else {
      headingKicker.textContent = "PILIHAN MENU";
      headingTitle.textContent = activeCategoryName || "Menu Pilihan";
      headingDescription.textContent =
        CATEGORY_COPY[activeCategoryName] || "Pilih menu favoritmu.";
    }
  }

  const grid = catalog.querySelector("#menu-grid.customer-products");
  if (!grid) return;

  grid
    .querySelectorAll(":scope > .customer-catalog-polish-node")
    .forEach((node) => node.remove());

  const existingCards = [
    ...grid.querySelectorAll(":scope > article.customer-product"),
  ];

  if (!allCategoriesVisible) {
    grid.classList.remove("catalog-grouped-view");
    existingCards.forEach((card) => card.style.removeProperty("order"));
    return;
  }

  grid.classList.add("catalog-grouped-view");

  const subcategoryRanks = buildSubcategoryRank(data);
  const cardMeta = existingCards.map((card, originalIndex) => {
    const body = card.querySelector(".product-body");
    const categoryName = cleanText(
      body?.querySelector(":scope > small:not(.product-subcategory)")
        ?.textContent,
    );
    const subcategoryName = cleanText(
      body?.querySelector(".product-subcategory")?.textContent,
    );
    return { card, categoryName, subcategoryName, originalIndex };
  });

  cardMeta.sort((a, b) => {
    const categoryDelta =
      categoryRank(a.categoryName) - categoryRank(b.categoryName);
    if (categoryDelta) return categoryDelta;
    const aSub =
      subcategoryRanks.get(`${a.categoryName}::${a.subcategoryName}`) ?? 999;
    const bSub =
      subcategoryRanks.get(`${b.categoryName}::${b.subcategoryName}`) ?? 999;
    if (aSub !== bSub) return aSub - bSub;
    return a.originalIndex - b.originalIndex;
  });

  const categoryCounts = new Map();
  for (const item of cardMeta) {
    const category = item.categoryName || "Lainnya";
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }

  // IMPORTANT: never move React-owned product cards in the DOM. Moving them with
  // appendChild breaks the live React interaction contract in the grouped “Semua”
  // view. We keep every card exactly where React rendered it and use CSS order only.
  let sequence = 0;
  let lastCategory = null;
  let lastSubcategory = null;
  for (const item of cardMeta) {
    const category = item.categoryName || "Lainnya";
    const subcategory = item.subcategoryName || "Lainnya";

    if (category !== lastCategory) {
      const categoryHeading = makeCategoryHeading(
        category,
        categoryCounts.get(category) || 0,
      );
      categoryHeading.style.order = String(sequence++);
      grid.appendChild(categoryHeading);
      lastCategory = category;
      lastSubcategory = null;
    }

    if (subcategory !== lastSubcategory) {
      const subcategoryHeading = makeSubcategoryHeading(subcategory);
      subcategoryHeading.style.order = String(sequence++);
      grid.appendChild(subcategoryHeading);
      lastSubcategory = subcategory;
    }

    item.card.style.order = String(sequence++);
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
