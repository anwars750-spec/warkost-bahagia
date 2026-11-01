export const PRINT_BRAND_HTML = `
  <div class="warkost-print-brand-logo-wrap">
    <img src="/warkost-bahagia-logo-clean.png" alt="Warkost Bahagia" />
  </div>
  <div class="warkost-print-brand-copy">
    <strong>WARKOST BAHAGIA</strong>
    <span>DELIVERY</span>
  </div>
`;

const READY_FLAG = "true";

export function ensurePrintBranding(
  sheet,
  createElement = (tagName) => document.createElement(tagName),
) {
  if (!sheet || typeof sheet.querySelector !== "function") return false;

  if (sheet.dataset) sheet.dataset.warkostPrintSheet = "true";

  let header = sheet.querySelector(":scope > .warkost-print-brand");
  if (header?.dataset?.warkostPrintBrandReady === READY_FLAG) return false;

  if (!header) {
    header = createElement("div");
    header.className = "warkost-print-brand";
    sheet.prepend(header);
  }

  if (header.dataset) header.dataset.warkostPrintBrandReady = READY_FLAG;
  header.innerHTML = PRINT_BRAND_HTML;
  return true;
}
