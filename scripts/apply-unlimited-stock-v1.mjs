import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function write(file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function replaceOnce(file, before, after) {
  const current = read(file);
  const first = current.indexOf(before);
  if (first < 0) throw new Error(`Target patch tidak ditemukan: ${file}`);
  if (current.indexOf(before, first + before.length) >= 0)
    throw new Error(`Target patch ambigu: ${file}`);
  write(file, current.slice(0, first) + after + current.slice(first + before.length));
}

// SQLite runtime + base schema.
replaceOnce(
  "lib/db.mjs",
  `    ensureColumn(\n      "products",\n      "stock_quantity",\n      "INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0)",\n    );`,
  `    ensureColumn(\n      "products",\n      "stock_quantity",\n      "INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0)",\n    );\n    ensureColumn(\n      "products",\n      "unlimited_stock",\n      "INTEGER NOT NULL DEFAULT 0 CHECK(unlimited_stock IN(0,1))",\n    );`,
);
replaceOnce(
  "lib/db.mjs",
  `stock_quantity INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0), stock_unit TEXT NOT NULL DEFAULT 'PCS'`,
  `stock_quantity INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0), unlimited_stock INTEGER NOT NULL DEFAULT 0 CHECK(unlimited_stock IN(0,1)), stock_unit TEXT NOT NULL DEFAULT 'PCS'`,
);

// Catalog read/write contract.
replaceOnce(
  "lib/catalog.mjs",
  `          p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,\n          CASE WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)<0 THEN 0 ELSE p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0) END available_quantity,\n          CASE WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)>=p.minimum_order_quantity THEN 1 ELSE 0 END in_stock`,
  `          p.unlimited_stock,p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,\n          CASE WHEN p.unlimited_stock=1 THEN p.stock_quantity WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)<0 THEN 0 ELSE p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0) END available_quantity,\n          CASE WHEN p.unlimited_stock=1 THEN 1 WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)>=p.minimum_order_quantity THEN 1 ELSE 0 END in_stock`,
);
replaceOnce(
  "lib/catalog.mjs",
  `  const lowStockThreshold = Number(input.lowStockThreshold ?? 0);`,
  `  const lowStockThreshold = Number(input.lowStockThreshold ?? 0);\n  const unlimitedStock = input.unlimitedStock === true ? 1 : 0;`,
);
replaceOnce(
  "lib/catalog.mjs",
  `        stock_unit=?,price_unit_quantity=?,minimum_order_quantity=?,order_step_quantity=?,low_stock_threshold=? WHERE id=?`,
  `        stock_unit=?,price_unit_quantity=?,minimum_order_quantity=?,order_step_quantity=?,low_stock_threshold=?,unlimited_stock=? WHERE id=?`,
);
replaceOnce(
  "lib/catalog.mjs",
  `      lowStockThreshold,\n      Number(input.id),`,
  `      lowStockThreshold,\n      unlimitedStock,\n      Number(input.id),`,
);
replaceOnce(
  "lib/catalog.mjs",
  `        stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold)\n       VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
  `        stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold,unlimited_stock)\n       VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?,?)`,
);
replaceOnce(
  "lib/catalog.mjs",
  `      lowStockThreshold,\n    );\n  }\n  await store.run(`,
  `      lowStockThreshold,\n      unlimitedStock,\n    );\n  }\n  await store.run(`,
);
replaceOnce(
  "lib/catalog.mjs",
  `    JSON.stringify({ id: input.id || null, name, prepStation, stockUnit }),`,
  `    JSON.stringify({\n      id: input.id || null,\n      name,\n      prepStation,\n      stockUnit,\n      unlimitedStock: Boolean(unlimitedStock),\n    }),`,
);

// Stock control read/write behavior.
replaceOnce(
  "lib/operations.mjs",
  `      "SELECT id,name,stock_quantity,stock_unit FROM products WHERE id=?" +`,
  `      "SELECT id,name,stock_quantity,stock_unit,unlimited_stock FROM products WHERE id=?" +`,
);
replaceOnce(
  "lib/operations.mjs",
  `    if (!product) throw new DomainError("Produk tidak ditemukan", 404);\n    const balance = Number(product.stock_quantity) + quantity;`,
  `    if (!product) throw new DomainError("Produk tidak ditemukan", 404);\n    if (Number(product.unlimited_stock) === 1)\n      throw new DomainError(\n        "Produk unlimited tidak menggunakan penyesuaian stok",\n        409,\n      );\n    const balance = Number(product.stock_quantity) + quantity;`,
);
replaceOnce(
  "lib/operations.mjs",
  `    \`SELECT p.id,p.name,p.price,p.image_url,p.stock_quantity,p.prep_station,p.active,p.stock_unit,`,
  `    \`SELECT p.id,p.name,p.price,p.image_url,p.stock_quantity,p.unlimited_stock,p.prep_station,p.active,p.stock_unit,`,
);
replaceOnce(
  "lib/operations.mjs",
  `  for (const product of products) {\n    product.stock_status =\n      Number(product.available_quantity) <= 0`,
  `  for (const product of products) {\n    product.stock_status =\n      Number(product.unlimited_stock) === 1\n        ? "UNLIMITED"\n        : Number(product.available_quantity) <= 0`,
);

