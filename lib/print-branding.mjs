const printBrandHtml = (serviceType) => `
  <div class="warkost-print-brand-logo-wrap">
    <img src="/warkost-bahagia-logo-clean.png" alt="Warkost Bahagia" />
  </div>
  <div class="warkost-print-brand-copy">
    <strong>WARKOST BAHAGIA</strong>
    <span>${serviceType}</span>
  </div>
`;

const READY_FLAG = "true";

export function ensurePrintBranding(
  sheet,
  createElement = (tagName) => document.createElement(tagName),
) {
  if (!sheet || typeof sheet.querySelector !== "function") return false;

  if (sheet.dataset) sheet.dataset.warkostPrintSheet = "true";

  const serviceType =
    sheet.dataset?.fulfillmentType ??
    (sheet.matches?.(".admin-order-print-sheet, .kitchen-print-sheet") ? "" : "DELIVERY");
  const label = ["PICKUP", "DELIVERY"].includes(serviceType) ? serviceType : "";
  let header = sheet.querySelector(":scope > .warkost-print-brand");
  if (header?.dataset?.warkostPrintServiceType === label) return false;

  if (!header) {
    header = createElement("div");
    header.className = "warkost-print-brand";
    sheet.prepend(header);
  }

  if (header.dataset) {
    header.dataset.warkostPrintBrandReady = READY_FLAG;
    header.dataset.warkostPrintServiceType = label;
  }
  header.innerHTML = printBrandHtml(label);
  return true;
}
