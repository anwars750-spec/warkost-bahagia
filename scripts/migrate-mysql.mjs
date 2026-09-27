import mysql from "mysql2/promise";
import { loadMysqlMigrations } from "../lib/mysql-operations.mjs";
if (!process.env.DATABASE_URL?.startsWith("mysql://"))
  throw Error("DATABASE_URL MySQL wajib disetel");
const connection = await mysql.createConnection({
  uri: process.env.DATABASE_URL,
  multipleStatements: false,
});
let migrationLock = false;
try {
  await connection.query("SET time_zone = '+00:00'");
  const [lockRows] = await connection.query(
    "SELECT GET_LOCK('warkost_bahagia_migrations',30) acquired",
  );
  if (lockRows[0]?.acquired !== 1)
    throw Error("Tidak dapat memperoleh lock migrasi MySQL");
  migrationLock = true;
  await connection.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(version VARCHAR(120) PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB",
  );
  const [checksumColumn] = await connection.execute(
    "SELECT column_name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='schema_migrations' AND column_name='checksum'",
  );
  if (!checksumColumn.length)
    await connection.query(
      "ALTER TABLE schema_migrations ADD COLUMN checksum CHAR(64) NULL AFTER version",
    );
  for (const migration of loadMysqlMigrations()) {
    const [rows] = await connection.execute(
      "SELECT version,checksum FROM schema_migrations WHERE version=?",
      [migration.version],
    );
    if (rows.length) {
      if (rows[0].checksum && rows[0].checksum !== migration.checksum)
        throw Error("Checksum migration berubah: " + migration.version);
      if (!rows[0].checksum)
        await connection.execute(
          "UPDATE schema_migrations SET checksum=? WHERE version=? AND checksum IS NULL",
          [migration.checksum, migration.version],
        );
      console.log("Sudah diterapkan:", migration.version);
      continue;
    }
    const statements = migration.content
      .replace(/^--.*$/gm, "")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
    for (const sql of statements) await connection.query(sql);
    await connection.execute(
      "INSERT INTO schema_migrations(version,checksum) VALUES(?,?)",
      [migration.version, migration.checksum],
    );
    console.log("Migrasi diterapkan:", migration.version);
  }
} finally {
  if (migrationLock)
    await connection
      .query("SELECT RELEASE_LOCK('warkost_bahagia_migrations')")
      .catch(() => {});
  await connection.end();
}
