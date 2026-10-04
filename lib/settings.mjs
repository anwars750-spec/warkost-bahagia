import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
import {
  coordinate,
  normalizeWhatsApp,
  validateDeliveryRules,
} from "./delivery.mjs";

function mappedSettings(value) {
  return {
    brandName: value.brand_name || "Warkost Bahagia",
    rupiahPerPoint: 10000,
    businessWhatsApp: value.business_whatsapp || "6281546407856",
    businessLatitude: Number(value.business_latitude || -6.9217),
    businessLongitude: Number(value.business_longitude || 106.9272),
    deliveryFreeKm: Number(value.delivery_free_km ?? 5),
    deliveryFeePerKm: Number(value.delivery_fee_per_km ?? 2500),
    deliveryMaxKm: Number(value.delivery_max_km ?? 15),
    printerSimulation: value.printer_simulation !== "false",
    adminPrinter: value.printer_admin || "LAN 80mm Admin (simulasi)",
    kitchenPrinter: value.printer_kitchen || "LAN 80mm Kitchen (simulasi)",
  };
}
export async function getSettings(user) {
  required(user, ["ADMIN"]);
  const rows = await store.all("SELECT `key`,value FROM settings");
  const value = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return mappedSettings(value);
}
export async function saveSettings(user, input) {
  required(user, ["ADMIN"]);
  const brandName = String(input.brandName || "").trim(),
    rupiahPerPoint = 10000,
    businessWhatsApp = normalizeWhatsApp(
      input.businessWhatsApp ?? "6281546407856",
    ),
    businessLatitude = coordinate(
      input.businessLatitude ?? -6.9217,
      -90,
      90,
      "Latitude Warkost",
    ),
    businessLongitude = coordinate(
      input.businessLongitude ?? 106.9272,
      -180,
      180,
      "Longitude Warkost",
    ),
    printerSimulation = input.printerSimulation !== false,
    adminPrinter = String(
      input.adminPrinter || "LAN 80mm Admin (simulasi)",
    ).trim(),
    kitchenPrinter = String(
      input.kitchenPrinter || "LAN 80mm Kitchen (simulasi)",
    ).trim();
  if (
    brandName.length < 2 ||
    brandName.length > 80 ||
    adminPrinter.length < 3 ||
    adminPrinter.length > 100 ||
    kitchenPrinter.length < 3 ||
    kitchenPrinter.length > 100
  )
    throw new DomainError("Pengaturan tidak valid");
  return store.transaction(async (tx, mysql) => {
    const existing = Object.fromEntries(
      (
        await tx.all(
          "SELECT `key`,value FROM settings WHERE `key` IN ('delivery_free_km','delivery_fee_per_km','delivery_max_km')",
        )
      ).map((row) => [row.key, row.value]),
    );
    const deliveryRules = validateDeliveryRules({
      freeKm: input.deliveryFreeKm ?? existing.delivery_free_km ?? 5,
      feePerKm:
        input.deliveryFeePerKm ?? existing.delivery_fee_per_km ?? 2500,
      maxKm: input.deliveryMaxKm ?? existing.delivery_max_km ?? 15,
    });
    const save = mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value";
    await tx.run(save, "brand_name", brandName);
    await tx.run(save, "rupiah_per_point", String(rupiahPerPoint));
    for (const [key, value] of [
      ["business_whatsapp", businessWhatsApp],
      ["business_latitude", String(businessLatitude)],
      ["business_longitude", String(businessLongitude)],
      ["delivery_free_km", String(deliveryRules.freeKm)],
      ["delivery_fee_per_km", String(deliveryRules.feePerKm)],
      ["delivery_max_km", String(deliveryRules.maxKm)],
      ["printer_simulation", String(printerSimulation)],
      ["printer_admin", adminPrinter],
      ["printer_kitchen", kitchenPrinter],
    ])
      await tx.run(save, key, value);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "SETTINGS_UPDATED",
      JSON.stringify({
        brandName,
        rupiahPerPoint,
        businessWhatsApp,
        businessLatitude,
        businessLongitude,
        deliveryFreeKm: deliveryRules.freeKm,
        deliveryFeePerKm: deliveryRules.feePerKm,
        deliveryMaxKm: deliveryRules.maxKm,
        printerSimulation,
        adminPrinter,
        kitchenPrinter,
      }),
    );
    return mappedSettings({
      brand_name: brandName,
      rupiah_per_point: String(rupiahPerPoint),
      business_whatsapp: businessWhatsApp,
      business_latitude: String(businessLatitude),
      business_longitude: String(businessLongitude),
      delivery_free_km: String(deliveryRules.freeKm),
      delivery_fee_per_km: String(deliveryRules.feePerKm),
      delivery_max_km: String(deliveryRules.maxKm),
      printer_simulation: String(printerSimulation),
      printer_admin: adminPrinter,
      printer_kitchen: kitchenPrinter,
    });
  });
}
