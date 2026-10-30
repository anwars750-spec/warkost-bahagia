import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "owner-admin-operators-")),
  "data.db",
);
process.env.SESSION_SECRET = "owner-admin-operators-test-secret-32-bytes";

const { db } = await import("../lib/db.mjs");
const { checkPassword } = await import("../lib/auth.mjs");
const {
  createOwnerAdminOperator,
  listOwnerAdminOperators,
  resetOwnerAdminOperatorPin,
  setOwnerAdminOperatorActive,
} = await import("../lib/owner-admin-operators.mjs");
const { startAdminShift } = await import("../lib/admin-cash-control.mjs");

const database = db();
database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Owner','owner@operator.test','x','OWNER',1),
    (2,'Admin Shared','admin@operator.test','x','ADMIN',1);
`);

const owner = { id: 1, role: "OWNER" };
const admin = { id: 2, role: "ADMIN" };

let operatorId;

test("Owner dapat membuat operator dan PIN tidak pernah dikembalikan", async () => {
  const operator = await createOwnerAdminOperator(owner, {
    name: "Virsa",
    pin: "2580",
  });
  operatorId = operator.id;
  assert.equal(operator.name, "Virsa");
  assert.equal(operator.active, true);
  assert.equal("pin" in operator, false);
  assert.equal("pin_hash" in operator, false);

  const row = database
    .prepare("SELECT pin_hash FROM admin_operators WHERE id=?")
    .get(operatorId);
  assert.equal(checkPassword("2580", row.pin_hash), true);
});

test("Owner melihat operator tanpa PIN", async () => {
  const state = await listOwnerAdminOperators(owner);
  assert.equal(state.operators.length, 1);
  assert.equal(state.operators[0].name, "Virsa");
  assert.equal("pin_hash" in state.operators[0], false);
});

test("Nama operator duplikat ditolak", async () => {
  await assert.rejects(
    createOwnerAdminOperator(owner, { name: "virsa", pin: "1234" }),
    /Nama operator sudah terdaftar/,
  );
});

test("Owner dapat reset PIN tanpa melihat PIN lama", async () => {
  await resetOwnerAdminOperatorPin(owner, {
    operatorId,
    pin: "8642",
  });
  const row = database
    .prepare("SELECT pin_hash FROM admin_operators WHERE id=?")
    .get(operatorId);
  assert.equal(checkPassword("2580", row.pin_hash), false);
  assert.equal(checkPassword("8642", row.pin_hash), true);
});

test("Operator dengan shift aktif tidak dapat dinonaktifkan", async () => {
  await startAdminShift(admin, { operatorId, pin: "8642" });
  await assert.rejects(
    setOwnerAdminOperatorActive(owner, { operatorId, active: false }),
    /shift aktif/,
  );

  const state = await listOwnerAdminOperators(owner);
  assert.equal(state.operators[0].shift_active, true);
  assert.equal(state.operators[0].active, true);
});
