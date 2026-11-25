import * as store from "./store.mjs";
import { checkPassword, hashPassword } from "./auth.mjs";
import { DomainError } from "./domain.mjs";

function requireAdmin(user) {
  if (!user || user.role !== "ADMIN") throw new DomainError("Akses ditolak", 403);
}

function positiveId(value, label = "ID") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`);
  return number;
}

function operatorName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new DomainError("Nama operator harus 2-80 karakter");
  return name;
}

function operatorPin(value) {
  const pin = String(value || "").trim();
  if (!/^\d{4,6}$/.test(pin))
    throw new DomainError("PIN operator harus 4-6 digit angka");
  return pin;
}

export async function ensureAdminCashSchema(tx, mysql = false) {
  if (mysql) {
    await tx.run(`CREATE TABLE IF NOT EXISTS admin_operators(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      name VARCHAR(80) NOT NULL,
      pin_hash VARCHAR(255) NOT NULL,
      active TINYINT NOT NULL DEFAULT 1,
      created_by BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_operators_active(active,name),
      CONSTRAINT fk_admin_operators_created_by FOREIGN KEY(created_by) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    await tx.run(`CREATE TABLE IF NOT EXISTS admin_shifts(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      admin_user_id BIGINT NOT NULL,
      operator_id BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
      started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      ended_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_shifts_account_status(admin_user_id,status,id),
      INDEX idx_admin_shifts_operator(operator_id,status,id),
      CONSTRAINT fk_admin_shifts_user FOREIGN KEY(admin_user_id) REFERENCES users(id),
      CONSTRAINT fk_admin_shifts_operator FOREIGN KEY(operator_id) REFERENCES admin_operators(id)
    ) ENGINE=InnoDB`);
    await tx.run(`CREATE TABLE IF NOT EXISTS admin_cash_receipts(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      shift_id BIGINT NOT NULL,
      operator_id BIGINT NOT NULL,
      batch_id BIGINT NOT NULL UNIQUE,
      expected_amount BIGINT NOT NULL,
      actual_amount BIGINT NOT NULL,
      overage_amount BIGINT NOT NULL DEFAULT 0,
      received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_admin_cash_receipts_shift(shift_id,id),
      CONSTRAINT fk_admin_receipts_shift FOREIGN KEY(shift_id) REFERENCES admin_shifts(id),
      CONSTRAINT fk_admin_receipts_operator FOREIGN KEY(operator_id) REFERENCES admin_operators(id),
      CONSTRAINT fk_admin_receipts_batch FOREIGN KEY(batch_id) REFERENCES cod_settlement_batches(id)
    ) ENGINE=InnoDB`);
    return;
  }

  await tx.run(`CREATE TABLE IF NOT EXISTS admin_operators(
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
    created_by INTEGER REFERENCES users(id),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_admin_operators_active ON admin_operators(active,name,id)",
  );
  await tx.run(`CREATE TABLE IF NOT EXISTS admin_shifts(
    id INTEGER PRIMARY KEY,
    admin_user_id INTEGER NOT NULL REFERENCES users(id),
    operator_id INTEGER NOT NULL REFERENCES admin_operators(id),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN('OPEN','CLOSED','HANDED_OVER')),
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_admin_shifts_account_status ON admin_shifts(admin_user_id,status,id)",
  );
  await tx.run(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_shift_one_open ON admin_shifts(admin_user_id) WHERE status='OPEN'",
  );
  await tx.run(`CREATE TABLE IF NOT EXISTS admin_cash_receipts(
    id INTEGER PRIMARY KEY,
    shift_id INTEGER NOT NULL REFERENCES admin_shifts(id),
    operator_id INTEGER NOT NULL REFERENCES admin_operators(id),
    batch_id INTEGER NOT NULL UNIQUE REFERENCES cod_settlement_batches(id),
    expected_amount INTEGER NOT NULL CHECK(expected_amount>=0),
    actual_amount INTEGER NOT NULL CHECK(actual_amount>=0),
    overage_amount INTEGER NOT NULL DEFAULT 0 CHECK(overage_amount>=0),
    received_at TEXT DEFAULT CURRENT_TIMESTAMP,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_admin_cash_receipts_shift ON admin_cash_receipts(shift_id,id)",
  );
}

async function currentShift(tx, mysql, adminUserId, lock = false) {
  return tx.get(
    `SELECT s.id,s.admin_user_id,s.operator_id,s.status,s.started_at,
            o.name operator_name,o.active operator_active
       FROM admin_shifts s
       JOIN admin_operators o ON o.id=s.operator_id
      WHERE s.admin_user_id=? AND s.status='OPEN'
      ORDER BY s.id DESC LIMIT 1${lock && mysql ? " FOR UPDATE" : ""}`,
    adminUserId,
  );
}

async function shiftSummary(tx, shiftId) {
  const result = await tx.get(
    `SELECT COUNT(*) receipt_count,
            COALESCE(SUM(actual_amount),0) cash_custody,
            COALESCE(SUM(expected_amount),0) expected_received,
            COALESCE(SUM(overage_amount),0) overage_total
       FROM admin_cash_receipts WHERE shift_id=?`,
    shiftId,
  );
  return {
    receipt_count: Number(result?.receipt_count || 0),
    cash_custody: Number(result?.cash_custody || 0),
    expected_received: Number(result?.expected_received || 0),
    overage_total: Number(result?.overage_total || 0),
  };
}

export async function getAdminCashState(user) {
  requireAdmin(user);
  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const operators = await tx.all(
      "SELECT id,name,active,created_at FROM admin_operators WHERE active=1 ORDER BY name,id",
    );
    const shift = await currentShift(tx, mysql, user.id);
    const pending = await tx.get(
      `SELECT COUNT(*) pending_count,
              COALESCE(SUM(expected_amount),0) pending_expected,
              COALESCE(SUM(submitted_amount),0) pending_actual
         FROM cod_settlement_batches WHERE status='SUBMITTED'`,
    );
    const issues = await tx.get(
      "SELECT COUNT(*) issue_count FROM cod_settlement_batches WHERE status='NEEDS_REVIEW'",
    );

    let current = null;
    let receipts = [];
    if (shift) {
      const summary = await shiftSummary(tx, shift.id);
      receipts = await tx.all(
        `SELECT r.id,r.batch_id,r.expected_amount,r.actual_amount,r.overage_amount,
                r.received_at,b.driver_id,u.name driver_name
           FROM admin_cash_receipts r
           JOIN cod_settlement_batches b ON b.id=r.batch_id
           JOIN users u ON u.id=b.driver_id
          WHERE r.shift_id=? ORDER BY r.id DESC LIMIT 12`,
        shift.id,
      );
      current = {
        id: Number(shift.id),
        operator_id: Number(shift.operator_id),
        operator_name: shift.operator_name,
        started_at: shift.started_at,
        ...summary,
      };
    }

    return {
      operators: operators.map((item) => ({
        id: Number(item.id),
        name: item.name,
        active: Boolean(item.active),
      })),
      current_shift: current,
      pending_driver: {
        count: Number(pending?.pending_count || 0),
        expected_amount: Number(pending?.pending_expected || 0),
        actual_amount: Number(pending?.pending_actual || 0),
      },
      issues: { count: Number(issues?.issue_count || 0) },
      recent_receipts: receipts.map((item) => ({
        id: Number(item.id),
        batch_id: Number(item.batch_id),
        driver_id: Number(item.driver_id),
        driver_name: item.driver_name,
        expected_amount: Number(item.expected_amount),
        actual_amount: Number(item.actual_amount),
        overage_amount: Number(item.overage_amount),
        received_at: item.received_at,
      })),
    };
  });
}

export async function bootstrapAdminOperator(user, input) {
  requireAdmin(user);
  const name = operatorName(input?.name);
  const pin = operatorPin(input?.pin);
  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const total = await tx.get("SELECT COUNT(*) count FROM admin_operators");
    if (Number(total?.count || 0) > 0)
      throw new DomainError(
        "Operator awal sudah dibuat. Penambahan operator berikutnya dikelola Manager/Owner.",
        409,
      );
    const created = await tx.run(
      "INSERT INTO admin_operators(name,pin_hash,created_by) VALUES(?,?,?)",
      name,
      hashPassword(pin),
      user.id,
    );
    const id = Number(created.lastInsertRowid);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADMIN_OPERATOR_BOOTSTRAPPED",
      JSON.stringify({ operatorId: id, operatorName: name }),
    );
    return { id, name, active: true };
  });
}

export async function startAdminShift(user, input) {
  requireAdmin(user);
  const operatorId = positiveId(input?.operatorId, "Operator");
  const pin = operatorPin(input?.pin);
  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const open = await currentShift(tx, mysql, user.id, true);
    if (open) {
      if (Number(open.operator_id) === operatorId)
        return {
          id: Number(open.id),
          operator_id: Number(open.operator_id),
          operator_name: open.operator_name,
          started_at: open.started_at,
          replayed: true,
        };
      throw new DomainError(
        `Shift ${open.operator_name} masih aktif. Selesaikan handover/end shift terlebih dahulu.`,
        409,
      );
    }
    const operator = await tx.get(
      `SELECT id,name,pin_hash,active FROM admin_operators WHERE id=?${mysql ? " FOR UPDATE" : ""}`,
      operatorId,
    );
    if (!operator || !Number(operator.active))
      throw new DomainError("Operator tidak aktif atau tidak ditemukan", 404);
    if (!checkPassword(pin, operator.pin_hash))
      throw new DomainError("PIN operator salah", 403);
    const created = await tx.run(
      "INSERT INTO admin_shifts(admin_user_id,operator_id,status) VALUES(?,?,'OPEN')",
      user.id,
      operatorId,
    );
    const id = Number(created.lastInsertRowid);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADMIN_SHIFT_STARTED",
      JSON.stringify({ shiftId: id, operatorId, operatorName: operator.name }),
    );
    const shift = await currentShift(tx, mysql, user.id);
    return {
      id,
      operator_id: operatorId,
      operator_name: operator.name,
      started_at: shift?.started_at || null,
      replayed: false,
    };
  });
}

export async function requireActiveAdminShift(tx, mysql, user) {
  requireAdmin(user);
  await ensureAdminCashSchema(tx, mysql);
  const shift = await currentShift(tx, mysql, user.id, true);
  if (!shift)
    throw new DomainError(
      "Mulai shift operator Admin terlebih dahulu sebelum menerima uang COD.",
      409,
    );
  return {
    id: Number(shift.id),
    admin_user_id: Number(shift.admin_user_id),
    operator_id: Number(shift.operator_id),
    operator_name: shift.operator_name,
    started_at: shift.started_at,
  };
}

export async function recordAdminBatchReceipt(tx, user, shift, batchRow) {
  requireAdmin(user);
  const batchId = positiveId(batchRow?.id, "Batch");
  const expected = Number(batchRow?.expected_amount || 0);
  const actual = Number(batchRow?.submitted_amount || 0);
  if (!Number.isSafeInteger(expected) || !Number.isSafeInteger(actual) || actual < expected)
    throw new DomainError("Setoran kurang tidak dapat diterima Admin", 409);

  const existing = await tx.get(
    "SELECT id,shift_id,operator_id FROM admin_cash_receipts WHERE batch_id=?",
    batchId,
  );
  if (existing) return { ...existing, replayed: true };

  const overage = actual - expected;
  const created = await tx.run(
    `INSERT INTO admin_cash_receipts(
       shift_id,operator_id,batch_id,expected_amount,actual_amount,overage_amount
     ) VALUES(?,?,?,?,?,?)`,
    shift.id,
    shift.operator_id,
    batchId,
    expected,
    actual,
    overage,
  );
  const receiptId = Number(created.lastInsertRowid);
  await tx.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "ADMIN_COD_CASH_RECEIVED",
    JSON.stringify({
      receiptId,
      shiftId: shift.id,
      operatorId: shift.operator_id,
      operatorName: shift.operator_name,
      batchId,
      driverId: Number(batchRow.driver_id),
      expectedAmount: expected,
      actualAmount: actual,
      overageAmount: overage,
    }),
  );
  return {
    id: receiptId,
    shift_id: shift.id,
    operator_id: shift.operator_id,
    batch_id: batchId,
    expected_amount: expected,
    actual_amount: actual,
    overage_amount: overage,
    replayed: false,
  };
}
