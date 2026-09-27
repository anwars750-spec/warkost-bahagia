import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
export async function getSettings(user) {
  required(user, ["ADMIN"]);
  const rows = await store.all("SELECT `key`,value FROM settings");
  const value = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  return {
    brandName: value.brand_name || "Warkost Bahagia",
    rupiahPerPoint: Number(value.rupiah_per_point || 10000),
  };
}
export async function saveSettings(user, input) {
  required(user, ["ADMIN"]);
  const brandName = String(input.brandName || "").trim(),
    rupiahPerPoint = input.rupiahPerPoint;
  if (
    brandName.length < 2 ||
    brandName.length > 80 ||
    !Number.isSafeInteger(rupiahPerPoint) ||
    rupiahPerPoint < 1000 ||
    rupiahPerPoint > 100000
  )
    throw new DomainError("Pengaturan tidak valid");
  return store.transaction(async (tx, mysql) => {
    const save = mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value";
    await tx.run(save, "brand_name", brandName);
    await tx.run(save, "rupiah_per_point", String(rupiahPerPoint));
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "SETTINGS_UPDATED",
      JSON.stringify({ brandName, rupiahPerPoint }),
    );
    return { brandName, rupiahPerPoint };
  });
}
