import sqlite3
import os
import shutil
from datetime import datetime
from flask import current_app, g
from werkzeug.security import generate_password_hash

SCHEMA = '''
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 phone TEXT UNIQUE,
 email TEXT UNIQUE,
 password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('customer','admin','kasir','kitchen','driver','owner')),
 status TEXT NOT NULL DEFAULT 'active',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categories (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 category_id INTEGER,
 name TEXT NOT NULL,
 description TEXT,
 price INTEGER NOT NULL,
 stock INTEGER NOT NULL DEFAULT 0,
 stock_minimum INTEGER NOT NULL DEFAULT 0,
 is_favorite INTEGER NOT NULL DEFAULT 0,
 normal_price INTEGER NOT NULL DEFAULT 0,
 active INTEGER NOT NULL DEFAULT 1,
 FOREIGN KEY(category_id) REFERENCES categories(id)
);
CREATE TABLE IF NOT EXISTS addresses (id INTEGER PRIMARY KEY AUTOINCREMENT, customer_id INTEGER NOT NULL, label TEXT, address TEXT NOT NULL, latitude REAL, longitude REAL, FOREIGN KEY(customer_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS campaigns (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS promotions (id INTEGER PRIMARY KEY AUTOINCREMENT, campaign_id INTEGER, code TEXT UNIQUE, type TEXT NOT NULL DEFAULT 'percent', value INTEGER NOT NULL, min_order INTEGER NOT NULL DEFAULT 0, max_discount INTEGER, quota INTEGER, used_count INTEGER NOT NULL DEFAULT 0, starts_at TEXT, ends_at TEXT, active INTEGER NOT NULL DEFAULT 1, FOREIGN KEY(campaign_id) REFERENCES campaigns(id));
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 order_no TEXT UNIQUE NOT NULL,
 customer_id INTEGER NOT NULL,
 customer_name TEXT NOT NULL,
 customer_phone TEXT NOT NULL,
 address TEXT NOT NULL,
 latitude REAL,
 longitude REAL,
 distance_km REAL,
 delivery_fee INTEGER NOT NULL DEFAULT 0,
 subtotal INTEGER NOT NULL,
 discount INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL,
 payment_method TEXT NOT NULL DEFAULT 'qris_btn',
 payment_status TEXT NOT NULL DEFAULT 'pending',
 status TEXT NOT NULL DEFAULT 'pending_payment',
 promo_id INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(customer_id) REFERENCES users(id), FOREIGN KEY(promo_id) REFERENCES promotions(id)
);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL, product_id INTEGER NOT NULL, name TEXT NOT NULL, qty INTEGER NOT NULL, price INTEGER NOT NULL, notes TEXT, FOREIGN KEY(order_id) REFERENCES orders(id), FOREIGN KEY(product_id) REFERENCES products(id));
CREATE TABLE IF NOT EXISTS drivers (user_id INTEGER PRIMARY KEY, online INTEGER NOT NULL DEFAULT 0, active_trip_id INTEGER, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS delivery_trips (id INTEGER PRIMARY KEY AUTOINCREMENT, driver_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(driver_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS delivery_stops (id INTEGER PRIMARY KEY AUTOINCREMENT, trip_id INTEGER NOT NULL, order_id INTEGER NOT NULL UNIQUE, sequence_no INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'assigned', completed_at TEXT, proof_photo TEXT, FOREIGN KEY(trip_id) REFERENCES delivery_trips(id), FOREIGN KEY(order_id) REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, order_id INTEGER, title TEXT NOT NULL, message TEXT NOT NULL, read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id), FOREIGN KEY(order_id) REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS payments (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE, provider TEXT NOT NULL, reference TEXT, status TEXT NOT NULL DEFAULT 'pending', paid_at TEXT, FOREIGN KEY(order_id) REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS printer_settings (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT, ip_address TEXT, port INTEGER DEFAULT 9100, connection TEXT DEFAULT 'LAN', auto_print INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL UNIQUE, revenue INTEGER NOT NULL, channel TEXT NOT NULL DEFAULT 'delivery', completed_at TEXT, FOREIGN KEY(order_id) REFERENCES orders(id));
CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, action TEXT NOT NULL, entity TEXT, entity_id INTEGER, details TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
'''

