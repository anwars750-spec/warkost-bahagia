import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { ensureCashSettlementSchema } from "./cash-settlement-control.mjs";

function requireRole(user, roles) {
  if (!user || !roles.includes(user.role))
    throw new DomainError("Akses ditolak", 403);
}

function amount(value, label = "Nominal") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0)
    throw new DomainError(`${label} tidak valid`, 400);
  return number;
}

function positiveId(value, label = "ID") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`, 400);
  return number;
}

function destination(value) {
  const next = String(value || "").trim().toUpperCase();
  if (!['OWNER', 'BANK'].includes(next))
    throw new DomainError("Tujuan setoran harus Owner atau Bank", 400);
  return next;
}

function bankReference(value, required = false) {
  const next = String(value || "").trim();
  if (required && next.length < 3)
    throw new DomainError("Nomor referensi/setoran Bank wajib diisi", 400);
  if (next.length > 120)
    throw new DomainError("Referensi Bank maksimal 120 karakter", 400);
  return next || null;
}

function jakartaDateKey() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
}

function settlementNumber(id) {
  return `SM-${jakartaDateKey()}-${String(id).padStart(4, "0")}`;
}

export async function ensureManagerOwnerSettlementSchema(tx, mysql = false) {
  await ensureCashSettlementSchema(tx, mysql);

  if (mysql) {
    await tx.run(`CREATE TABLE IF NOT EXISTS manager_owner_settlements(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      settlement_number VARCHAR(40) UNIQUE NULL,
      manager_id BIGINT NOT NULL,
      destination VARCHAR(10) NOT NULL,
      expected_amount BIGINT NOT NULL,
      submitted_amount BIGINT NOT NULL,
      manager_overage_amount BIGINT NOT NULL DEFAULT 0,
      bank_reference VARCHAR(120) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      owner_id BIGINT NULL,
      owner_received_amount BIGINT NULL,
      owner_overage_amount BIGINT NOT NULL DEFAULT 0,
      reject_reason VARCHAR(255) NULL,
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP NULL,
      rejected_at TIMESTAMP NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_manager_owner_status(status,id),
      INDEX idx_manager_owner_manager(manager_id,status,id),
      CONSTRAINT fk_manager_owner_manager FOREIGN KEY(manager_id) REFERENCES users(id),
      CONSTRAINT fk_manager_owner_owner FOREIGN KEY(owner_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);

    await tx.run(`CREATE TABLE IF NOT EXISTS manager_owner_settlement_items(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      settlement_id BIGINT NOT NULL,
      admin_settlement_id BIGINT NOT NULL,
      amount BIGINT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_manager_owner_item(settlement_id,admin_settlement_id),
      INDEX idx_manager_owner_item_admin(admin_settlement_id),
      CONSTRAINT fk_manager_owner_item_settlement FOREIGN KEY(settlement_id) REFERENCES manager_owner_settlements(id),
      CONSTRAINT fk_manager_owner_item_admin FOREIGN KEY(admin_settlement_id) REFERENCES admin_shift_settlements(id)
    ) ENGINE=InnoDB`);
    return;
  }

  await tx.run(`CREATE TABLE IF NOT EXISTS manager_owner_settlements(
    id INTEGER PRIMARY KEY,
    settlement_number TEXT UNIQUE,
    manager_id INTEGER NOT NULL REFERENCES users(id),
    destination TEXT NOT NULL CHECK(destination IN('OWNER','BANK')),
    expected_amount INTEGER NOT NULL CHECK(expected_amount>=0),
    submitted_amount INTEGER NOT NULL CHECK(submitted_amount>=0),
    manager_overage_amount INTEGER NOT NULL DEFAULT 0 CHECK(manager_overage_amount>=0),
    bank_reference TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','VERIFIED','REJECTED')),
    owner_id INTEGER REFERENCES users(id),
    owner_received_amount INTEGER CHECK(owner_received_amount IS NULL OR owner_received_amount>=0),
    owner_overage_amount INTEGER NOT NULL DEFAULT 0 CHECK(owner_overage_amount>=0),
    reject_reason TEXT,
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT,
    rejected_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_manager_owner_status ON manager_owner_settlements(status,id)",
  );
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_manager_owner_manager ON manager_owner_settlements(manager_id,status,id)",
  );
  await tx.run(`CREATE TABLE IF NOT EXISTS manager_owner_settlement_items(
    id INTEGER PRIMARY KEY,
    settlement_id INTEGER NOT NULL REFERENCES manager_owner_settlements(id),
    admin_settlement_id INTEGER NOT NULL REFERENCES admin_shift_settlements(id),
    amount INTEGER NOT NULL CHECK(amount>=0),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(settlement_id,admin_settlement_id)
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_manager_owner_item_admin ON manager_owner_settlement_items(admin_settlement_id)",
  );
}

