// ESC/POS 80mm / 48 columns. Strip control bytes: product text cannot inject commands.
const clean = (s) =>
  String(s ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, " ")
    .slice(0, 500);
const lines = (s) =>
  clean(s)
    .match(/.{1,48}/g)
    ?.join("\n") || "";
export function renderEscPos(payload, station) {
  if (
    !["ADMIN", "KITCHEN"].includes(station) ||
    payload.station !== station ||
    !["PICKUP", "DELIVERY"].includes(payload.serviceType) ||
    !Array.isArray(payload.items) ||
    !payload.items.length ||
    !Number.isSafeInteger(payload.orderId) ||
    payload.orderId < 1
  )
    throw Error("Invalid print payload");
  const text = [
    "WARKOST BAHAGIA",
    station + " " + payload.serviceType,
    "WB" + String(payload.orderId).padStart(6, "0"),
    "-".repeat(48),
  ];
  for (const item of payload.items) {
    if (!Number.isFinite(item.quantity) || item.quantity <= 0)
      throw Error("Invalid quantity");
    text.push(lines(`${item.quantityLabel || item.quantity} x ${item.name}`));
    if (item.prepStation) text.push(lines(`[${item.prepStation}]`));
    if (item.note) text.push(lines("Catatan: " + item.note));
    if (station === "ADMIN")
      text.push(
        lines(
          "Rp " +
            Number(item.lineTotal ?? item.price * item.quantity).toLocaleString(
              "id-ID",
            ),
        ),
      );
  }
  if (station === "ADMIN") {
    for (const [label, value] of [
      ["Subtotal", payload.subtotal],
      ["Ongkir", payload.deliveryFee],
      ["Total", payload.total],
    ]) {
      if (!Number.isFinite(value) || value < 0) throw Error("Invalid total");
      text.push(`${label}: Rp ${value.toLocaleString("id-ID")}`);
    }
    if (payload.serviceType === "DELIVERY") text.push(lines(payload.address));
  }
  const bytes = Buffer.concat([
    Buffer.from([27, 64]),
    Buffer.from(text.join("\n") + "\n\n\n\n", "ascii"),
    Buffer.from([29, 86, 0]),
  ]);
  if (bytes.length > 65536) throw Error("Ticket too large");
  return bytes;
}
