export const SEARCH_MIN_LENGTH = 3;
export const SEARCH_MAX_LENGTH = 120;
export const SEARCH_DEBOUNCE_MS = 700;
export const SEARCH_RESULT_LIMIT = 3;

export function normalizeLocationQuery(value) {
  return typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[\p{Cc}\p{Cf}]/gu, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

export function validLocationQuery(value) {
  return (
    value.length <= SEARCH_MAX_LENGTH &&
    (value.match(/[\p{L}\p{N}]/gu)?.length || 0) >= SEARCH_MIN_LENGTH
  );
}
