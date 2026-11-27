// Capability declarations, not brand/model detection. No arbitrary command bytes.
export const PRINT_BRIDGE_PROTOCOL = 2;
export const DEFAULT_PRINT_PROFILE = Object.freeze({
  adapter: "ESC_POS_NETWORK",
  paperWidth: 80,
  columns: 48,
  font: "A",
  characterSet: "ASCII",
  codePage: null,
  cutMode: "FULL",
  cutCommand: "GS_V",
  feedLines: 4,
  copies: 1,
});
function invalid() {
  throw Object.assign(new Error("Profil printer tidak didukung"), {
    status: 400,
  });
}
export function normalizePrinterProfile(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) invalid();
  if (Object.keys(input).some((k) => !Object.hasOwn(DEFAULT_PRINT_PROFILE, k)))
    invalid();
  const width = input.paperWidth ?? 80;
  const p = {
    ...DEFAULT_PRINT_PROFILE,
    columns: width === 58 ? 32 : 48,
    ...input,
  };
  if (
    p.adapter !== "ESC_POS_NETWORK" ||
    ![58, 80].includes(p.paperWidth) ||
    !Number.isInteger(p.columns) ||
    p.columns < 16 ||
    p.columns >
      (p.paperWidth === 58
        ? p.font === "B"
          ? 42
          : 32
        : p.font === "B"
          ? 64
          : 48) ||
    !["A", "B"].includes(p.font) ||
    !["ASCII", "CP437", "CP858"].includes(p.characterSet) ||
    !["NONE", "FULL", "PARTIAL"].includes(p.cutMode) ||
    !["GS_V", "GS_V_FEED"].includes(p.cutCommand) ||
    !Number.isInteger(p.feedLines) ||
    p.feedLines < 0 ||
    p.feedLines > 8 ||
    !Number.isInteger(p.copies) ||
    p.copies < 1 ||
    p.copies > 5
  )
    invalid();
  if (
    p.codePage !== null &&
    (!Number.isInteger(p.codePage) || p.codePage < 0 || p.codePage > 255)
  )
    invalid();
  if (p.characterSet !== "ASCII" && p.codePage === null) invalid();
  return p;
}