async function availableManagerCash(tx, mysql, managerId, lock = false) {
  return tx.all(
    `SELECT x.id,x.slip_number,x.operator_id,o.name operator_name,
            x.manager_received_amount,x.verified_at
       FROM admin_shift_settlements x
       JOIN admin_operators o ON o.id=x.operator_id
      WHERE x.status='VERIFIED'
        AND x.manager_custody_status='HELD'
        AND x.manager_id=?
        AND NOT EXISTS(
          SELECT 1
            FROM manager_owner_settlement_items i
            JOIN manager_owner_settlements b ON b.id=i.settlement_id
           WHERE i.admin_settlement_id=x.id AND b.status='PENDING'
        )
      ORDER BY x.id ASC${lock && mysql ? " FOR UPDATE" : ""}`,
    managerId,
  );
}

async function batchItems(tx, settlementId) {
  const rows = await tx.all(
    `SELECT i.admin_settlement_id,i.amount,x.slip_number,o.name operator_name
       FROM manager_owner_settlement_items i
       JOIN admin_shift_settlements x ON x.id=i.admin_settlement_id
       JOIN admin_operators o ON o.id=x.operator_id
      WHERE i.settlement_id=? ORDER BY i.id ASC`,
    settlementId,
  );
  return rows.map((row) => ({
    admin_settlement_id: Number(row.admin_settlement_id),
    amount: Number(row.amount || 0),
    slip_number: row.slip_number,
    operator_name: row.operator_name,
  }));
}

async function batchRow(tx, settlementId, lock = false, mysql = false) {
  return tx.get(
    `SELECT b.id,b.settlement_number,b.manager_id,b.destination,b.expected_amount,
            b.submitted_amount,b.manager_overage_amount,b.bank_reference,b.status,
            b.owner_id,b.owner_received_amount,b.owner_overage_amount,b.reject_reason,
            b.submitted_at,b.verified_at,b.rejected_at,
            m.name manager_name,o.name owner_name
       FROM manager_owner_settlements b
       JOIN users m ON m.id=b.manager_id
       LEFT JOIN users o ON o.id=b.owner_id
      WHERE b.id=?${lock && mysql ? " FOR UPDATE" : ""}`,
    settlementId,
  );
}

async function publicBatch(tx, settlementId) {
  const row = await batchRow(tx, settlementId);
  if (!row) return null;
  return {
    id: Number(row.id),
    settlement_number: row.settlement_number,
    manager_id: Number(row.manager_id),
    manager_name: row.manager_name,
    destination: row.destination,
    expected_amount: Number(row.expected_amount || 0),
    submitted_amount: Number(row.submitted_amount || 0),
    manager_overage_amount: Number(row.manager_overage_amount || 0),
    bank_reference: row.bank_reference || null,
    status: row.status,
    owner_id: row.owner_id === null ? null : Number(row.owner_id),
    owner_name: row.owner_name || null,
    owner_received_amount:
      row.owner_received_amount === null ? null : Number(row.owner_received_amount),
    owner_overage_amount: Number(row.owner_overage_amount || 0),
    reject_reason: row.reject_reason || null,
    submitted_at: row.submitted_at,
    verified_at: row.verified_at,
    rejected_at: row.rejected_at,
    items: await batchItems(tx, settlementId),
  };
}

async function hydrateMany(tx, rows) {
  const result = [];
  for (const row of rows) result.push(await publicBatch(tx, row.id));
  return result;
}

