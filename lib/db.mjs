import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
let singleton;
export function db() {
  if (!singleton) {
    if (process.env.NODE_ENV === "production" && !process.env.DATABASE_PATH)
      throw Error("DATABASE_PATH wajib disetel pada produksi");
    const file = path.resolve(
      /*turbopackIgnore: true*/ process.env.DATABASE_PATH ||
        "./data/warkost.db",
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    singleton = new DatabaseSync(file);
    singleton.exec(
      "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
    );
    singleton.exec(schema);
    if (
      !singleton
        .prepare("PRAGMA table_info(users)")
        .all()
        .some((c) => c.name === "active")
    )
      singleton.exec(
        "ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
      );
    const usersSql = singleton
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='users'",
      )
      .get()?.sql;
    if (usersSql && !usersSql.includes("'KITCHEN'")) {
      singleton.exec("PRAGMA foreign_keys=OFF");
      try {
        singleton.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE users_role_upgrade(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('CUSTOMER','ADMIN','DRIVER','KITCHEN','OWNER')), created_at TEXT DEFAULT CURRENT_TIMESTAMP, active INTEGER NOT NULL DEFAULT 1);
          INSERT INTO users_role_upgrade(id,name,email,password_hash,role,created_at,active) SELECT id,name,email,password_hash,role,created_at,active FROM users;
          DROP TABLE users;
          ALTER TABLE users_role_upgrade RENAME TO users;
          COMMIT;
        `);
      } catch (error) {
        try {
          singleton.exec("ROLLBACK");
        } catch {}
        throw error;
      } finally {
        singleton.exec("PRAGMA foreign_keys=ON");
      }
    }
    singleton.exec(
      "CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role,active)",
    );
    if (
      !singleton
        .prepare("PRAGMA table_info(addresses)")
        .all()
        .some((c) => c.name === "active")
    )
      singleton.exec(
        "ALTER TABLE addresses ADD COLUMN active INTEGER NOT NULL DEFAULT 1",
      );
    singleton.exec(
      "CREATE INDEX IF NOT EXISTS idx_address_user_active ON addresses(user_id,active)",
    );
    if (
      !singleton
        .prepare("PRAGMA table_info(payments)")
        .all()
        .some((c) => c.name === "paid_at")
    )
      singleton.exec("ALTER TABLE payments ADD COLUMN paid_at TEXT");
    singleton.exec(
      "CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(status,paid_at)",
    );
    for (const column of ["checkout_key", "checkout_fingerprint"])
      if (
        !singleton
          .prepare("PRAGMA table_info(orders)")
          .all()
          .some((c) => c.name === column)
      )
        singleton.exec(`ALTER TABLE orders ADD COLUMN ${column} TEXT`);
    singleton.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_customer_checkout ON orders(customer_id,checkout_key)",
    );
    const ensureColumn = (table, column, definition) => {
      if (
        !singleton
          .prepare(`PRAGMA table_info(${table})`)
          .all()
          .some((item) => item.name === column)
      )
        singleton.exec(
          `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`,
        );
    };
    const productStationMissing = !singleton
      .prepare("PRAGMA table_info(products)")
      .all()
      .some((item) => item.name === "prep_station");
    const orderStationMissing = !singleton
      .prepare("PRAGMA table_info(order_items)")
      .all()
      .some((item) => item.name === "prep_station");
    ensureColumn(
      "products",
      "prep_station",
      "TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER'))",
    );
    ensureColumn(
      "products",
      "stock_quantity",
      "INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0)",
    );
    ensureColumn(
      "order_items",
      "prep_station",
      "TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER'))",
    );
    if (productStationMissing)
      singleton.exec(
        "UPDATE products SET prep_station='CASHIER' WHERE category_id IN (SELECT id FROM categories WHERE LOWER(name) LIKE '%minum%' OR LOWER(name) LIKE '%drink%' OR LOWER(name) LIKE '%kopi%')",
      );
    if (orderStationMissing)
      singleton.exec(
        "UPDATE order_items SET prep_station=(SELECT prep_station FROM products WHERE products.id=order_items.product_id)",
      );
    singleton.exec(`
      CREATE TABLE IF NOT EXISTS order_stations(
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        station TEXT NOT NULL CHECK(station IN('KITCHEN','CASHIER')),
        status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','PREPARING','READY')),
        started_by INTEGER REFERENCES users(id),
        ready_by INTEGER REFERENCES users(id),
        started_at TEXT,
        ready_at TEXT,
        UNIQUE(order_id,station)
      );
      CREATE TABLE IF NOT EXISTS stock_movements(
        id INTEGER PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES products(id),
        actor_id INTEGER REFERENCES users(id),
        order_id INTEGER REFERENCES orders(id),
        kind TEXT NOT NULL CHECK(kind IN('STOCK_IN','ADJUSTMENT','SALE','RESTORE')),
        quantity_delta INTEGER NOT NULL CHECK(quantity_delta!=0),
        balance_after INTEGER NOT NULL CHECK(balance_after>=0),
        reason TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_order_kind_product ON stock_movements(order_id,kind,product_id) WHERE order_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_stock_product_date ON stock_movements(product_id,created_at,id);
      CREATE INDEX IF NOT EXISTS idx_order_stations_station_status ON order_stations(station,status,order_id);
    `);
  }
  return singleton;
}
const schema = `
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('CUSTOMER','ADMIN','DRIVER','KITCHEN','OWNER')), created_at TEXT DEFAULT CURRENT_TIMESTAMP, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts(attempt_key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>=0), window_until INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_window ON auth_attempts(window_until);
CREATE TABLE IF NOT EXISTS media_assets(id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, bytes_size INTEGER NOT NULL, uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id), name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL CHECK(price>=0), image_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, prep_station TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER')), stock_quantity INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS addresses(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), address_id INTEGER NOT NULL REFERENCES addresses(id), status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','CONFIRMED','PREPARING','READY','ASSIGNED','PICKED_UP','ON_DELIVERY','DELIVERED','CANCELLED')), total INTEGER NOT NULL CHECK(total>=0), checkout_key TEXT, checkout_fingerprint TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), prep_station TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER')));
CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), driver_id INTEGER NOT NULL REFERENCES users(id), accepted_at TEXT, delivered_at TEXT);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), method TEXT NOT NULL CHECK(method IN('CASH','BANK_TRANSFER')), status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN('UNPAID','PENDING','PAID','FAILED','CANCELLED','REFUNDED')), verified_by INTEGER REFERENCES users(id), paid_at TEXT);
CREATE TABLE IF NOT EXISTS loyalty_accounts(user_id INTEGER PRIMARY KEY REFERENCES users(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
CREATE TABLE IF NOT EXISTS loyalty_transactions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER UNIQUE REFERENCES orders(id), kind TEXT NOT NULL CHECK(kind IN('EARN','REDEEM')), amount INTEGER NOT NULL, balance_after INTEGER NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), actor_id INTEGER NOT NULL REFERENCES users(id), previous_status TEXT, next_status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, details TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_stations(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), station TEXT NOT NULL CHECK(station IN('KITCHEN','CASHIER')), status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','PREPARING','READY')), started_by INTEGER REFERENCES users(id), ready_by INTEGER REFERENCES users(id), started_at TEXT, ready_at TEXT, UNIQUE(order_id,station));
CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), actor_id INTEGER REFERENCES users(id), order_id INTEGER REFERENCES orders(id), kind TEXT NOT NULL CHECK(kind IN('STOCK_IN','ADJUSTMENT','SALE','RESTORE')), quantity_delta INTEGER NOT NULL CHECK(quantity_delta!=0), balance_after INTEGER NOT NULL CHECK(balance_after>=0), reason TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_orders_customer_date ON orders(customer_id,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders(status,created_at);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at,id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON products(category_id,active);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_date ON notifications(user_id,read_at,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_order_kind_product ON stock_movements(order_id,kind,product_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_product_date ON stock_movements(product_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_order_stations_station_status ON order_stations(station,status,order_id);
`;
