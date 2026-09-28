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
