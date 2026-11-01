import * as store from "./store.mjs";
import { hashPassword } from "./auth.mjs";
import { DomainError } from "./domain.mjs";
import { ensureAdminCashSchema } from "./admin-cash-control.mjs";

function requireOwner(user) {
  if (!user || user.role !== "OWNER") throw new DomainError("Akses ditolak", 403);
}

function positiveId(value, label = "ID") {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1)
    throw new DomainError(`${label} tidak valid`, 400);
  return number;
}

function operatorName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new DomainError("Nama operator harus 2-80 karakter", 400);
  return name;
}

function operatorPin(value) {
  const pin = String(value || "").trim();
  if (!/^\d{4,6}$/.test(pin))
    throw new DomainError("PIN operator harus 4-6 digit angka", 400);
  return pin;
}

async function operatorRow(tx, id) {
  return tx.get(
    `SELECT o.id,o.name,o.active,o.created_at,
            CASE WHEN EXISTS(
              SELECT 1 FROM admin_shifts s
               WHERE s.operator_id=o.id AND s.status='OPEN'
            ) THEN 1 ELSE 0 END shift_active
       FROM admin_operators o
      WHERE o.id=?`,
    id,
  );
}

function publicOperator(row) {
  return {
    id: Number(row.id),
    name: row.name,
    active: Boolean(row.active),
    shift_active: Boolean(row.shift_active),
    created_at: row.created_at,
  };
}

export async function listOwnerAdminOperators(user) {
  requireOwner(user);
  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const rows = await tx.all(`
      SELECT o.id,o.name,o.active,o.created_at,
             CASE WHEN EXISTS(
               SELECT 1 FROM admin_shifts s
                WHERE s.operator_id=o.id AND s.status='OPEN'
             ) THEN 1 ELSE 0 END shift_active
        FROM admin_operators o
       ORDER BY o.active DESC,o.name,o.id
    `);
    return { operators: rows.map(publicOperator) };
  });
}

export async function createOwnerAdminOperator(user, input) {
  requireOwner(user);
  const name = operatorName(input?.name);
  const pin = operatorPin(input?.pin);

  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const duplicate = await tx.get(
      "SELECT id FROM admin_operators WHERE LOWER(name)=LOWER(?) LIMIT 1",
      name,
    );
    if (duplicate)
      throw new DomainError("Nama operator sudah terdaftar", 409);

    const created = await tx.run(
      "INSERT INTO admin_operators(name,pin_hash,active,created_by) VALUES(?,?,1,?)",
      name,
      hashPassword(pin),
      user.id,
    );
    const id = Number(created.lastInsertRowid);
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "OWNER_ADMIN_OPERATOR_CREATED",
      JSON.stringify({ operatorId: id, operatorName: name }),
    );
    return publicOperator(await operatorRow(tx, id));
  });
}

export async function resetOwnerAdminOperatorPin(user, input) {
  requireOwner(user);
  const operatorId = positiveId(input?.operatorId, "Operator");
  const pin = operatorPin(input?.pin);

  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const operator = await operatorRow(tx, operatorId);
    if (!operator) throw new DomainError("Operator tidak ditemukan", 404);

    await tx.run(
      "UPDATE admin_operators SET pin_hash=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      hashPassword(pin),
      operatorId,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "OWNER_ADMIN_OPERATOR_PIN_RESET",
      JSON.stringify({ operatorId, operatorName: operator.name }),
    );
    return publicOperator(await operatorRow(tx, operatorId));
  });
}

export async function setOwnerAdminOperatorActive(user, input) {
  requireOwner(user);
  const operatorId = positiveId(input?.operatorId, "Operator");
  const active = input?.active === true;

  return store.transaction(async (tx, mysql) => {
    await ensureAdminCashSchema(tx, mysql);
    const operator = await operatorRow(tx, operatorId);
    if (!operator) throw new DomainError("Operator tidak ditemukan", 404);
    if (!active && operator.shift_active)
      throw new DomainError(
        "Operator masih memiliki shift aktif. Selesaikan shift terlebih dahulu.",
        409,
      );

    await tx.run(
      "UPDATE admin_operators SET active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      active ? 1 : 0,
      operatorId,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      active ? "OWNER_ADMIN_OPERATOR_ACTIVATED" : "OWNER_ADMIN_OPERATOR_DEACTIVATED",
      JSON.stringify({ operatorId, operatorName: operator.name }),
    );
    return publicOperator(await operatorRow(tx, operatorId));
  });
}
