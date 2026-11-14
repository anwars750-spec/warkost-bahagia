import test from "node:test";
import assert from "node:assert/strict";
import { enqueueOrderPrintJobs } from "../lib/print-queue.mjs";

for (const serviceType of ["PICKUP", "DELIVERY"]) {
  test(`payload cetak ${serviceType} memisahkan item Admin dan Kitchen`, async () => {
    const inserted = [];
    const tx = {
      async get(sql) {
        assert.match(sql, /o\.fulfillment_type/);
        return {
          id: 1,
          fulfillment_type: serviceType,
          subtotal: 30000,
          delivery_fee: serviceType === "DELIVERY" ? 5000 : 0,
          total: serviceType === "DELIVERY" ? 35000 : 30000,
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
            prep_station: "CASHIER",
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
      assert.equal(row.payload.serviceType, serviceType);
      assert.deepEqual(row.payload.headerLines, ["WARKOST BAHAGIA", serviceType]);
    }

    const admin = inserted.find((row) => row.station === "ADMIN");
    const kitchen = inserted.find((row) => row.station === "KITCHEN");
    assert.equal(admin.payload.documentTitle, `${serviceType} ORDER`);
    assert.equal(admin.printerKey, "printer_admin");
    assert.deepEqual(admin.payload.items.map(({ name }) => name), ["Es Kopi"]);
    assert.equal(admin.payload.address, "Sukabumi");
    assert.equal(kitchen.payload.documentTitle, `KITCHEN ${serviceType}`);
    assert.equal(kitchen.printerKey, "printer_kitchen");
    assert.deepEqual(kitchen.payload.items.map(({ name }) => name), ["Nasi Goreng"]);
    assert.equal(kitchen.payload.address, undefined);
  });
}
