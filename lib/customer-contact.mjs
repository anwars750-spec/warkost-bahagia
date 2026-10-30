const digits = (value) => String(value || "").replace(/\D/g, "");

export function normalizeCustomerWhatsApp(value) {
  const raw = digits(value);
  const normalized = raw.startsWith("0")
    ? `62${raw.slice(1)}`
    : raw.startsWith("62")
      ? raw
      : "";
  return /^62\d{8,13}$/.test(normalized) ? normalized : "";
}

export function customerWhatsAppUrl(phone, orderId) {
  const number = normalizeCustomerWhatsApp(phone);
  const id = Number(orderId);
  if (!number || !Number.isSafeInteger(id) || id < 1) return "";
  const orderNumber = `WB${String(id).padStart(6, "0")}`;
  const message = `Halo, saya Driver Warkost Bahagia untuk pesanan ${orderNumber}. Saya ingin mengonfirmasi pengantaran pesanan Anda.`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
