export const PRODUCT_BADGE_OPTIONS = Object.freeze([
  { value: "", label: "Tanpa label" },
  { value: "FAVORITE", label: "Favorit" },
  { value: "BEST_SELLER", label: "Best Seller" },
  { value: "POPULAR", label: "Populer" },
  { value: "RECOMMENDED", label: "Rekomendasi" },
]);

export const PRODUCT_BADGE_PRESENTATION = Object.freeze({
  FAVORITE: Object.freeze({ label: "Favorit", icon: "♥", className: "favorite" }),
  BEST_SELLER: Object.freeze({ label: "Best Seller", icon: "★", className: "best-seller" }),
  POPULAR: Object.freeze({ label: "Populer", icon: "●", className: "popular" }),
  RECOMMENDED: Object.freeze({ label: "Rekomendasi", icon: "♛", className: "recommended" }),
});

export function normalizeProductBadgeType(value) {
  if (value === "" || value == null) return null;
  if (typeof value !== "string" || !Object.prototype.hasOwnProperty.call(PRODUCT_BADGE_PRESENTATION, value))
    throw new Error("Label produk tidak valid");
  return value;
}

export function productBadgePresentation(value) {
  return Object.prototype.hasOwnProperty.call(PRODUCT_BADGE_PRESENTATION, value)
    ? PRODUCT_BADGE_PRESENTATION[value]
    : null;
}
