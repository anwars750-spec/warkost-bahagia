import * as store from "./store.mjs";
import { DomainError } from "./domain.mjs";
import { ensureAdminCashSchema } from "./admin-cash-control.mjs";

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

function slipNumber(id) {
  return `ST-${jakartaDateKey()}-${String(id).padStart(4, "0")}`;
}

function sqlTimestamp() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

export async function ensureCashSettlementSchema(tx, mysql = false) {
  await ensureAdminCashSchema(tx, mysql);
  if (mysql) {
    await tx.run(`CREATE TABLE IF NOT EXISTS admin_shift_settlements(
      id BIGINT PRIMARY KEY AUTO_INCREMENT,
      slip_number VARCHAR(40) UNIQUE NULL,
      shift_id BIGINT NOT NULL UNIQUE,
      admin_user_id BIGINT NOT NULL,
      operator_id BIGINT NOT NULL,
      expected_amount BIGINT NOT NULL,
      submitted_amount BIGINT NOT NULL,
      admin_overage_amount BIGINT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      manager_id BIGINT NULL,
      manager_received_amount BIGINT NULL,
      manager_overage_amount BIGINT NOT NULL DEFAULT 0,
      manager_custody_status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
      submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      verified_at TIMESTAMP NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_admin_shift_settlements_status(status,id),
      INDEX idx_admin_shift_settlements_manager(manager_id,manager_custody_status,id),
      CONSTRAINT fk_shift_settlement_shift FOREIGN KEY(shift_id) REFERENCES admin_shifts(id),
      CONSTRAINT fk_shift_settlement_admin FOREIGN KEY(admin_user_id) REFERENCES users(id),
      CONSTRAINT fk_shift_settlement_operator FOREIGN KEY(operator_id) REFERENCES admin_operators(id),
      CONSTRAINT fk_shift_settlement_manager FOREIGN KEY(manager_id) REFERENCES users(id)
    ) ENGINE=InnoDB`);
    return;
  }

  await tx.run(`CREATE TABLE IF NOT EXISTS admin_shift_settlements(
    id INTEGER PRIMARY KEY,
    slip_number TEXT UNIQUE,
    shift_id INTEGER NOT NULL UNIQUE REFERENCES admin_shifts(id),
    admin_user_id INTEGER NOT NULL REFERENCES users(id),
    operator_id INTEGER NOT NULL REFERENCES admin_operators(id),
    expected_amount INTEGER NOT NULL CHECK(expected_amount>=0),
    submitted_amount INTEGER NOT NULL CHECK(submitted_amount>=0),
    admin_overage_amount INTEGER NOT NULL DEFAULT 0 CHECK(admin_overage_amount>=0),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','VERIFIED','ISSUE')),
    manager_id INTEGER REFERENCES users(id),
    manager_received_amount INTEGER CHECK(manager_received_amount IS NULL OR manager_received_amount>=0),
    manager_overage_amount INTEGER NOT NULL DEFAULT 0 CHECK(manager_overage_amount>=0),
    manager_custody_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(manager_custody_status IN('PENDING','HELD','SETTLED')),
    submitted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    verified_at TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_admin_shift_settlements_status ON admin_shift_settlements(status,id)",
  );
  await tx.run(
    "CREATE INDEX IF NOT EXISTS idx_admin_shift_settlements_manager ON admin_shift_settlements(manager_id,manager_custody_status,id)",
  );
}

async function currentAdminShift(tx, mysql, adminUserId, lock = false) {
  return tx.get(
    `SELECT s.id,s.admin_user_id,s.operator_id,s.status,s.started_at,o.name operator_name
       FROM admin_shifts s
       JOIN admin_operators o ON o.id=s.operator_id
      WHERE s.admin_user_id=? AND s.status='OPEN'
      ORDER BY s.id DESC LIMIT 1${lock && mysql ? " FOR UPDATE" : ""}`,
    adminUserId,
  );
}

async function shiftCash(tx, shiftId) {
  const row = await tx.get(
    `SELECT COUNT(*) receipt_count,
            COALESCE(SUM(expected_amount),0) expected_received,
            COALESCE(SUM(actual_amount),0) cash_custody,
            COALESCE(SUM(overage_amount),0) driver_overage
       FROM admin_cash_receipts WHERE shift_id=?`,
    shiftId,
  );
  return {
    receipt_count: Number(row?.receipt_count || 0),
    expected_received: Number(row?.expected_received || 0),
    cash_custody: Number(row?.cash_custody || 0),
    driver_overage: Number(row?.driver_overage || 0),
  };
}

async function settlementRow(tx, settlementId) {
  return tx.get(
    `SELECT x.id,x.slip_number,x.shift_id,x.admin_user_id,x.operator_id,
            x.expected_amount,x.submitted_amount,x.admin_overage_amount,x.status,
            x.manager_id,x.manager_received_amount,x.manager_overage_amount,
            x.manager_custody_status,x.submitted_at,x.verified_at,
            s.started_at,s.ended_at,o.name operator_name,
            a.name admin_account_name,m.name manager_name,
            (SELECT COUNT(*) FROM admin_cash_receipts r WHERE r.shift_id=x.shift_id) receipt_count
       FROM admin_shift_settlements x
       JOIN admin_shifts s ON s.id=x.shift_id
       JOIN admin_operators o ON o.id=x.operator_id
       JOIN users a ON a.id=x.admin_user_id
       LEFT JOIN users m ON m.id=x.manager_id
      WHERE x.id=?`,
    settlementId,
  );
}

function publicSettlement(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    slip_number: row.slip_number,
    shift_id: Number(row.shift_id),
    admin_user_id: Number(row.admin_user_id),
    admin_account_name: row.admin_account_name,
    operator_id: Number(row.operator_id),
    operator_name: row.operator_name,
    receipt_count: Number(row.receipt_count || 0),
    expected_amount: Number(row.expected_amount || 0),
    submitted_amount: Number(row.submitted_amount || 0),
    admin_overage_amount: Number(row.admin_overage_amount || 0),
    status: row.status,
    manager_id: row.manager_id === null ? null : Number(row.manager_id),
    manager_name: row.manager_name || null,
    manager_received_amount:
      row.manager_received_amount === null
        ? null
        : Number(row.manager_received_amount),
    manager_overage_amount: Number(row.manager_overage_amount || 0),
    manager_custody_status: row.manager_custody_status,
    started_at: row.started_at,
    ended_at: row.ended_at,
    submitted_at: row.submitted_at,
    verified_at: row.verified_at,
  };
}

function createdSettlementSnapshot({
  id,
  slip,
  shift,
  summary,
  user,
  submitted,
  closedAt,
}) {
  const expected = Number(summary.cash_custody || 0);
  return {
    id: Number(id),
    slip_number: slip,
    shift_id: Number(shift.id),
    admin_user_id: Number(user.id),
    admin_account_name: user.name || null,
    operator_id: Number(shift.operator_id),
    operator_name: shift.operator_name,
    receipt_count: Number(summary.receipt_count || 0),
    expected_amount: expected,
    submitted_amount: Number(submitted),
    admin_overage_amount: Number(submitted) - expected,
    status: "PENDING",
    manager_id: null,
    manager_name: null,
    manager_received_amount: null,
    manager_overage_amount: 0,
    manager_custody_status: "PENDING",
    started_at: shift.started_at,
    ended_at: closedAt,
    submitted_at: closedAt,
    verified_at: null,
  };
}

export async function getAdminShiftSettlementState(user) {
  requireRole(user, ["ADMIN"]);
  return store.transaction(async (tx, mysql) => {
    await ensureCashSettlementSchema(tx, mysql);
    const shift = await currentAdminShift(tx, mysql, user.id);
    let current = null;
    if (shift) {
      current = {
        id: Number(shift.id),
        operator_id: Number(shift.operator_id),
        operator_name: shift.operator_name,
        started_at: shift.started_at,
        ...(await shiftCash(tx, shift.id)),
      };
    }
    const rows = await tx.all(
      `SELECT id FROM admin_shift_settlements
        WHERE admin_user_id=? ORDER BY id DESC LIMIT 8`,
      user.id,
    );
    const recent = [];
    for (const item of rows)
      recent.push(publicSettlement(await settlementRow(tx, item.id)));
    return { current_shift: current, recent_settlements: recent };
  });
}

export async function submitAdminShiftSettlement(user, input) {
  requireRole(user, ["ADMIN"]);
  const submitted = amount(input?.submittedAmount, "Uang yang diserahkan");
  const requestedShiftId =
    input?.shiftId === undefined || input?.shiftId === null
      ? null
      : positiveId(input.shiftId, "Shift");

  return store.transaction(async (tx, mysql) => {
    await ensureCashSettlementSchema(tx, mysql);

    if (requestedShiftId) {
      const replay = await tx.get(
        "SELECT id FROM admin_shift_settlements WHERE shift_id=? AND admin_user_id=?",
        requestedShiftId,
        user.id,
      );
      if (replay)
        return {
          no_cash: false,
          settlement: publicSettlement(await settlementRow(tx, replay.id)),
          replayed: true,
        };
    }

    const shift = await currentAdminShift(tx, mysql, user.id, true);
    if (!shift)
      throw new DomainError("Tidak ada shift Admin aktif yang dapat ditutup", 409);
    if (requestedShiftId && Number(shift.id) !== requestedShiftId)
      throw new DomainError("Shift aktif berubah. Muat ulang data setoran terlebih dahulu.", 409);

    const summary = await shiftCash(tx, shift.id);
    const expected = summary.cash_custody;
    if (submitted < expected)
      throw new DomainError(
        `Setoran kurang Rp${(expected - submitted).toLocaleString("id-ID")}. Setoran tidak dapat dilanjutkan.`,
        409,
      );

    const closedAt = sqlTimestamp();

    if (expected === 0 && submitted === 0) {
      await tx.run(
        "UPDATE admin_shifts SET status='CLOSED',ended_at=?,updated_at=? WHERE id=?",
        closedAt,
        closedAt,
        shift.id,
      );
      await tx.run(
        "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
        user.id,
        "ADMIN_SHIFT_CLOSED_NO_CASH",
        JSON.stringify({
          shiftId: Number(shift.id),
          operatorId: Number(shift.operator_id),
          operatorName: shift.operator_name,
        }),
      );
      return {
        no_cash: true,
        shift_id: Number(shift.id),
        operator_name: shift.operator_name,
        expected_amount: 0,
        submitted_amount: 0,
      };
    }

    const existing = await tx.get(
      "SELECT id FROM admin_shift_settlements WHERE shift_id=?",
      shift.id,
    );
    if (existing)
      return {
        no_cash: false,
        settlement: publicSettlement(await settlementRow(tx, existing.id)),
        replayed: true,
      };

    const created = await tx.run(
      `INSERT INTO admin_shift_settlements(
         shift_id,admin_user_id,operator_id,expected_amount,submitted_amount,
         admin_overage_amount,status,manager_custody_status,submitted_at,updated_at
       ) VALUES(?,?,?,?,?,?,'PENDING','PENDING',?,?)`,
      shift.id,
      user.id,
      shift.operator_id,
      expected,
      submitted,
      submitted - expected,
      closedAt,
      closedAt,
    );
    const id = Number(created.lastInsertRowid);
    const slip = slipNumber(id);
    await tx.run(
      "UPDATE admin_shift_settlements SET slip_number=?,updated_at=? WHERE id=?",
      slip,
      closedAt,
      id,
    );
    await tx.run(
      "UPDATE admin_shifts SET status='CLOSED',ended_at=?,updated_at=? WHERE id=?",
      closedAt,
      closedAt,
      shift.id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "ADMIN_SHIFT_SETTLEMENT_SUBMITTED",
      JSON.stringify({
        settlementId: id,
        slipNumber: slip,
        shiftId: Number(shift.id),
        operatorId: Number(shift.operator_id),
        operatorName: shift.operator_name,
        expectedAmount: expected,
        submittedAmount: submitted,
        overageAmount: submitted - expected,
      }),
    );

    return {
      no_cash: false,
      settlement: createdSettlementSnapshot({
        id,
        slip,
        shift,
        summary,
        user,
        submitted,
        closedAt,
      }),
      replayed: false,
    };
  });
}

export async function getManagerCashState(user) {
  requireRole(user, ["MANAGER", "OWNER"]);
  return store.transaction(async (tx, mysql) => {
    await ensureCashSettlementSchema(tx, mysql);
    const pendingIds = await tx.all(
      "SELECT id FROM admin_shift_settlements WHERE status='PENDING' ORDER BY id ASC LIMIT 50",
    );
    const pending = [];
    for (const item of pendingIds)
      pending.push(publicSettlement(await settlementRow(tx, item.id)));

    const held = await tx.get(
      `SELECT COUNT(*) count,COALESCE(SUM(manager_received_amount),0) amount
         FROM admin_shift_settlements
        WHERE status='VERIFIED' AND manager_custody_status='HELD'`,
    );
    const recentIds = await tx.all(
      "SELECT id FROM admin_shift_settlements WHERE status='VERIFIED' ORDER BY id DESC LIMIT 12",
    );
    const recent = [];
    for (const item of recentIds)
      recent.push(publicSettlement(await settlementRow(tx, item.id)));

    return {
      pending,
      summary: {
        pending_count: pending.length,
        pending_amount: pending.reduce(
          (sum, item) => sum + Number(item.submitted_amount || 0),
          0,
        ),
        manager_cash: Number(held?.amount || 0),
        manager_cash_count: Number(held?.count || 0),
      },
      recent,
    };
  });
}

export async function verifyManagerSettlement(user, input) {
  requireRole(user, ["MANAGER", "OWNER"]);
  const settlementId = positiveId(input?.settlementId, "Setoran");
  const received = amount(input?.receivedAmount, "Uang yang diterima");

  return store.transaction(async (tx, mysql) => {
    await ensureCashSettlementSchema(tx, mysql);
    const row = await tx.get(
      `SELECT id,status,submitted_amount,manager_id,manager_received_amount
         FROM admin_shift_settlements WHERE id=?${mysql ? " FOR UPDATE" : ""}`,
      settlementId,
    );
    if (!row) throw new DomainError("Setoran Admin tidak ditemukan", 404);
    if (row.status === "VERIFIED")
      return { settlement: publicSettlement(await settlementRow(tx, settlementId)), replayed: true };
    if (row.status !== "PENDING")
      throw new DomainError("Setoran belum dapat diverifikasi", 409);

    const expected = Number(row.submitted_amount || 0);
    if (received < expected)
      throw new DomainError(
        `Uang diterima kurang Rp${(expected - received).toLocaleString("id-ID")}. Verifikasi diblokir.`,
        409,
      );

    await tx.run(
      `UPDATE admin_shift_settlements
          SET status='VERIFIED',manager_id=?,manager_received_amount=?,
              manager_overage_amount=?,manager_custody_status='HELD',
              verified_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
        WHERE id=?`,
      user.id,
      received,
      received - expected,
      settlementId,
    );
    const settlement = publicSettlement(await settlementRow(tx, settlementId));
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "MANAGER_ADMIN_SETTLEMENT_VERIFIED",
      JSON.stringify({
        settlementId,
        slipNumber: settlement.slip_number,
        operatorId: settlement.operator_id,
        operatorName: settlement.operator_name,
        expectedAmount: expected,
        receivedAmount: received,
        overageAmount: received - expected,
      }),
    );
    return { settlement, replayed: false };
  });
}