def get_db():
    if 'db' not in g:
        g.db = sqlite3.connect(current_app.config['DATABASE'])
        g.db.row_factory = sqlite3.Row
        g.db.execute('PRAGMA foreign_keys=ON')
    return g.db

def close_db(e=None):
    db = g.pop('db', None)
    if db:
        db.close()

def _demo_users():
    return [
        ("Owner", "0800000001", "owner@local", "owner"),
        ("Admin", "0800000002", "admin@local", "admin"),
        ("Kasir", "0800000007", "kasir@local", "kasir"),
        ("Kitchen", "0800000003", "kitchen@local", "kitchen"),
        ("Driver 1", "0800000004", "driver1@local", "driver"),
        ("Driver 2", "0800000005", "driver2@local", "driver"),
        ("Customer Demo", "0800000006", "customer@local", "customer"),
    ]


def _users_support_kasir(db):
    row = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
    sql = (row['sql'] or '').lower() if row else ''
    return "'kasir'" in sql and 'check' in sql


def _rebuild_users_with_kasir(db):
    """Upgrade a legacy users table whose CHECK constraint lacks kasir."""
    if _users_support_kasir(db):
        return
    db.commit()
    db.execute('PRAGMA foreign_keys=OFF')
    try:
        db.execute("""CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phone TEXT UNIQUE,
            email TEXT UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('customer','admin','kasir','kitchen','driver','owner')),
            status TEXT NOT NULL DEFAULT 'active',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )""")
        db.execute("""INSERT INTO users_new(id,name,phone,email,password_hash,role,status,created_at)
                      SELECT id,name,phone,email,password_hash,role,status,created_at FROM users""")
        db.execute('DROP TABLE users')
        db.execute('ALTER TABLE users_new RENAME TO users')
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.execute('PRAGMA foreign_keys=ON')


def _ensure_demo_users(db):
    """Repair documented local demo accounts without duplicating them."""
    for name, phone, email, role in _demo_users():
        existing = db.execute('SELECT id FROM users WHERE email=?', (email,)).fetchone()
        password_hash = generate_password_hash('123456')
        if existing:
            db.execute(
                "UPDATE users SET name=?, role=?, status='active', password_hash=? WHERE id=?",
                (name, role, password_hash, existing['id'])
            )
        else:
            phone_owner = db.execute('SELECT id FROM users WHERE phone=?', (phone,)).fetchone()
            safe_phone = phone if not phone_owner else None
            db.execute(
                "INSERT INTO users(name,phone,email,password_hash,role,status) VALUES(?,?,?,?,?,'active')",
                (name, safe_phone, email, password_hash, role)
            )


def _ensure_demo_drivers(db):
    for row in db.execute("SELECT id FROM users WHERE role='driver'").fetchall():
        db.execute('INSERT OR IGNORE INTO drivers(user_id,online) VALUES(?,0)', (row['id'],))


def _ensure_categories_and_products(db):
    if db.execute('SELECT COUNT(*) FROM categories').fetchone()[0] == 0:
        for c in ('Makanan', 'Minuman'):
            db.execute('INSERT OR IGNORE INTO categories(name) VALUES(?)', (c,))
    if db.execute('SELECT COUNT(*) FROM products').fetchone()[0] == 0:
        makanan = db.execute("SELECT id FROM categories WHERE name='Makanan'").fetchone()
        minuman = db.execute("SELECT id FROM categories WHERE name='Minuman'").fetchone()
        products = [
            (makanan['id'] if makanan else None, 'Nasi Goreng Warkost', 'Nasi goreng spesial', 18000, 20, 3),
            (makanan['id'] if makanan else None, 'Ayam Geprek', 'Ayam geprek sambal', 22000, 15, 3),
            (minuman['id'] if minuman else None, 'Es Teh', 'Teh manis dingin', 6000, 30, 5),
            (minuman['id'] if minuman else None, 'Kopi Susu', 'Kopi susu gula aren', 15000, 20, 4),
        ]
        db.executemany(
            'INSERT INTO products(category_id,name,description,price,stock,stock_minimum,normal_price) VALUES(?,?,?,?,?,?,?)',
            [(*p,p[3]) for p in products]
        )