export async function getManagerOwnerSettlementState(user) {
  requireRole(user, ["MANAGER", "OWNER"]);
  return store.transaction(async (tx, mysql) => {
    await ensureManagerOwnerSettlementSchema(tx, mysql);

    if (user.role === "MANAGER") {
      const available = await availableManagerCash(tx, mysql, user.id);
      const pendingIds = await tx.all(
        "SELECT id FROM manager_owner_settlements WHERE manager_id=? AND status='PENDING' ORDER BY id DESC LIMIT 20",
        user.id,
      );
      const recentIds = await tx.all(
        "SELECT id FROM manager_owner_settlements WHERE manager_id=? AND status<>'PENDING' ORDER BY id DESC LIMIT 12",
        user.id,
      );
      const pending = await hydrateMany(tx, pendingIds);
      return {
        role: "MANAGER",
        available: available.map((row) => ({
          id: Number(row.id),
          slip_number: row.slip_number,
          operator_id: Number(row.operator_id),
          operator_name: row.operator_name,
          amount: Number(row.manager_received_amount || 0),
          verified_at: row.verified_at,
        })),
        pending,
        recent: await hydrateMany(tx, recentIds),
        summary: {
          available_count: available.length,
          available_amount: available.reduce(
            (sum, row) => sum + Number(row.manager_received_amount || 0),
            0,
          ),
          pending_count: pending.length,
          pending_amount: pending.reduce(
            (sum, row) => sum + Number(row.submitted_amount || 0),
            0,
          ),
        },
      };
    }

    const pendingIds = await tx.all(
      "SELECT id FROM manager_owner_settlements WHERE status='PENDING' ORDER BY id ASC LIMIT 50",
    );
    const recentIds = await tx.all(
      "SELECT id FROM manager_owner_settlements WHERE status<>'PENDING' ORDER BY id DESC LIMIT 16",
    );
    const settled = await tx.get(
      `SELECT COUNT(*) count,COALESCE(SUM(owner_received_amount),0) amount
         FROM manager_owner_settlements WHERE status='VERIFIED'`,
    );
    const pending = await hydrateMany(tx, pendingIds);
    return {
      role: "OWNER",
      pending,
      recent: await hydrateMany(tx, recentIds),
      summary: {
        pending_count: pending.length,
        pending_amount: pending.reduce(
          (sum, row) => sum + Number(row.submitted_amount || 0),
          0,
        ),
        settled_count: Number(settled?.count || 0),
        settled_amount: Number(settled?.amount || 0),
      },
    };
  });
}

export async function submitManagerOwnerSettlement(user, input) {
  requireRole(user, ["MANAGER"]);
  const target = destination(input?.destination);
  const submitted = amount(input?.submittedAmount, "Uang yang disetorkan");
  const reference = bankReference(input?.bankReference, target === "BANK");

  return store.transaction(async (tx, mysql) => {
    await ensureManagerOwnerSettlementSchema(tx, mysql);
    const available = await availableManagerCash(tx, mysql, user.id, true);
    if (!available.length)
      throw new DomainError("Tidak ada Kas Manager yang siap disetorkan", 409);

    const expected = available.reduce(
      (sum, row) => sum + Number(row.manager_received_amount || 0),
      0,
    );
    if (submitted < expected)
      throw new DomainError(
        `Setoran kurang Rp${(expected - submitted).toLocaleString("id-ID")}. Setoran tidak dapat diajukan.`,
        409,
      );

    const created = await tx.run(
      `INSERT INTO manager_owner_settlements(
         manager_id,destination,expected_amount,submitted_amount,
         manager_overage_amount,bank_reference,status
       ) VALUES(?,?,?,?,?,?,'PENDING')`,
      user.id,
      target,
      expected,
      submitted,
      submitted - expected,
      reference,
    );
    const id = Number(created.lastInsertRowid);
    const number = settlementNumber(id);
    await tx.run(
      "UPDATE manager_owner_settlements SET settlement_number=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      number,
      id,
    );

    for (const row of available) {
      await tx.run(
        "INSERT INTO manager_owner_settlement_items(settlement_id,admin_settlement_id,amount) VALUES(?,?,?)",
        id,
        row.id,
        Number(row.manager_received_amount || 0),
      );
    }

    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "MANAGER_OWNER_SETTLEMENT_SUBMITTED",
      JSON.stringify({
        settlementId: id,
        settlementNumber: number,
        destination: target,
        expectedAmount: expected,
        submittedAmount: submitted,
        overageAmount: submitted - expected,
        bankReference: reference,
        adminSettlementIds: available.map((row) => Number(row.id)),
      }),
    );

    return { settlement: await publicBatch(tx, id), replayed: false };
  });
}

