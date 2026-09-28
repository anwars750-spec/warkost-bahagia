import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const directory = fs.mkdtempSync(
  path.join(os.tmpdir(), "sqlite-role-upgrade-"),
);
const databasePath = path.join(directory, "legacy.db");
const legacy = new DatabaseSync(databasePath);
legacy.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users(id INTEGER PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN('CUSTOMER','ADMIN','DRIVER')),created_at TEXT DEFAULT CURRENT_TIMESTAMP,active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id INTEGER NOT NULL REFERENCES users(id),expires_at INTEGER NOT NULL,revoked_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO users(id,name,email,password_hash,role) VALUES(7,'Admin Lama','legacy@test.local','x','ADMIN');
  INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('legacy-token',7,9999999999999);
`);
legacy.close();
process.env.DATABASE_PATH = databasePath;

const { db } = await import("../lib/db.mjs");

test("upgrade SQLite mempertahankan data dan membuka role Kitchen/Owner", () => {
  const upgraded = db();
  assert.equal(
    upgraded.prepare("SELECT email FROM users WHERE id=7").get().email,
    "legacy@test.local",
  );
  assert.equal(
    upgraded
      .prepare("SELECT user_id FROM sessions WHERE token_hash='legacy-token'")
      .get().user_id,
    7,
  );
  upgraded
    .prepare(
      "INSERT INTO users(name,email,password_hash,role) VALUES('Kitchen','kitchen@upgrade.test','x','KITCHEN'),('Owner','owner@upgrade.test','x','OWNER')",
    )
    .run();
  assert.equal(
    upgraded
      .prepare(
        "SELECT COUNT(*) count FROM users WHERE role IN ('KITCHEN','OWNER')",
      )
      .get().count,
    2,
  );
  assert.ok(
    upgraded
      .prepare("PRAGMA table_info(products)")
      .all()
      .some((column) => column.name === "stock_quantity"),
  );
});
