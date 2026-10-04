import * as store from "../lib/store.mjs";
import { hashPassword } from "../lib/auth.mjs";
const demo = process.env.SEED_DEMO_PASSWORD;
if (process.env.NODE_ENV === "production")
  throw Error("Seed demo tidak boleh dijalankan di production");
if (!demo || demo.length < 10)
  throw Error("Set SEED_DEMO_PASSWORD minimal 10 karakter");

async function seed() {
  await store.run(
    "INSERT OR IGNORE INTO settings(`key`,value) VALUES(?,?)",
    "brand_name",
    "Warkost Bahagia",
  );
  await store.run(
    "INSERT OR IGNORE INTO settings(`key`,value) VALUES(?,?)",
    "rupiah_per_point",
    "10000",
  );
  for (const [key, value] of [
    ["business_whatsapp", "6281546407856"],
    ["business_latitude", "-6.9217"],
    ["business_longitude", "106.9272"],
    ["delivery_free_km", "5"],
    ["delivery_fee_per_km", "2500"],
  ["delivery_max_km", "15"],
  ["payment_expiry_minutes", "15"],
    ["printer_simulation", "true"],
    ["printer_admin", "LAN 80mm Admin (simulasi)"],
    ["printer_kitchen", "LAN 80mm Kitchen (simulasi)"],
  ])
    await store.run(
      "INSERT OR IGNORE INTO settings(`key`,value) VALUES(?,?)",
      key,
      value,
    );
  for (const [email, name, role] of [
    ["admin@warkost.local", "Admin Warkost", "ADMIN"],
    ["kitchen@warkost.local", "Kitchen Warkost", "KITCHEN"],
    ["owner@warkost.local", "Owner Warkost", "OWNER"],
    ["driver@warkost.local", "Driver Warkost", "DRIVER"],
    ["customer@warkost.local", "Pelanggan Demo", "CUSTOMER"],
  ])
    await store.run(
      "INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      name,
      email,
      hashPassword(demo),
      role,
    );
  await store.run(
    "UPDATE users SET phone=? WHERE role='DRIVER' AND phone IS NULL",
    "6281546407856",
  );
  const admin = await store.get(
    "SELECT id FROM users WHERE email='admin@warkost.local'",
  );
  const owner = await store.get(
    "SELECT id FROM users WHERE email='owner@warkost.local'",
  );
  for (const rule of [
    ["Hemat 30%", 20, "PERCENT", 30, 30000, 20000],
    ["Potongan Rp10.000", 15, "FIXED", 10000, 25000, null],
  ])
    await store.run(
      "INSERT OR IGNORE INTO loyalty_reward_rules(name,points_required,reward_type,reward_value,minimum_order,maximum_discount,active,created_by,updated_by) SELECT ?,?,?,?,?,?,1,?,? WHERE NOT EXISTS (SELECT 1 FROM loyalty_reward_rules WHERE name=?)",
      ...rule,
      owner.id,
      owner.id,
      rule[0],
    );
  if (
    !(await store.get(
      "SELECT id FROM promotions WHERE title=?",
      "Gratis Ongkir 5 KM",
    ))
  ) {
    const startsAt = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      endsAt = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    await store.run(
      "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?)",
      "Gratis Ongkir 5 KM",
      "Pesan menu favoritmu dan nikmati gratis ongkir untuk alamat dalam radius 5 km.",
      "PROMO BERLANGSUNG",
      "Berlaku untuk alamat yang terverifikasi dalam radius maksimal 5 km.",
      "Pilih Menu",
      startsAt,
      endsAt,
      1,
      admin.id,
      admin.id,
    );
  }
  if (
    !(await store.get(
      "SELECT id FROM promotions WHERE title=?",
      "Voucher Hemat 10%",
    ))
  ) {
    const startsAt = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      endsAt = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    await store.run(
      "INSERT INTO promotions(title,description,badge,terms,cta_label,starts_at,ends_at,active,voucher_type,discount_value,minimum_order,max_discount,quota,one_per_customer,created_by,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)",
      "Voucher Hemat 10%",
      "Klaim voucher dan hemat 10% untuk satu kali pesanan.",
      "VOUCHER CUSTOMER",
      "Minimum belanja Rp30.000, maksimal diskon Rp15.000, satu kali per customer.",
      "Klaim Voucher",
      startsAt,
      endsAt,
      1,
      "PERCENT",
      10,
      30000,
      15000,
      100,
      admin.id,
      admin.id,
    );
  }
  for (const name of ["Makanan", "Minuman"])
    await store.run("INSERT OR IGNORE INTO categories(name) VALUES(?)", name);
  if ((await store.get("SELECT COUNT(*) n FROM products")).n === 0) {
    const food = (
        await store.get("SELECT id FROM categories WHERE name=?", "Makanan")
      ).id,
      drink = (
        await store.get("SELECT id FROM categories WHERE name=?", "Minuman")
      ).id;
    for (const [name, description, price, category, station] of [
      [
        "Nasi Goreng Warkost",
        "Nasi goreng hangat dengan telur dan kerupuk",
        25000,
        food,
        "KITCHEN",
      ],
      [
        "Mie Ayam Bahagia",
        "Mie ayam gurih dengan sayuran segar",
        22000,
        food,
        "KITCHEN",
      ],
      [
        "Kopi Susu Rumah",
        "Espresso, susu, dan gula aren",
        18000,
        drink,
        "CASHIER",
      ],
    ])
      await store.run(
        "INSERT INTO products(name,description,price,category_id,prep_station,stock_quantity) VALUES(?,?,?,?,?,50)",
        name,
        description,
        price,
        category,
        station,
      );
  }
  const customer = await store.get(
    "SELECT id FROM users WHERE email='customer@warkost.local'",
  );
  if (
    !(await store.get("SELECT id FROM addresses WHERE user_id=?", customer.id))
  )
    await store.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude) VALUES(?,?,?,?,?)",
      customer.id,
      "Rumah",
      "Jl. Ahmad Yani No. 12, Sukabumi",
      -6.9217,
      106.9272,
    );
}

try {
  await seed();
  console.log(
    "Seed siap: owner, admin, kitchen, driver, dan customer @warkost.local",
  );
} finally {
  await store.close();
}
