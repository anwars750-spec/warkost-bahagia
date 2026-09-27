import { db } from "./db.mjs";
import mysql from "mysql2/promise";
let pool;
let queue = Promise.resolve();
const mysqlMode = () => Boolean(process.env.DATABASE_URL);
function mysqlPool() {
  if (!process.env.DATABASE_URL?.startsWith("mysql://"))
    throw Error("DATABASE_URL harus berupa URI mysql://");
  if (!pool) {
    pool = mysql.createPool({
      uri: process.env.DATABASE_URL,
      waitForConnections: true,
      connectionLimit: 10,
      dateStrings: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      timezone: "Z",
      multipleStatements: false,
    });
    pool.on("connection", (connection) =>
      connection.query("SET time_zone = '+00:00'"),
    );
  }
  return pool;
}
function lock(fn) {
  const pending = queue.then(fn, fn);
  queue = pending.catch(() => {});
  return pending;
}
function sqlForMySQL(sql) {
  return sql.replaceAll("INSERT OR IGNORE", "INSERT IGNORE");
}
function adapter(database, mode) {
  return {
    async get(sql, ...args) {
      if (mode === "mysql") {
        const [rows] = await database.execute(sqlForMySQL(sql), args);
        return rows[0] || null;
      }
      return database.prepare(sql).get(...args) || null;
    },
    async all(sql, ...args) {
      if (mode === "mysql") {
        const [rows] = await database.execute(sqlForMySQL(sql), args);
        return rows;
      }
      return database.prepare(sql).all(...args);
    },
    async run(sql, ...args) {
      if (mode === "mysql") {
        const [result] = await database.execute(sqlForMySQL(sql), args);
        return {
          changes: result.affectedRows,
          lastInsertRowid: result.insertId,
        };
      }
      const result = database.prepare(sql).run(...args);
      return {
        changes: result.changes,
        lastInsertRowid: Number(result.lastInsertRowid),
      };
    },
  };
}
export async function get(sql, ...args) {
  return mysqlMode()
    ? adapter(mysqlPool(), "mysql").get(sql, ...args)
    : lock(() => adapter(db(), "sqlite").get(sql, ...args));
}
export async function all(sql, ...args) {
  return mysqlMode()
    ? adapter(mysqlPool(), "mysql").all(sql, ...args)
    : lock(() => adapter(db(), "sqlite").all(sql, ...args));
}
export async function run(sql, ...args) {
  return mysqlMode()
    ? adapter(mysqlPool(), "mysql").run(sql, ...args)
    : lock(() => adapter(db(), "sqlite").run(sql, ...args));
}
export async function transaction(fn) {
  if (mysqlMode()) {
    const connection = await mysqlPool().getConnection();
    try {
      await connection.beginTransaction();
      const result = await fn(adapter(connection, "mysql"), true);
      await connection.commit();
      return result;
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  }
  return lock(async () => {
    const database = db();
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = await fn(adapter(database, "sqlite"), false);
      database.exec("COMMIT");
      return result;
    } catch (e) {
      database.exec("ROLLBACK");
      throw e;
    }
  });
}
export function isMySQL() {
  return mysqlMode();
}
