const normalize = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const PAYMENT_METHOD_LABELS = Object.freeze({
  CASH: "COD",
  COD: "COD",
  CASH_ON_DELIVERY: "COD",
  QRIS: "QRIS",
  TRANSFER: "TRANSFER BANK",
  BANK_TRANSFER: "TRANSFER BANK",
  TRANSFER_BANK: "TRANSFER BANK",
});

const PAYMENT_STATUS_LABELS = Object.freeze({
  PAID: "LUNAS",
  UNPAID: "BELUM DIBAYAR",
  PENDING: "MENUNGGU PEMBAYARAN",
  FAILED: "PEMBAYARAN GAGAL",
  EXPIRED: "PEMBAYARAN KEDALUWARSA",
  REFUNDED: "DANA DIKEMBALIKAN",
});

const ORDER_STATUS_LABELS = Object.freeze({
  PENDING: "MENUNGGU KONFIRMASI",
  CONFIRMED: "DIKONFIRMASI",
  PREPARING: "SEDANG DISIAPKAN",
  READY: "SIAP DIANTAR",
  ASSIGNED: "DRIVER DITUGASKAN",
  PICKED_UP: "SUDAH DIAMBIL DRIVER",
  ON_DELIVERY: "DALAM PENGANTARAN",
  IN_DELIVERY: "DALAM PENGANTARAN",
  OUT_FOR_DELIVERY: "DALAM PENGANTARAN",
  DELIVERED: "SELESAI DIANTAR",
  COMPLETED: "SELESAI",
  CANCELLED: "DIBATALKAN",
});

const fallbackLabel = (value, emptyLabel) => {
  const normalized = normalize(value);
  return normalized ? normalized.replaceAll("_", " ") : emptyLabel;
};

export const paymentMethodLabel = (value) =>
  PAYMENT_METHOD_LABELS[normalize(value)] ||
  fallbackLabel(value, "BELUM TERSEDIA");

export const paymentStatusLabel = (value) =>
  PAYMENT_STATUS_LABELS[normalize(value)] ||
  fallbackLabel(value, "BELUM TERSEDIA");

export const orderStatusLabel = (value) =>
  ORDER_STATUS_LABELS[normalize(value)] ||
  fallbackLabel(value, "BELUM TERSEDIA");

export const paymentGuidance = (method, status) => {
  const normalizedMethod = normalize(method);
  const normalizedStatus = normalize(status);
  const isCod = ["CASH", "COD", "CASH_ON_DELIVERY"].includes(
    normalizedMethod,
  );

  if (isCod && normalizedStatus !== "PAID") {
    return "Driver menagih tunai";
  }
  if (normalizedStatus === "PAID") {
    return "Tidak perlu menagih tunai";
  }
  return "Pembayaran belum dikonfirmasi";
};
