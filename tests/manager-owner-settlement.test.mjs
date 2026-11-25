import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATABASE_PATH = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "manager-owner-settlement-")),
  "data.db",
);
process.env.SESSION_SECRET = "manager-owner-settlement-test-secret-32-bytes-minimum";

const { db } = await import("../lib/db.mjs");
const {
  getManagerOwnerSettlementState,
  rejectOwnerManagerSettlement,
  submitManagerOwnerSettlement,
  verifyOwnerManagerSettlement,
} = await import("../lib/manager-owner-settlement.mjs");

const database = db();

database.exec(`
  INSERT INTO users(id,name,email,password_hash,role,active) VALUES
    (1,'Admin Shared','admin@manager-owner.test','x','ADMIN',1),
    (2,'Manager Satu','manager@manager-owner.test','x','MANAGER',1),
    (3,'Owner Warkost','owner@manager-owner.test','x','OWNER',1);
`);

const manager = { id: 2, role: "MANAGER" };
const owner = { id: 3, role: "OWNER" };

await getManagerOwnerSettlementState(manager);

database.exec(`
  INSERT INTO admin_operators(id,name,pin_hash,active,created_by)
    VALUES(10,'Virsa','x',1,3);
  INSERT INTO admin_shifts(id,admin_user_id,operator_id,status,started_at,ended_at)
    VALUES(20,1,10,'CLOSED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
  INSERT INTO admin_shift_settlements(
    id,slip_number,shift_id,admin_user_id,operator_id,
    expected_amount,submitted_amount,admin_overage_amount,status,
    manager_id,manager_received_amount,manager_overage_amount,
    manager_custody_status,verified_at
  ) VALUES(
    30,'ST-TEST-0001',20,1,10,
    18000,18000,0,'VERIFIED',
    2,18000,0,'HELD',CURRENT_TIMESTAMP
  );
`);

test("Kas Manager yang sudah diverifikasi tersedia untuk setoran akhir", async () => {
  const state = await getManagerOwnerSettlementState(manager);
  assert.equal(state.role, "MANAGER");
  assert.equal(state.summary.available_count, 1);
  assert.equal(state.summary.available_amount, 18000);
  assert.equal(state.available[0].slip_number, "ST-TEST-0001");
});

test("Manager tidak dapat mengajukan setoran kurang", async () => {
  await assert.rejects(
    submitManagerOwnerSettlement(manager, {
      destination: "OWNER",
      submittedAmount: 17000,
    }),
    /Setoran kurang/,
  );
});

let ownerBatchId;

test("Setoran ke Owner mengunci sumber dari pengajuan ganda tetapi custody tetap di Manager", async () => {
  const result = await submitManagerOwnerSettlement(manager, {
    destination: "OWNER",
    submittedAmount: 18000,
  });
  ownerBatchId = result.settlement.id;
  assert.equal(result.settlement.destination, "OWNER");
  assert.equal(result.settlement.status, "PENDING");
  assert.equal(result.settlement.expected_amount, 18000);
  assert.equal(result.settlement.submitted_amount, 18000);
  assert.equal(result.settlement.items.length, 1);

  const source = database
    .prepare("SELECT manager_custody_status FROM admin_shift_settlements WHERE id=30")
    .get();
  assert.equal(source.manager_custody_status, "HELD");

  const state = await getManagerOwnerSettlementState(manager);
  assert.equal(state.summary.available_amount, 0);
  assert.equal(state.summary.pending_amount, 18000);
});

test("Owner tidak dapat mengonfirmasi kurang dan verifikasi final menutup custody Manager", async () => {
  await assert.rejects(
    verifyOwnerManagerSettlement(owner, {
      settlementId: ownerBatchId,
      receivedAmount: 17000,
    }),
    /Nominal kurang/,
  );

  const verified = await verifyOwnerManagerSettlement(owner, {
    settlementId: ownerBatchId,
    receivedAmount: 18000,
  });
  assert.equal(verified.settlement.status, "VERIFIED");
  assert.equal(verified.settlement.owner_received_amount, 18000);

  const source = database
    .prepare("SELECT manager_custody_status FROM admin_shift_settlements WHERE id=30")
    .get();
  assert.equal(source.manager_custody_status, "SETTLED");
});

test("Setoran Bank wajib referensi dan kelebihan Manager maupun Owner tetap diterima", async () => {
  database.exec(`
    INSERT INTO admin_shifts(id,admin_user_id,operator_id,status,started_at,ended_at)
      VALUES(21,1,10,'CLOSED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO admin_shift_settlements(
      id,slip_number,shift_id,admin_user_id,operator_id,
      expected_amount,submitted_amount,admin_overage_amount,status,
      manager_id,manager_received_amount,manager_overage_amount,
      manager_custody_status,verified_at
    ) VALUES(
      31,'ST-TEST-0002',21,1,10,
      10000,10000,0,'VERIFIED',
      2,10000,0,'HELD',CURRENT_TIMESTAMP
    );
  `);

  await assert.rejects(
    submitManagerOwnerSettlement(manager, {
      destination: "BANK",
      submittedAmount: 12000,
      bankReference: "",
    }),
    /referensi\/setoran Bank wajib diisi/i,
  );

  const bank = await submitManagerOwnerSettlement(manager, {
    destination: "BANK",
    submittedAmount: 12000,
    bankReference: "BCA-111026-001",
  });
  assert.equal(bank.settlement.manager_overage_amount, 2000);
  assert.equal(bank.settlement.bank_reference, "BCA-111026-001");

  const verified = await verifyOwnerManagerSettlement(owner, {
    settlementId: bank.settlement.id,
    receivedAmount: 12500,
  });
  assert.equal(verified.settlement.owner_overage_amount, 500);
  assert.equal(verified.settlement.owner_received_amount, 12500);

  const source = database
    .prepare("SELECT manager_custody_status FROM admin_shift_settlements WHERE id=31")
    .get();
  assert.equal(source.manager_custody_status, "SETTLED");
});

test("Owner dapat mengembalikan setoran untuk koreksi dan kas kembali tersedia bagi Manager", async () => {
  database.exec(`
    INSERT INTO admin_shifts(id,admin_user_id,operator_id,status,started_at,ended_at)
      VALUES(22,1,10,'CLOSED',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
    INSERT INTO admin_shift_settlements(
      id,slip_number,shift_id,admin_user_id,operator_id,
      expected_amount,submitted_amount,admin_overage_amount,status,
      manager_id,manager_received_amount,manager_overage_amount,
      manager_custody_status,verified_at
    ) VALUES(
      32,'ST-TEST-0003',22,1,10,
      9000,9000,0,'VERIFIED',
      2,9000,0,'HELD',CURRENT_TIMESTAMP
    );
  `);

  const submitted = await submitManagerOwnerSettlement(manager, {
    destination: "OWNER",
    submittedAmount: 9000,
  });
  const rejected = await rejectOwnerManagerSettlement(owner, {
    settlementId: submitted.settlement.id,
    reason: "Nominal perlu dicek ulang",
  });
  assert.equal(rejected.settlement.status, "REJECTED");

  const source = database
    .prepare("SELECT manager_custody_status FROM admin_shift_settlements WHERE id=32")
    .get();
  assert.equal(source.manager_custody_status, "HELD");

  const state = await getManagerOwnerSettlementState(manager);
  assert.equal(state.summary.available_count, 1);
  assert.equal(state.summary.available_amount, 9000);
});
