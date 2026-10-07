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
    const userColumns = new Set(
      singleton
        .prepare("PRAGMA table_info(users)")
        .all()
        .map((item) => item.name),
    );
    const legacyCashiers = singleton
      .prepare(
        "SELECT id,role FROM users WHERE UPPER(role) IN ('CASHIER','KASIR')",
      )
      .all();
    if (
      usersSql &&
      (!usersSql.includes("'MANAGER'") || legacyCashiers.length > 0)
    ) {
      const existing = (column, fallback = "NULL") =>
        userColumns.has(column) ? column : fallback;
      singleton.exec("PRAGMA foreign_keys=OFF");
      try {
        singleton.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE users_role_upgrade(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('OWNER','MANAGER','ADMIN','KITCHEN','DRIVER','CUSTOMER')), phone TEXT UNIQUE, birth_date TEXT, terms_accepted_at TEXT, email_verified_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, active INTEGER NOT NULL DEFAULT 1);
          INSERT INTO users_role_upgrade(id,name,email,password_hash,role,phone,birth_date,terms_accepted_at,email_verified_at,created_at,active)
          SELECT id,name,email,password_hash,
            CASE WHEN UPPER(role) IN('CASHIER','KASIR') THEN 'ADMIN' ELSE UPPER(role) END,
            ${existing("phone")},${existing("birth_date")},${existing("terms_accepted_at")},${existing("email_verified_at", "CASE WHEN UPPER(role)='CUSTOMER' AND active=1 THEN COALESCE(created_at,CURRENT_TIMESTAMP) ELSE NULL END")},${existing("created_at", "CURRENT_TIMESTAMP")},${existing("active", "1")}
          FROM users;
          DROP TABLE users;
          ALTER TABLE users_role_upgrade RENAME TO users;
          COMMIT;
        `);
        for (const cashier of legacyCashiers)
          singleton
            .prepare(
              "INSERT INTO audit_logs(actor_id,action,details) VALUES(NULL,'LEGACY_CASHIER_MIGRATED',?)",
            )
            .run(
              JSON.stringify({
                userId: cashier.id,
                previousRole: cashier.role,
                role: "ADMIN",
              }),
            );
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
    singleton.exec(`
      CREATE TABLE IF NOT EXISTS loyalty_reward_rules(
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        points_required INTEGER NOT NULL CHECK(points_required>0),
        reward_type TEXT NOT NULL CHECK(reward_type IN('PERCENT','FIXED')),
        reward_value INTEGER NOT NULL CHECK(reward_value>0),
        minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order>=0),
        maximum_discount INTEGER CHECK(maximum_discount IS NULL OR maximum_discount>=0),
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
        created_by INTEGER NOT NULL REFERENCES users(id),
        updated_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
    ensureColumn("users", "phone", "TEXT");
    ensureColumn("users", "birth_date", "TEXT");
    ensureColumn("users", "terms_accepted_at", "TEXT");
    const emailVerifiedMissing = !singleton
      .prepare("PRAGMA table_info(users)")
      .all()
      .some((item) => item.name === "email_verified_at");
    ensureColumn("users", "email_verified_at", "TEXT");
    if (emailVerifiedMissing)
      singleton.exec(
        "UPDATE users SET email_verified_at=COALESCE(created_at,CURRENT_TIMESTAMP) WHERE role='CUSTOMER' AND active=1",
      );
    singleton.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL",
    );
    ensureColumn("addresses", "latitude", "REAL");
    ensureColumn("addresses", "longitude", "REAL");
    const addressDefaultMissing = !singleton
      .prepare("PRAGMA table_info(addresses)")
      .all()
      .some((item) => item.name === "is_default");
    ensureColumn(
      "addresses",
      "is_default",
      "INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN(0,1))",
    );
    if (addressDefaultMissing)
      singleton.exec(
        "UPDATE addresses SET is_default=1 WHERE id IN (SELECT MAX(id) FROM addresses WHERE active=1 GROUP BY user_id)",
      );
    singleton.exec(
      "CREATE INDEX IF NOT EXISTS idx_address_user_default ON addresses(user_id,active,is_default)",
    );
    singleton.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_address_one_default ON addresses(user_id) WHERE active=1 AND is_default=1",
    );
    ensureColumn("orders", "subtotal", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("orders", "delivery_fee", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("orders", "distance_meters", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("orders", "driver_delay_notice", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("orders", "promotion_id", "INTEGER REFERENCES promotions(id)");
    ensureColumn(
      "orders",
      "promo_claim_id",
      "INTEGER REFERENCES promo_claims(id)",
    );
    ensureColumn("orders", "voucher_discount", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(
      "orders",
      "loyalty_reward_rule_id",
      "INTEGER REFERENCES loyalty_reward_rules(id)",
    );
    ensureColumn(
      "orders",
      "loyalty_points_redeemed",
      "INTEGER NOT NULL DEFAULT 0",
    );
    ensureColumn("orders", "loyalty_discount", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("payments", "expires_at", "TEXT");
    ensureColumn("promotions", "voucher_type", "TEXT");
    ensureColumn("promotions", "discount_value", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("promotions", "minimum_order", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn("promotions", "max_discount", "INTEGER");
    ensureColumn("promotions", "quota", "INTEGER");
    ensureColumn("promotions", "used_count", "INTEGER NOT NULL DEFAULT 0");
    ensureColumn(
      "promotions",
      "one_per_customer",
      "INTEGER NOT NULL DEFAULT 1",
    );
    singleton.exec(
      "UPDATE orders SET subtotal=total WHERE subtotal=0 AND total>0",
    );
    const paymentsSql = singleton
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='payments'",
      )
      .get()?.sql;
    const paymentColumns = singleton
      .prepare("PRAGMA table_info(payments)")
      .all()
      .map((item) => item.name);
    if (
      paymentsSql &&
      (!paymentsSql.includes("'EXPIRED'") ||
        !paymentsSql.includes("'QRIS'") ||
        !paymentColumns.includes("amount") ||
        !paymentColumns.includes("transaction_reference"))
    ) {
      singleton.exec("PRAGMA foreign_keys=OFF");
      try {
        singleton.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE payments_status_upgrade(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), method TEXT NOT NULL CHECK(method IN('CASH','BANK_TRANSFER','QRIS')), status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN('UNPAID','PENDING','PAID','FAILED','EXPIRED','CANCELLED','REFUNDED')), amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0), provider TEXT, provider_reference TEXT, transaction_reference TEXT UNIQUE, qr_payload TEXT, payment_url TEXT, verified_by INTEGER REFERENCES users(id), paid_at TEXT, failed_at TEXT, expired_at TEXT, expires_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
          INSERT INTO payments_status_upgrade(id,order_id,method,status,amount,verified_by,paid_at,expires_at)
            SELECT p.id,p.order_id,p.method,p.status,o.total,p.verified_by,p.paid_at,p.expires_at FROM payments p JOIN orders o ON o.id=p.order_id;
          DROP TABLE payments;
          ALTER TABLE payments_status_upgrade RENAME TO payments;
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
      "CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(status,paid_at)",
    );
    singleton.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider,provider_reference) WHERE provider_reference IS NOT NULL;
      CREATE TABLE IF NOT EXISTS payment_provider_events(id INTEGER PRIMARY KEY,provider TEXT NOT NULL,event_id TEXT NOT NULL,payment_id INTEGER REFERENCES payments(id),event_type TEXT NOT NULL,payload_hash TEXT NOT NULL,received_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(provider,event_id));
      CREATE TABLE IF NOT EXISTS cod_settlements(
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id),
        driver_id INTEGER NOT NULL REFERENCES users(id),
        expected_amount INTEGER NOT NULL CHECK(expected_amount>=0),
        cash_amount INTEGER CHECK(cash_amount IS NULL OR cash_amount>=0),
        evidence_reference TEXT,
        submitted_at TEXT,
        admin_verifier_id INTEGER REFERENCES users(id),
        verified_at TEXT,
        status TEXT NOT NULL DEFAULT 'AWAITING_COD_SETTLEMENT' CHECK(status IN('AWAITING_COD_SETTLEMENT','SUBMITTED','NEEDS_REVIEW','VERIFIED')),
        discrepancy_amount INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS stock_reservations(id INTEGER PRIMARY KEY,order_id INTEGER NOT NULL REFERENCES orders(id),product_id INTEGER NOT NULL REFERENCES products(id),quantity INTEGER NOT NULL CHECK(quantity>0),status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN('RESERVED','COMMITTED','RELEASED')),expires_at TEXT NOT NULL,committed_at TEXT,released_at TEXT,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(order_id,product_id));
      CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_provider_events(payment_id,received_at,id);
      CREATE INDEX IF NOT EXISTS idx_cod_settlements_driver_status ON cod_settlements(driver_id,status,id);
      CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_status ON stock_reservations(product_id,status,expires_at);
    `);
    singleton.exec(`
      INSERT OR IGNORE INTO cod_settlements(order_id,driver_id,expected_amount)
      SELECT o.id,d.driver_id,p.amount
      FROM orders o
      JOIN deliveries d ON d.order_id=o.id
      JOIN payments p ON p.order_id=o.id
      WHERE o.status='DELIVERED' AND p.method='CASH' AND p.status IN('UNPAID','PENDING');
    `);
    const loyaltySql = singleton
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='loyalty_transactions'",
      )
      .get()?.sql;
    if (
      loyaltySql &&
      (!loyaltySql.includes("'RESTORE'") ||
        !singleton
          .prepare("PRAGMA table_info(loyalty_transactions)")
          .all()
          .some((item) => item.name === "reward_rule_id"))
    ) {
      singleton.exec("PRAGMA foreign_keys=OFF");
      try {
        singleton.exec(`
          BEGIN IMMEDIATE;
          CREATE TABLE loyalty_transactions_upgrade(
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            order_id INTEGER NOT NULL REFERENCES orders(id),
            reward_rule_id INTEGER REFERENCES loyalty_reward_rules(id),
            kind TEXT NOT NULL CHECK(kind IN('EARN','REDEEM','RESTORE')),
            amount INTEGER NOT NULL CHECK(amount!=0),
            balance_after INTEGER NOT NULL CHECK(balance_after>=0),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(order_id,kind)
          );
          INSERT INTO loyalty_transactions_upgrade(id,user_id,order_id,kind,amount,balance_after,created_at)
            SELECT id,user_id,order_id,kind,amount,balance_after,created_at FROM loyalty_transactions;
          DROP TABLE loyalty_transactions;
          ALTER TABLE loyalty_transactions_upgrade RENAME TO loyalty_transactions;
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
      "CREATE INDEX IF NOT EXISTS idx_loyalty_user_date ON loyalty_transactions(user_id,created_at,id)",
    );
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
      CREATE TABLE IF NOT EXISTS print_jobs(
        id INTEGER PRIMARY KEY,
        order_id INTEGER NOT NULL REFERENCES orders(id),
        station TEXT NOT NULL CHECK(station IN('ADMIN','KITCHEN')),
        status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','PRINTED','FAILED','REPRINTED')),
        printer_key TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
        reprint_count INTEGER NOT NULL DEFAULT 0 CHECK(reprint_count>=0),
        payload_json TEXT NOT NULL,
        error_message TEXT,
        requested_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        printed_at TEXT,
        UNIQUE(order_id,station)
      );
      CREATE TABLE IF NOT EXISTS promotions(
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        badge TEXT NOT NULL,
        terms TEXT NOT NULL,
        cta_label TEXT NOT NULL,
        image_url TEXT NOT NULL DEFAULT '',
        starts_at TEXT NOT NULL,
        ends_at TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)),
        created_by INTEGER NOT NULL REFERENCES users(id),
        updated_by INTEGER NOT NULL REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        CHECK(ends_at>starts_at)
      );
      CREATE TABLE IF NOT EXISTS promo_claims(
        id INTEGER PRIMARY KEY,
        promotion_id INTEGER NOT NULL REFERENCES promotions(id),
        customer_id INTEGER NOT NULL REFERENCES users(id),
        state TEXT NOT NULL DEFAULT 'CLAIMED' CHECK(state IN('CLAIMED','USED')),
        order_id INTEGER UNIQUE REFERENCES orders(id),
        claimed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        used_at TEXT,
        UNIQUE(promotion_id,customer_id)
      );
      CREATE TABLE IF NOT EXISTS otp_challenges(
        id INTEGER PRIMARY KEY,
        public_id TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL REFERENCES users(id),
        purpose TEXT NOT NULL CHECK(purpose IN('REGISTRATION','PASSWORD_RESET')),
        otp_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5),
        consumed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        last_sent_at INTEGER NOT NULL,
        verified_at TEXT,
        reset_token_hash TEXT UNIQUE,
        reset_expires_at INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_order_kind_product ON stock_movements(order_id,kind,product_id) WHERE order_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_stock_product_date ON stock_movements(product_id,created_at,id);
      CREATE INDEX IF NOT EXISTS idx_order_stations_station_status ON order_stations(station,status,order_id);
      CREATE INDEX IF NOT EXISTS idx_print_jobs_station_status ON print_jobs(station,status,id);
      CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(active,starts_at,ends_at,id);
      CREATE INDEX IF NOT EXISTS idx_promo_claims_customer_state ON promo_claims(customer_id,state,promotion_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_promo_claim ON orders(promo_claim_id) WHERE promo_claim_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_otp_user_purpose ON otp_challenges(user_id,purpose,consumed_at,id);
      CREATE INDEX IF NOT EXISTS idx_otp_expiry ON otp_challenges(expires_at,consumed_at);
    `);
  }
  return singleton;
}
const schema = `
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN('OWNER','MANAGER','ADMIN','KITCHEN','DRIVER','CUSTOMER')), phone TEXT UNIQUE, birth_date TEXT, terms_accepted_at TEXT, email_verified_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL, revoked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS auth_attempts(attempt_key TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK(count>=0), window_until INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_auth_attempts_window ON auth_attempts(window_until);
CREATE TABLE IF NOT EXISTS otp_challenges(id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, user_id INTEGER NOT NULL REFERENCES users(id), purpose TEXT NOT NULL CHECK(purpose IN('REGISTRATION','PASSWORD_RESET')), otp_hash TEXT NOT NULL, expires_at INTEGER NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0 AND attempts<=5), consumed_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, last_sent_at INTEGER NOT NULL, verified_at TEXT, reset_token_hash TEXT UNIQUE, reset_expires_at INTEGER);
CREATE INDEX IF NOT EXISTS idx_otp_user_purpose ON otp_challenges(user_id,purpose,consumed_at,id);
CREATE INDEX IF NOT EXISTS idx_otp_expiry ON otp_challenges(expires_at,consumed_at);
CREATE TABLE IF NOT EXISTS media_assets(id TEXT PRIMARY KEY, filename TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, bytes_size INTEGER NOT NULL, uploaded_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, category_id INTEGER NOT NULL REFERENCES categories(id), name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL CHECK(price>=0), image_url TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1, prep_station TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER')), stock_quantity INTEGER NOT NULL DEFAULT 100 CHECK(stock_quantity>=0), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS addresses(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT NOT NULL, detail TEXT NOT NULL, latitude REAL NOT NULL DEFAULT -6.9217, longitude REAL NOT NULL DEFAULT 106.9272, is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN(0,1)), created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS loyalty_reward_rules(id INTEGER PRIMARY KEY, name TEXT NOT NULL, points_required INTEGER NOT NULL CHECK(points_required>0), reward_type TEXT NOT NULL CHECK(reward_type IN('PERCENT','FIXED')), reward_value INTEGER NOT NULL CHECK(reward_value>0), minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order>=0), maximum_discount INTEGER CHECK(maximum_discount IS NULL OR maximum_discount>=0), active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, customer_id INTEGER NOT NULL REFERENCES users(id), address_id INTEGER NOT NULL REFERENCES addresses(id), status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN('PENDING','CONFIRMED','PREPARING','READY','ASSIGNED','PICKED_UP','ON_DELIVERY','DELIVERED','CANCELLED')), subtotal INTEGER NOT NULL DEFAULT 0 CHECK(subtotal>=0), delivery_fee INTEGER NOT NULL DEFAULT 0 CHECK(delivery_fee>=0), distance_meters INTEGER NOT NULL DEFAULT 0 CHECK(distance_meters>=0), driver_delay_notice INTEGER NOT NULL DEFAULT 0 CHECK(driver_delay_notice IN(0,1)), promotion_id INTEGER REFERENCES promotions(id), promo_claim_id INTEGER REFERENCES promo_claims(id), voucher_discount INTEGER NOT NULL DEFAULT 0 CHECK(voucher_discount>=0), loyalty_reward_rule_id INTEGER REFERENCES loyalty_reward_rules(id), loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0 CHECK(loyalty_points_redeemed>=0), loyalty_discount INTEGER NOT NULL DEFAULT 0 CHECK(loyalty_discount>=0), total INTEGER NOT NULL CHECK(total>=0), checkout_key TEXT, checkout_fingerprint TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), name TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), prep_station TEXT NOT NULL DEFAULT 'KITCHEN' CHECK(prep_station IN('KITCHEN','CASHIER')));
CREATE TABLE IF NOT EXISTS deliveries(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), driver_id INTEGER NOT NULL REFERENCES users(id), accepted_at TEXT, delivered_at TEXT);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), method TEXT NOT NULL CHECK(method IN('CASH','BANK_TRANSFER','QRIS')), status TEXT NOT NULL DEFAULT 'UNPAID' CHECK(status IN('UNPAID','PENDING','PAID','FAILED','EXPIRED','CANCELLED','REFUNDED')), amount INTEGER NOT NULL DEFAULT 0 CHECK(amount>=0), provider TEXT, provider_reference TEXT, transaction_reference TEXT UNIQUE, qr_payload TEXT, payment_url TEXT, verified_by INTEGER REFERENCES users(id), paid_at TEXT, failed_at TEXT, expired_at TEXT, expires_at TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cod_settlements(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id), driver_id INTEGER NOT NULL REFERENCES users(id), expected_amount INTEGER NOT NULL CHECK(expected_amount>=0), cash_amount INTEGER CHECK(cash_amount IS NULL OR cash_amount>=0), evidence_reference TEXT, submitted_at TEXT, admin_verifier_id INTEGER REFERENCES users(id), verified_at TEXT, status TEXT NOT NULL DEFAULT 'AWAITING_COD_SETTLEMENT' CHECK(status IN('AWAITING_COD_SETTLEMENT','SUBMITTED','NEEDS_REVIEW','VERIFIED')), discrepancy_amount INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS payment_provider_events(id INTEGER PRIMARY KEY, provider TEXT NOT NULL, event_id TEXT NOT NULL, payment_id INTEGER REFERENCES payments(id), event_type TEXT NOT NULL, payload_hash TEXT NOT NULL, received_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(provider,event_id));
CREATE TABLE IF NOT EXISTS stock_reservations(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), status TEXT NOT NULL DEFAULT 'RESERVED' CHECK(status IN('RESERVED','COMMITTED','RELEASED')), expires_at TEXT NOT NULL, committed_at TEXT, released_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id,product_id));
CREATE TABLE IF NOT EXISTS loyalty_accounts(user_id INTEGER PRIMARY KEY REFERENCES users(id), balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0));
CREATE TABLE IF NOT EXISTS loyalty_transactions(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), order_id INTEGER NOT NULL REFERENCES orders(id), reward_rule_id INTEGER REFERENCES loyalty_reward_rules(id), kind TEXT NOT NULL CHECK(kind IN('EARN','REDEEM','RESTORE')), amount INTEGER NOT NULL CHECK(amount!=0), balance_after INTEGER NOT NULL CHECK(balance_after>=0), created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE(order_id,kind));
CREATE TABLE IF NOT EXISTS order_events(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), actor_id INTEGER NOT NULL REFERENCES users(id), previous_status TEXT, next_status TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit_logs(id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES users(id), action TEXT NOT NULL, details TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), message TEXT NOT NULL, read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_stations(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), station TEXT NOT NULL CHECK(station IN('KITCHEN','CASHIER')), status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','PREPARING','READY')), started_by INTEGER REFERENCES users(id), ready_by INTEGER REFERENCES users(id), started_at TEXT, ready_at TEXT, UNIQUE(order_id,station));
CREATE TABLE IF NOT EXISTS stock_movements(id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), actor_id INTEGER REFERENCES users(id), order_id INTEGER REFERENCES orders(id), kind TEXT NOT NULL CHECK(kind IN('STOCK_IN','ADJUSTMENT','SALE','RESTORE')), quantity_delta INTEGER NOT NULL CHECK(quantity_delta!=0), balance_after INTEGER NOT NULL CHECK(balance_after>=0), reason TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS print_jobs(id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), station TEXT NOT NULL CHECK(station IN('ADMIN','KITCHEN')), status TEXT NOT NULL DEFAULT 'QUEUED' CHECK(status IN('QUEUED','PRINTED','FAILED','REPRINTED')), printer_key TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0), reprint_count INTEGER NOT NULL DEFAULT 0 CHECK(reprint_count>=0), payload_json TEXT NOT NULL, error_message TEXT, requested_by INTEGER REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, printed_at TEXT, UNIQUE(order_id,station));
CREATE TABLE IF NOT EXISTS promotions(id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, badge TEXT NOT NULL, terms TEXT NOT NULL, cta_label TEXT NOT NULL, image_url TEXT NOT NULL DEFAULT '', starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN(0,1)), voucher_type TEXT CHECK(voucher_type IN('PERCENT','FIXED') OR voucher_type IS NULL), discount_value INTEGER NOT NULL DEFAULT 0 CHECK(discount_value>=0), minimum_order INTEGER NOT NULL DEFAULT 0 CHECK(minimum_order>=0), max_discount INTEGER CHECK(max_discount IS NULL OR max_discount>=0), quota INTEGER CHECK(quota IS NULL OR quota>=0), used_count INTEGER NOT NULL DEFAULT 0 CHECK(used_count>=0), one_per_customer INTEGER NOT NULL DEFAULT 1 CHECK(one_per_customer IN(0,1)), created_by INTEGER NOT NULL REFERENCES users(id), updated_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP, updated_at TEXT DEFAULT CURRENT_TIMESTAMP, CHECK(ends_at>starts_at));
CREATE TABLE IF NOT EXISTS promo_claims(id INTEGER PRIMARY KEY, promotion_id INTEGER NOT NULL REFERENCES promotions(id), customer_id INTEGER NOT NULL REFERENCES users(id), state TEXT NOT NULL DEFAULT 'CLAIMED' CHECK(state IN('CLAIMED','USED')), order_id INTEGER UNIQUE REFERENCES orders(id), claimed_at TEXT DEFAULT CURRENT_TIMESTAMP, used_at TEXT, UNIQUE(promotion_id,customer_id));
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
CREATE INDEX IF NOT EXISTS idx_print_jobs_station_status ON print_jobs(station,status,id);
CREATE INDEX IF NOT EXISTS idx_promotions_active_window ON promotions(active,starts_at,ends_at,id);
CREATE INDEX IF NOT EXISTS idx_promo_claims_customer_state ON promo_claims(customer_id,state,promotion_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_promo_claim ON orders(promo_claim_id) WHERE promo_claim_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loyalty_user_date ON loyalty_transactions(user_id,created_at,id);
CREATE INDEX IF NOT EXISTS idx_loyalty_rules_active_points ON loyalty_reward_rules(active,points_required,id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_provider_reference ON payments(provider,provider_reference) WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_events_payment ON payment_provider_events(payment_id,received_at,id);
CREATE INDEX IF NOT EXISTS idx_cod_settlements_driver_status ON cod_settlements(driver_id,status,id);
CREATE INDEX IF NOT EXISTS idx_stock_reservations_product_status ON stock_reservations(product_id,status,expires_at);
`;