// Reservation + stock commit behavior. Unlimited items still keep a reservation
// row for lifecycle/idempotency, but availability and physical stock are ignored.
replaceOnce(
  "lib/domain.mjs",
  `  if (existing) return false;\n  const lines = await tx.all(`,
  `  if (existing) return false;\n  const committedReservation = await tx.get(\n    "SELECT id FROM stock_reservations WHERE order_id=? AND status='COMMITTED' LIMIT 1" +\n      (mysql ? " FOR UPDATE" : ""),\n    orderId,\n  );\n  if (committedReservation) return false;\n  const lines = await tx.all(`,
);
replaceOnce(
  "lib/domain.mjs",
  `      "SELECT id,name,stock_quantity FROM products WHERE id=?" +`,
  `      "SELECT id,name,stock_quantity,unlimited_stock FROM products WHERE id=?" +`,
);
replaceOnce(
  "lib/domain.mjs",
  `      !product ||\n      Number(product.stock_quantity) - Number(otherReservations.quantity) <\n        quantity`,
  `      !product ||\n      (Number(product.unlimited_stock) !== 1 &&\n        Number(product.stock_quantity) - Number(otherReservations.quantity) <\n          quantity)`,
);
replaceOnce(
  "lib/domain.mjs",
  `      );\n    const balance = Number(product.stock_quantity) - quantity;`,
  `      );\n    if (Number(product.unlimited_stock) === 1) continue;\n    const balance = Number(product.stock_quantity) - quantity;`,
);
replaceOnce(
  "lib/domain.mjs",
  `      "SELECT id,name,stock_quantity FROM products WHERE id=?" +`,
  `      "SELECT id,name,stock_quantity,unlimited_stock FROM products WHERE id=?" +`,
);
replaceOnce(
  "lib/domain.mjs",
  `      !product ||\n      Number(product.stock_quantity) - Number(reserved.quantity) < line.quantity`,
  `      !product ||\n      (Number(product.unlimited_stock) !== 1 &&\n        Number(product.stock_quantity) - Number(reserved.quantity) < line.quantity)`,
);

// Manager Product Master + Stock presentation.
replaceOnce(
  "app/ManagerControlCenter.js",
  `            lowStockThreshold: Number(form.get("lowStockThreshold")),\n            active: form.get("active") === "on",`,
  `            lowStockThreshold: Number(form.get("lowStockThreshold")),\n            unlimitedStock: form.get("unlimitedStock") === "on",\n            active: form.get("active") === "on",`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `        <label className="manager-switch">\n          <input\n            name="active"\n            type="checkbox"\n            defaultChecked={product ? Boolean(product.active) : true}\n          />{" "}\n          Produk aktif\n        </label>`,
  `        <label className="manager-switch">\n          <input\n            name="active"\n            type="checkbox"\n            defaultChecked={product ? Boolean(product.active) : true}\n          />{" "}\n          Produk aktif\n        </label>\n        <label className="manager-switch">\n          <input\n            name="unlimitedStock"\n            type="checkbox"\n            defaultChecked={Number(product?.unlimited_stock || 0) === 1}\n          />{" "}\n          Stok unlimited\n        </label>`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `  const low = inventory.products.filter(\n    (row) =>\n      Number(\n        stockById.get(Number(row.id))?.available_quantity ?? row.stock_quantity,\n      ) <= Number(row.low_stock_threshold || 0),\n  ).length;`,
  `  const low = inventory.products.filter(\n    (row) =>\n      Number(row.unlimited_stock) !== 1 &&\n      Number(\n        stockById.get(Number(row.id))?.available_quantity ?? row.stock_quantity,\n      ) <= Number(row.low_stock_threshold || 0),\n  ).length;`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `                      <td>\n                        {formatStockQuantity(\n                          currentStock?.available_quantity ??\n                            row.stock_quantity,\n                          row.stock_unit,\n                        )}\n                      </td>`,
  `                      <td>\n                        {Number(row.unlimited_stock) === 1\n                          ? "Unlimited"\n                          : formatStockQuantity(\n                              currentStock?.available_quantity ??\n                                row.stock_quantity,\n                              row.stock_unit,\n                            )}\n                      </td>`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `  const healthLabel = (status) =>\n    status === "OUT" ? "Habis" : status === "LOW" ? "Rendah" : "Aman";`,
  `  const healthLabel = (status) =>\n    status === "UNLIMITED"\n      ? "Unlimited"\n      : status === "OUT"\n        ? "Habis"\n        : status === "LOW"\n          ? "Rendah"\n          : "Aman";`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `            <option value="OUT">Habis</option>`,
  `            <option value="OUT">Habis</option>\n            <option value="UNLIMITED">Unlimited</option>`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `                  {formatStockQuantity(row.stock_quantity, row.stock_unit)}`,
  `{Number(row.unlimited_stock) === 1\n                    ? "∞"\n                    : formatStockQuantity(row.stock_quantity, row.stock_unit)}`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `                  {formatStockQuantity(row.reserved_quantity, row.stock_unit)}`,
  `{Number(row.unlimited_stock) === 1\n                    ? "—"\n                    : formatStockQuantity(row.reserved_quantity, row.stock_unit)}`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `                  {formatStockQuantity(row.available_quantity, row.stock_unit)}`,
  `{Number(row.unlimited_stock) === 1\n                    ? "∞"\n                    : formatStockQuantity(row.available_quantity, row.stock_unit)}`,
);
replaceOnce(
  "app/ManagerControlCenter.js",
  `              className="manager-stock-action"\n              onClick={() => setSelectedProductId(row.id)}\n            >\n              Atur Stok`,
  `              className="manager-stock-action"\n              disabled={Number(row.unlimited_stock) === 1}\n              onClick={() => setSelectedProductId(row.id)}\n            >\n              {Number(row.unlimited_stock) === 1 ? "Unlimited" : "Atur Stok"}`,
);