def _ensure_operational_defaults(db):
    if not db.execute('SELECT 1 FROM printer_settings WHERE id=1').fetchone():
        db.execute("INSERT INTO printer_settings(id,name,ip_address,port,connection,auto_print) VALUES(1,'Epson Thermal','',9100,'LAN',1)")
    settings = [
        ('cafe_latitude', '-6.9218'),
        ('cafe_longitude', '106.9270'),
        ('cafe_location_verified', '0'),
        ('cafe_location_accuracy_m', ''),
        ('delivery_free_radius_km', '5'),
        ('delivery_extra_fee', '5000'),
        ('max_delivery_radius_km', '8'),
        # Legacy tier keys retained for backward compatibility with older UI/data.
        ('delivery_fee_0_3', '5000'),
        ('delivery_fee_3_5', '8000'),
        ('delivery_fee_5_8', '12000'),
    ]
    for key, value in settings:
        db.execute('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)', (key, value))


def migrate_existing(db):
    """Idempotent migration from V0.7/V0.8.x to V0.8.2."""
    cols = {r['name'] for r in db.execute('PRAGMA table_info(products)').fetchall()}
    if cols and 'stock' not in cols:
        db.execute('ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 0')
    if cols and 'stock_minimum' not in cols:
        db.execute('ALTER TABLE products ADD COLUMN stock_minimum INTEGER NOT NULL DEFAULT 0')
    cols = {r['name'] for r in db.execute('PRAGMA table_info(products)').fetchall()}
    if cols and 'is_favorite' not in cols:
        db.execute('ALTER TABLE products ADD COLUMN is_favorite INTEGER NOT NULL DEFAULT 0')
    cols = {r['name'] for r in db.execute('PRAGMA table_info(products)').fetchall()}
    if cols and 'normal_price' not in cols:
        db.execute('ALTER TABLE products ADD COLUMN normal_price INTEGER NOT NULL DEFAULT 0')
    db.execute('UPDATE products SET normal_price=price WHERE normal_price<=0')

    _rebuild_users_with_kasir(db)
    _ensure_demo_users(db)
    _ensure_demo_drivers(db)
    _ensure_categories_and_products(db)
    _ensure_operational_defaults(db)
    # Demo menu promotion: Kopi Susu is 20% off (Rp15.000 -> Rp12.000).
    db.execute("UPDATE products SET normal_price=15000, price=12000 WHERE name='Kopi Susu' AND active=1")
    db.commit()


def seed(db):
    # Safe for both fresh and existing databases.
    migrate_existing(db)

def _backup_legacy_db_if_needed(db_path, instance_path):
    if not os.path.exists(db_path):
        return None
    probe = sqlite3.connect(db_path)
    try:
        row = probe.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
        sql = (row[0] or '').lower() if row else ''
        if not ("'kasir'" not in sql and 'check' in sql):
            return None
        backup_dir = os.path.join(instance_path, 'backups')
        os.makedirs(backup_dir, exist_ok=True)
        stamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_path = os.path.join(backup_dir, f'warkost_pre_v082_{stamp}.db')
        shutil.copy2(db_path, backup_path)
        return backup_path
    finally:
        probe.close()


def init_db(app):
    os.makedirs(app.instance_path, exist_ok=True)
    db_path = app.config['DATABASE']
    _backup_legacy_db_if_needed(db_path, app.instance_path)
    with app.app_context():
        db=get_db(); db.executescript(SCHEMA); migrate_existing(db); seed(db)
    app.teardown_appcontext(close_db)
