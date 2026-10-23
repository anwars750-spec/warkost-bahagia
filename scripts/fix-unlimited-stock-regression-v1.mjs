import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8").replace(/\r\n/g, "\n");
}

function write(file, content) {
  fs.writeFileSync(path.join(root, file), content);
}

function replaceOne(file, label, before, after) {
  let content = read(file);
  const count = content.split(before).length - 1;
  if (count !== 1)
    throw new Error(`${label}: expected 1 target in ${file}, found ${count}`);
  content = content.replace(before, after);
  write(file, content);
}

replaceOne(
  "lib/catalog.mjs",
  "public catalog internal flag",
  `          p.unlimited_stock,p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,`,
  `          p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,`,
);

replaceOne(
  "tests/unlimited-stock-v1.test.mjs",
  "public catalog flag assertion",
  `  assert.equal(Number(publicProduct.unlimited_stock), 1);\n  assert.equal(Number(publicProduct.in_stock), 1);`,
  `  assert.equal("unlimited_stock" in publicProduct, false);\n  assert.equal(Number(publicProduct.in_stock), 1);`,
);

replaceOne(
  "tests/mysql-operations.test.mjs",
  "migration count",
  `  assert.equal(migrations.length, 30);`,
  `  assert.equal(migrations.length, 31);`,
);

replaceOne(
  "tests/mysql-operations.test.mjs",
  "last migration",
  `  assert.equal(migrations.at(-1).version, "030_store_operating_hours_v1.sql");`,
  `  assert.equal(migrations.at(-1).version, "031_unlimited_stock_v1.sql");`,
);

replaceOne(
  "tests/mysql-operations.test.mjs",
  "checksum count",
  `  assert.equal(new Set(migrations.map(({ checksum }) => checksum)).size, 30);`,
  `  assert.equal(new Set(migrations.map(({ checksum }) => checksum)).size, 31);`,
);

fs.rmSync(path.join(root, "scripts/fix-unlimited-stock-regression-v1.mjs"), { force: true });
console.log("OK - Unlimited Stock regression fixes applied");
