import test, { after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "warkost-delivery-proof-")),
  "data.db",
);

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const { db } = await import("../lib/db.mjs");
const { getDriverDeliveryProof, hasDeliveryProof } =
  await import("../lib/delivery-proofs.mjs");

const database = db();
after(() => {
  try {
    database.close();
  } catch {}
});

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Customer','proof-customer@test.local','x','CUSTOMER',1),
    (2,'Driver A','proof-driver-a@test.local','x','DRIVER',1),
    (3,'Driver B','proof-driver-b@test.local','x','DRIVER',1);
  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default)
    VALUES(1,1,'Rumah','Alamat proof test',-6.9,106.9,1);
  INSERT INTO orders(id,customer_id,address_id,fulfillment_type,status,subtotal,total)
    VALUES
      (101,1,1,'DELIVERY','ON_DELIVERY',10000,10000),
      (102,1,1,'PICKUP','ON_DELIVERY',10000,10000),
      (103,1,1,'DELIVERY','ASSIGNED',10000,10000);
  INSERT INTO deliveries(id,order_id,driver_id,accepted_at) VALUES
    (201,101,2,CURRENT_TIMESTAMP),
    (202,102,2,CURRENT_TIMESTAMP),
    (203,103,2,CURRENT_TIMESTAMP);
`);

const driverA = { id: 2, role: "DRIVER" };
const driverB = { id: 3, role: "DRIVER" };

test("proof storage dibuat lazily dan Driver assigned dapat membaca state proof", async () => {
  assert.equal(await hasDeliveryProof(101), false);
  assert.equal(await getDriverDeliveryProof(driverA, 101), null);
  const table = database
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='delivery_proofs'")
    .get();
  assert.equal(table.name, "delivery_proofs");
});

test("Driver lain, pickup, dan status selain ON_DELIVERY ditolak", async () => {
  await assert.rejects(
    getDriverDeliveryProof(driverB, 101),
    /Driver yang ditugaskan/,
  );
  await assert.rejects(
    getDriverDeliveryProof(driverA, 102),
    /pickup tidak menggunakan bukti pengantaran/i,
  );
  await assert.rejects(
    getDriverDeliveryProof(driverA, 103),
    /saat pesanan dalam perjalanan/,
  );
});

test("proof terikat satu order, delivery, Driver, dan media asset", async () => {
  const mediaId = "11111111-1111-4111-8111-111111111111";
  database
    .prepare(
      "INSERT INTO media_assets(id,filename,mime_type,bytes_size,uploaded_by) VALUES(?,?,?,?,?)",
    )
    .run(mediaId, `${mediaId}.webp`, "image/webp", 100, 2);
  database
    .prepare(
      "INSERT INTO delivery_proofs(order_id,delivery_id,driver_id,media_id) VALUES(?,?,?,?)",
    )
    .run(101, 201, 2, mediaId);
  assert.equal(await hasDeliveryProof(101), true);
  const proof = await getDriverDeliveryProof(driverA, 101);
  assert.equal(proof.order_id, 101);
  assert.equal(proof.driver_id, 2);
  assert.equal(proof.image_url, `/api/media/${mediaId}`);
});

test("status API menolak Driver DELIVERED tanpa proof sebelum changeStatus", () => {
  const route = read("app/api/status/route.js");
  assert.match(route, /user\?\.role === "DRIVER"/);
  assert.match(route, /status === "DELIVERED"/);
  assert.match(route, /hasDeliveryProof\(orderId\)/);
  assert.match(route, /Foto bukti pengantaran wajib/);
  assert.ok(route.indexOf("hasDeliveryProof(orderId)") < route.indexOf("changeStatus("));
});

test("delivery proof endpoint menyimpan foto lalu memakai completion flow existing", () => {
  const route = read("app/api/delivery-proof/route.js");
  assert.match(route, /createDriverDeliveryProof/);
  assert.match(route, /changeStatus\(user, orderId, "DELIVERED"\)/);
  assert.match(route, /publishActionRealtime/);
  assert.match(route, /multipart\/form-data/);
});

test("Driver UI mewajibkan foto, preview, dan mengintercept completion lama", () => {
  const runtime = read("app/DriverDeliveryProofRuntime.js");
  const bootstrap = read("app/DriverRuntimeBootstrap.js");
  assert.match(runtime, /Pesanan Diterima/);
  assert.match(runtime, /stopImmediatePropagation/);
  assert.match(runtime, /\/api\/delivery-proof/);
  assert.match(runtime, /capture="environment"/);
  assert.match(runtime, /Simpan Bukti & Selesaikan/);
  assert.match(runtime, /Preview bukti pengantaran/);
  assert.match(bootstrap, /DriverDeliveryProofRuntime/);
});

test("migration dan media tetap memisahkan upload katalog dari proof Driver", () => {
  const migration = read("migrations/033_delivery_proof_v1.sql");
  const media = read("lib/media.mjs");
  assert.match(migration, /CREATE TABLE delivery_proofs/);
  assert.match(migration, /FOREIGN KEY\(order_id\) REFERENCES orders/);
  assert.match(migration, /FOREIGN KEY\(delivery_id\) REFERENCES deliveries/);
  assert.match(migration, /FOREIGN KEY\(media_id\) REFERENCES media_assets/);
  assert.match(media, /export async function storeImageAsset/);
  assert.match(media, /export async function uploadImage/);
  assert.match(media, /requiredCapability\(user, CAPABILITIES\.CATALOG_WRITE\)/);
});
