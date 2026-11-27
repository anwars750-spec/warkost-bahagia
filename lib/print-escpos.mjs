import { normalizePrinterProfile } from "./printer-profile.mjs";
import { CODEPAGES } from "./print-codepages.mjs";
const clean = (s) =>
  String(s ?? "")
    .normalize("NFC")
    .replace(/[\x00-\x1f\x7f-\x9f]/g, " ")
    .slice(0, 500);
function encode(text, profile) {
  if (profile.characterSet === "ASCII")
    return Buffer.from(
      text
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x20-\x7e\n]/g, "?"),
      "ascii",
    );
  const table = CODEPAGES[profile.characterSet];
  return Buffer.from(
    Array.from(text.normalize("NFC"), (char) => {
      const code = char.codePointAt(0);
      if (code === 10 || (code >= 32 && code <= 126)) return code;
      const index = table.indexOf(char);
      if (index < 0)
        throw Object.assign(
          new Error("Karakter tidak tersedia pada codepage printer"),
          { status: 400 },
        );
      return index + 128;
    }),
  );
}
export function renderEscPos(payload, station, options = {}) {
  const profile = normalizePrinterProfile(options);
  const lines = (value) => {
    const chars = Array.from(clean(value));
    const out = [];
    for (let i = 0; i < chars.length; i += profile.columns)
      out.push(chars.slice(i, i + profile.columns).join(""));
    return out.join("\n");
  };
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
    "-".repeat(profile.columns),
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
  const copies = [];
  for (let copy = 1; copy <= profile.copies; copy++) {
    const header =
      profile.copies > 1 ? `SALINAN ${copy}/${profile.copies}\n` : "";
    const cut =
      profile.cutMode === "NONE"
        ? []
        : profile.cutCommand === "GS_V"
          ? [29, 86, profile.cutMode === "FULL" ? 0 : 1]
          : [29, 86, profile.cutMode === "FULL" ? 65 : 66, 0];
    copies.push(
      Buffer.concat([
        Buffer.from([27, 64, 27, 77, profile.font === "B" ? 1 : 0]),
        Buffer.from(
          profile.codePage === null ? [] : [27, 116, profile.codePage],
        ),
        encode(
          header +
            text.flatMap((t) => String(t).split("\n").map(lines)).join("\n") +
            "\n".repeat(1 + profile.feedLines),
          profile,
        ),
        Buffer.from(cut),
      ]),
    );
  }
  const bytes = Buffer.concat(copies);
  if (bytes.length > 65536) throw Error("Ticket too large");
  return bytes;
}
