import test from "node:test";
import assert from "node:assert/strict";
import { enqueueOrderPrintJobs } from "../lib/print-queue.mjs";

test("Admin dan Kitchen print payload selalu membawa logo Warkost + DELIVERY", async () => {
  const inserted = [];
  const tx = {
    async get() {
      return {
        id: 1,
        subtotal: 30000,
        delivery_fee: 5000,
        total: 35000,
        created_at: "2026-10-11 10:00:00",
        customer_name: "Customer Demo",
        address: "Sukabumi",
      };
    },
    async all() {
      return [
        {
          name: "Es Kopi",
          price: 10000,
          quantity: 1,
          note: null,
          prep_station: "ADMIN",
          stock_unit: "PCS",
          price_unit_quantity: 1,
        },
        {
          name: "Nasi Goreng",
          price: 20000,
          quantity: 1,
          note: "pedas",
          prep_station: "KITCHEN",
          stock_unit: "PCS",
          price_unit_quantity: 1,
        },
      ];
    },
    async run(sql, ...args) {
      if (sql.includes("INSERT OR IGNORE INTO print_jobs")) {
        inserted.push({
          orderId: args[0],
          station: args[1],
          printerKey: args[2],
          payload: JSON.parse(args[3]),
        });
      }
      return { changes: 1, lastInsertRowid: inserted.length };
    },
  };

  await enqueueOrderPrintJobs(tx, 1, 99, false);

  assert.equal(inserted.length, 2);
  for (const row of inserted) {
    assert.equal(row.payload.brandName, "Warkost Bahagia");
    assert.equal(row.payload.brandLogo, "/warkost-bahagia-logo-transparent.png");
    assert.equal(row.payload.serviceType, "DELIVERY");
    assert.deepEqual(row.payload.headerLines, ["WARKOST BAHAGIA", "DELIVERY"]);
  }

  const admin = inserted.find((row) => row.station === "ADMIN");
  const kitchen = inserted.find((row) => row.station === "KITCHEN");
  assert.equal(admin.payload.documentTitle, "DELIVERY ORDER");
  assert.equal(kitchen.payload.documentTitle, "KITCHEN DELIVERY");
});
