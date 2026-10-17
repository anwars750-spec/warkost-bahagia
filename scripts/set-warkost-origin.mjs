import * as store from "../lib/store.mjs";

const latitude = -6.9213456;
const longitude = 106.9309032;

try {
  await store.transaction(async (tx, mysql) => {
    const save = mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value";

    await tx.run(save, "business_latitude", String(latitude));
    await tx.run(save, "business_longitude", String(longitude));
  });

  console.log(`Warkost origin updated: ${latitude}, ${longitude}`);
} finally {
  await store.close();
}