write(
  "migrations/031_unlimited_stock_v1.sql",
  `ALTER TABLE products\n  ADD COLUMN unlimited_stock BOOLEAN NOT NULL DEFAULT FALSE AFTER stock_quantity;\n`,
);

write(
  "tests/unlimited-stock-v1.test.mjs",
  `import test, { after } from "node:test";\nimport assert from "node:assert/strict";\nimport fs from "node:fs";\nimport os from "node:os";\nimport path from "node:path";\n\nconst directory = fs.mkdtempSync(path.join(os.tmpdir(), "warkost-unlimited-stock-"));\nprocess.env.DATABASE_PATH = path.join(directory, "data.db");\nprocess.env.WARKOST_TEST_STORE_NOW_MS = String(Date.parse("2026-10-23T05:00:00.000Z"));\n\nconst { db } = await import("../lib/db.mjs");\nconst store = await import("../lib/store.mjs");\nconst { saveProduct, listCatalog } = await import("../lib/catalog.mjs");\nconst { adjustStock, listStock } = await import("../lib/operations.mjs");\nconst { createOrder, commitOrderStock, DomainError } = await import("../lib/domain.mjs");\n\nconst database = db();\nconst manager = { id: 20, role: "MANAGER" };\nconst customer = { id: 10, role: "CUSTOMER" };\n\nafter(async () => {\n  try { await store.close(); } catch {}\n  try { database.close(); } catch {}\n  try { fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {}\n});\n\ndatabase.exec(\`\n  INSERT INTO users(id,name,email,password_hash,role,active) VALUES\n    (10,'Customer Unlimited','unlimited-customer@test.local','x','CUSTOMER',1),\n    (20,'Manager Unlimited','unlimited-manager@test.local','x','MANAGER',1);\n  INSERT OR IGNORE INTO categories(id,name,active) VALUES(900,'Makanan',1);\n  INSERT INTO addresses(id,user_id,label,detail,latitude,longitude,is_default,active)\n    VALUES(900,10,'Rumah','Alamat test unlimited stock',-6.9217,106.9272,1,1);\n\`);\n\nfunction productInput(overrides = {}) {\n  return {\n    name: "Produk Unlimited Test",\n    description: "Produk test unlimited",\n    price: 10000,\n    categoryId: 900,\n    subcategoryId: null,\n    imageUrl: "",\n    stockUnit: "PCS",\n    priceUnitQuantity: 1,\n    minimumOrderQuantity: 1,\n    orderStepQuantity: 1,\n    lowStockThreshold: 2,\n    active: true,\n    unlimitedStock: true,\n    ...overrides,\n  };\n}\n\ntest("schema Unlimited Stock V1 tersedia dan default tetap finite", () => {\n  const columns = database.prepare("PRAGMA table_info(products)").all();\n  assert.ok(columns.some((column) => column.name === "unlimited_stock"));\n  const migration = fs.readFileSync(path.resolve("migrations/031_unlimited_stock_v1.sql"), "utf8");\n  assert.match(migration, /unlimited_stock BOOLEAN NOT NULL DEFAULT FALSE/);\n});\n\ntest("Manager dapat menyimpan flag unlimited dan Customer catalog selalu in-stock", async () => {\n  await saveProduct(manager, productInput());\n  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");\n  assert.equal(Number(product.unlimited_stock), 1);\n  assert.equal(Number(product.stock_quantity), 0);\n\n  const catalog = await listCatalog(false);\n  const publicProduct = catalog.products.find((row) => Number(row.id) === Number(product.id));\n  assert.equal(Number(publicProduct.unlimited_stock), 1);\n  assert.equal(Number(publicProduct.in_stock), 1);\n});\n\ntest("produk finite dengan stok nol tetap tidak tersedia", async () => {\n  await saveProduct(manager, productInput({ name: "Produk Finite Test", unlimitedStock: false }));\n  const catalog = await listCatalog(false);\n  const finite = catalog.products.find((row) => row.name === "Produk Finite Test");\n  assert.equal(Number(finite.unlimited_stock), 0);\n  assert.equal(Number(finite.in_stock), 0);\n});\n\ntest("checkout unlimited membuat reservation tetapi commit tidak mengurangi stok dan tetap idempotent", async () => {\n  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");\n  const created = await createOrder(customer, {\n    addressId: 900,\n    fulfillmentType: "DELIVERY",\n    method: "CASH",\n    items: [{ productId: Number(product.id), quantity: 3 }],\n  }, { nowMs: Date.parse("2026-10-23T05:00:00.000Z") });\n\n  const reserved = database.prepare("SELECT * FROM stock_reservations WHERE order_id=?").get(created.id);\n  assert.equal(reserved.status, "RESERVED");\n  assert.equal(Number(reserved.quantity), 3);\n\n  const firstCommit = await store.transaction((tx, mysql) =>\n    commitOrderStock(tx, mysql, created.id, manager.id),\n  );\n  assert.equal(firstCommit, true);\n  assert.equal(Number(database.prepare("SELECT stock_quantity FROM products WHERE id=?").get(product.id).stock_quantity), 0);\n  assert.equal(Number(database.prepare("SELECT COUNT(*) count FROM stock_movements WHERE order_id=? AND product_id=? AND kind='SALE'").get(created.id, product.id).count), 0);\n  assert.equal(database.prepare("SELECT status FROM stock_reservations WHERE order_id=?").get(created.id).status, "COMMITTED");\n\n  const secondCommit = await store.transaction((tx, mysql) =>\n    commitOrderStock(tx, mysql, created.id, manager.id),\n  );\n  assert.equal(secondCommit, false);\n});\n\ntest("stock center menandai unlimited dan penyesuaian stok fisik ditolak", async () => {\n  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");\n  const stock = await listStock(manager);\n  const row = stock.products.find((item) => Number(item.id) === Number(product.id));\n  assert.equal(row.stock_status, "UNLIMITED");\n  await assert.rejects(\n    () => adjustStock(manager, { productId: Number(product.id), quantity: 10, reason: "restock test" }),\n    (error) => error instanceof DomainError && error.status === 409 && /unlimited/i.test(error.message),\n  );\n});\n\ntest("saat unlimited dimatikan, stok fisik tersimpan kembali menjadi authoritative", async () => {\n  const product = database.prepare("SELECT * FROM products WHERE name=?").get("Produk Unlimited Test");\n  await saveProduct(manager, productInput({ id: Number(product.id), unlimitedStock: false }));\n  const saved = database.prepare("SELECT stock_quantity,unlimited_stock FROM products WHERE id=?").get(product.id);\n  assert.equal(Number(saved.unlimited_stock), 0);\n  assert.equal(Number(saved.stock_quantity), 0);\n\n  await assert.rejects(\n    () => createOrder(customer, {\n      addressId: 900,\n      fulfillmentType: "DELIVERY",\n      method: "CASH",\n      items: [{ productId: Number(product.id), quantity: 1 }],\n    }, { nowMs: Date.parse("2026-10-23T05:00:00.000Z") }),\n    (error) => error instanceof DomainError && error.status === 409 && /Stok/.test(error.message),\n  );\n});\n`,
);

// Remove this temporary helper from the final working tree after successful apply.
fs.rmSync(path.join(root, "scripts/apply-unlimited-stock-v1.mjs"), { force: true });
console.log("OK - Unlimited Stock V1 patch applied");
