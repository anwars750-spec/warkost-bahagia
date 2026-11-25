import { formatStockQuantity } from "../lib/product-units.mjs";
export const CATEGORY_COPY = Object.freeze({
  Makanan: "Menu favorit yang siap dipesan.",
  Minuman: "Temani pesananmu dengan minuman pilihan.",
  "Bahan Baku": "Pilihan bahan berkualitas untuk kebutuhanmu.",
});
const categoryOrder = ["Makanan", "Minuman", "Bahan Baku"];
export function compactQuantity(value, unit) {
  return formatStockQuantity(value, unit)
    .replace(/\s*pcs\b/gi, "")
    .replace(/\s+g$/, "g")
    .trim();
}
export function compactStepQuantity(value, unit) {
  const quantity = Number(value || 0);
  if (unit !== "GRAM") return String(quantity);
  return quantity >= 1000
    ? `${String(quantity / 1000).replace(".", ",")} kg`
    : `${quantity}g`;
}
export function catalogPresentation(menu, products, categoryId, subcategoryId) {
  const category =
    menu.categories.find((item) => item.id === categoryId)?.name ||
    "Menu Pilihan";
  const subcategory = menu.subcategories?.find(
    (item) => item.id === subcategoryId,
  )?.name;
  const ranks = new Map();
  for (const item of menu.categories) {
    (menu.subcategories || [])
      .filter((sub) => sub.category_id === item.id)
      .sort(
        (a, b) =>
          Number(a.sort_order || 0) - Number(b.sort_order || 0) ||
          a.name.localeCompare(b.name, "id"),
      )
      .forEach((sub, index) => ranks.set(sub.id, index));
  }
  const entries = products.map((product, index) => ({
    product,
    index,
    categoryName:
      menu.categories.find((item) => item.id === product.category_id)?.name ||
      "Lainnya",
    subcategoryName:
      menu.subcategories?.find((item) => item.id === product.subcategory_id)
        ?.name || "Lainnya",
  }));
  if (!categoryId) {
    const rank = (name) =>
      categoryOrder.includes(name) ? categoryOrder.indexOf(name) : 4;
    entries.sort(
      (a, b) =>
        rank(a.categoryName) - rank(b.categoryName) ||
        (ranks.get(a.product.subcategory_id) ?? 999) -
          (ranks.get(b.product.subcategory_id) ?? 999) ||
        a.index - b.index,
    );
    const counts = new Map();
    for (const item of entries)
      counts.set(item.categoryName, (counts.get(item.categoryName) || 0) + 1);
    let lastCategory, lastSubcategory;
    for (const item of entries) {
      item.categoryStart = item.categoryName !== lastCategory;
      item.subcategoryStart =
        item.categoryStart || item.subcategoryName !== lastSubcategory;
      item.categoryCount = counts.get(item.categoryName);
      lastCategory = item.categoryName;
      lastSubcategory = item.subcategoryName;
    }
  }
  return {
    entries,
    categoryCopy: CATEGORY_COPY,
    kicker: !categoryId
      ? "KATALOG WARKOST"
      : subcategory
        ? category
        : "PILIHAN MENU",
    title: !categoryId ? "Semua Menu" : subcategory || category,
    description: !categoryId
      ? "Temukan favoritmu, tambahkan ke keranjang, lalu pesan dengan cepat."
      : subcategory
        ? "Pilihan yang tersedia dan siap dipesan."
        : CATEGORY_COPY[category] || "Pilih menu favoritmu.",
  };
}