export async function verifyOwnerManagerSettlement(user, input) {
  requireRole(user, ["OWNER"]);
  const settlementId = positiveId(input?.settlementId, "Setoran Manager");
  const received = amount(input?.receivedAmount, "Nominal yang diterima/dikonfirmasi");

  return store.transaction(async (tx, mysql) => {
    await ensureManagerOwnerSettlementSchema(tx, mysql);
    const row = await batchRow(tx, settlementId, true, mysql);
    if (!row) throw new DomainError("Setoran Manager tidak ditemukan", 404);
    if (row.status === "VERIFIED")
      return { settlement: await publicBatch(tx, settlementId), replayed: true };
    if (row.status !== "PENDING")
      throw new DomainError("Setoran ini tidak lagi menunggu verifikasi", 409);

    const expected = Number(row.submitted_amount || 0);
    if (received < expected)
      throw new DomainError(
        `Nominal kurang Rp${(expected - received).toLocaleString("id-ID")}. Verifikasi diblokir.`,
        409,
      );

    await tx.run(
      `UPDATE manager_owner_settlements
          SET status='VERIFIED',owner_id=?,owner_received_amount=?,owner_overage_amount=?,
              verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      user.id,
      received,
      received - expected,
      settlementId,
    );

    const items = await batchItems(tx, settlementId);
    for (const item of items) {
      await tx.run(
        `UPDATE admin_shift_settlements
            SET manager_custody_status='SETTLED',updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND manager_custody_status='HELD'`,
        item.admin_settlement_id,
      );
    }

    const settlement = await publicBatch(tx, settlementId);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "OWNER_MANAGER_SETTLEMENT_VERIFIED",
      JSON.stringify({
        settlementId,
        settlementNumber: settlement.settlement_number,
        managerId: settlement.manager_id,
        managerName: settlement.manager_name,
        destination: settlement.destination,
        bankReference: settlement.bank_reference,
        submittedAmount: expected,
        receivedAmount: received,
        overageAmount: received - expected,
      }),
    );

    return { settlement, replayed: false };
  });
}

export async function rejectOwnerManagerSettlement(user, input) {
  requireRole(user, ["OWNER"]);
  const settlementId = positiveId(input?.settlementId, "Setoran Manager");
  const reason = String(input?.reason || "Dikembalikan Owner untuk koreksi").trim();
  if (reason.length < 3 || reason.length > 255)
    throw new DomainError("Alasan koreksi harus 3-255 karakter", 400);

  return store.transaction(async (tx, mysql) => {
    await ensureManagerOwnerSettlementSchema(tx, mysql);
    const row = await batchRow(tx, settlementId, true, mysql);
    if (!row) throw new DomainError("Setoran Manager tidak ditemukan", 404);
    if (row.status === "REJECTED")
      return { settlement: await publicBatch(tx, settlementId), replayed: true };
    if (row.status === "VERIFIED")
      throw new DomainError("Setoran yang sudah terverifikasi tidak dapat dikembalikan", 409);

    await tx.run(
      `UPDATE manager_owner_settlements
          SET status='REJECTED',owner_id=?,reject_reason=?,rejected_at=CURRENT_TIMESTAMP,
              updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      user.id,
      reason,
      settlementId,
    );

    const settlement = await publicBatch(tx, settlementId);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "OWNER_MANAGER_SETTLEMENT_REJECTED",
      JSON.stringify({
        settlementId,
        settlementNumber: settlement.settlement_number,
        managerId: settlement.manager_id,
        managerName: settlement.manager_name,
        reason,
      }),
    );

    return { settlement, replayed: false };
  });
}
