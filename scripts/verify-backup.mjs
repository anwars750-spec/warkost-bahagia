import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-restore-"));
const run = (script, args = [], env = {}) =>
  spawnSync(process.execPath, ["scripts/" + script, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
try {
  const source = path.join(dir, "source.db");
  process.env.DATABASE_PATH = source;
  const { db } = await import("../lib/db.mjs");
  const data = db();
  data
    .prepare(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES(17,'Admin','backup@test.local','x','ADMIN')",
    )
    .run();
  data
    .prepare(
      "INSERT INTO users(id,name,email,password_hash,role) VALUES(18,'Customer','customer@backup.test','x','CUSTOMER')",
    )
    .run();
  data.prepare("INSERT INTO categories(name) VALUES('Menu')").run();
  data
    .prepare(
      "INSERT INTO products(category_id,name,price) VALUES(1,'Kopi',15000)",
    )
    .run();
  data
    .prepare(
      "INSERT INTO addresses(user_id,label,detail) VALUES(18,'Rumah','Alamat pelanggan cukup panjang')",
    )
    .run();
  data
    .prepare(
      "INSERT INTO orders(id,customer_id,address_id,total) VALUES(23,18,1,15000)",
    )
    .run();
  data
    .prepare(
      "INSERT INTO order_items(order_id,product_id,name,price,quantity) VALUES(23,1,'Kopi',15000,1)",
    )
    .run();
  data.prepare("INSERT INTO payments(order_id,method) VALUES(23,'CASH')").run();
  data.close();

  const result = run("backup.mjs", [], { BACKUP_DIRECTORY: dir });
  if (result.status !== 0) throw Error(result.stderr);
  const backup = result.stdout.trim();
  if (!fs.existsSync(backup + ".sha256"))
    throw Error("Checksum backup tidak dibuat");
  const dest = path.join(dir, "restored.db");
  const restored = run("restore.mjs", [backup, dest]);
  if (restored.status !== 0) throw Error(restored.stderr);
  const check = new DatabaseSync(dest, { readOnly: true });
  if (
    check.prepare("SELECT name FROM users WHERE id=17").get()?.name !==
      "Admin" ||
    check.prepare("SELECT total FROM orders WHERE id=23").get()?.total !==
      15000 ||
    check.prepare("SELECT COUNT(*) n FROM order_items WHERE order_id=23").get()
      .n !== 1
  )
    throw Error("Restore tidak cocok");
  check.close();

  const checksum = fs.readFileSync(backup + ".sha256", "utf8");
  fs.writeFileSync(backup + ".sha256", "0".repeat(64) + "\n");
  const tampered = path.join(dir, "tampered.db");
  if (
    run("restore.mjs", [backup, tampered]).status === 0 ||
    fs.existsSync(tampered)
  )
    throw Error("Restore menerima checksum salah");
  fs.writeFileSync(backup + ".sha256", checksum);

  const missingHash = path.join(dir, "missing-hash.db");
  fs.copyFileSync(backup, missingHash);
  if (
    run("restore.mjs", [missingHash, path.join(dir, "unverified.db")])
      .status === 0
  )
    throw Error("Restore menerima backup tanpa checksum");

  const existing = path.join(dir, "existing.db");
  fs.writeFileSync(existing, "jangan timpa");
  if (
    run("restore.mjs", [backup, existing]).status === 0 ||
    fs.readFileSync(existing, "utf8") !== "jangan timpa"
  )
    throw Error("Restore menimpa target yang sudah ada");

  const broken = path.join(dir, "broken.db");
  fs.copyFileSync(source, broken);
  const invalid = new DatabaseSync(broken);
  invalid.exec("PRAGMA foreign_keys=OFF");
  invalid
    .prepare(
      "INSERT INTO orders(customer_id,address_id,total) VALUES(999,999,1)",
    )
    .run();
  invalid.close();
  if (
    run("backup.mjs", [], {
      DATABASE_PATH: broken,
      BACKUP_DIRECTORY: path.join(dir, "broken-backups"),
    }).status === 0
  )
    throw Error("Backup menerima foreign key rusak");

  const incomplete = path.join(dir, "incomplete.db");
  const partial = new DatabaseSync(incomplete);
  partial.exec("CREATE TABLE users(id INTEGER PRIMARY KEY)");
  partial.close();
  if (
    run("backup.mjs", [], {
      DATABASE_PATH: incomplete,
      BACKUP_DIRECTORY: path.join(dir, "incomplete-backups"),
    }).status === 0
  )
    throw Error("Backup menerima skema tidak lengkap");
  console.log(
    "Backup dan restore SQLite lulus: data, skema, checksum, overwrite, dan foreign key",
  );
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
