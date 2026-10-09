import * as store from "../lib/store.mjs";
import { hashPassword } from "../lib/auth.mjs";
const demo = process.env.SEED_DEMO_PASSWORD;
const resetLocalUat = process.env.RESET_LOCAL_UAT_FIXTURE === "true";
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
    ["delivery_free_km", "3"],
    ["delivery_fee_per_km", "2500"],
    ["delivery_max_km", "10"],
    ["payment_expiry_minutes", "15"],
    ["cod_max_order_amount", "150000"],
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
    ["manager@warkost.local", "Manager Warkost", "MANAGER"],
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
  if (resetLocalUat)
    await store.run(
      "UPDATE users SET name=?,password_hash=?,role='CUSTOMER',active=1,phone=?,birth_date=?,terms_accepted_at=COALESCE(terms_accepted_at,CURRENT_TIMESTAMP) WHERE email=?",
      "Pelanggan Demo",
      hashPassword(demo),
      "6281234567890",
      "1996-09-18",
      "customer@warkost.local",
    );
  await store.run(
    "UPDATE users SET phone=? WHERE role='DRIVER' AND phone IS NULL",
    "6281546407856",
  );
  const manager = await store.get(
    "SELECT id FROM users WHERE email='manager@warkost.local'",
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
      "Gratis Ongkir 3 KM",
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
      "Gratis Ongkir 3 KM",
      "Pesan menu favoritmu dan nikmati gratis ongkir untuk alamat dalam radius 3 km.",
      "PROMO BERLANGSUNG",
      "Berlaku untuk alamat yang terverifikasi dalam radius maksimal 3 km.",
      "Pilih Menu",
      startsAt,
      endsAt,
      1,
      manager.id,
      manager.id,
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
      manager.id,
      manager.id,
    );
  }
  if (resetLocalUat) {
    const startsAt = new Date(Date.now() - 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " "),
      endsAt = new Date(Date.now() + 30 * 86400000)
        .toISOString()
        .slice(0, 19)
        .replace("T", " ");
    await store.run(
      "UPDATE promotions SET starts_at=?,ends_at=?,active=1,updated_at=CURRENT_TIMESTAMP WHERE title IN (?,?)",
      startsAt,
      endsAt,
      "Gratis Ongkir 3 KM",
      "Voucher Hemat 10%",
    );
  }
  for (const name of ["Makanan", "Minuman", "Bahan Baku"])
    await store.run("INSERT OR IGNORE INTO categories(name) VALUES(?)", name);
  const food = (
      await store.get("SELECT id FROM categories WHERE name=?", "Makanan")
    ).id,
    drink = (
      await store.get("SELECT id FROM categories WHERE name=?", "Minuman")
    ).id,
    raw = (
      await store.get("SELECT id FROM categories WHERE name=?", "Bahan Baku")
    ).id;
  for (const [categoryId, name, sortOrder] of [
    [food, "Makanan Berat", 10],
    [food, "Mie", 20],
    [drink, "Coffee", 10],
    [drink, "Non Coffee", 20],
    [raw, "Kopi", 10],
    [raw, "Susu & Dairy", 20],
    [raw, "Sirup & Powder", 30],
    [raw, "Lainnya", 40],
  ])
    await store.run(
      "INSERT OR IGNORE INTO product_subcategories(category_id,name,sort_order) VALUES(?,?,?)",
      categoryId,
      name,
      sortOrder,
    );
  const subcategoryIds = new Map(
    (
      await store.all(
        "SELECT id,name FROM product_subcategories WHERE category_id IN (?,?,?)",
        food,
        drink,
        raw,
      )
    ).map((row) => [row.name, row.id]),
  );
  for (const [name, description, price, category, subcategory, station] of [
    [
      "Nasi Goreng Warkost",
      "Nasi goreng hangat dengan telur dan kerupuk",
      25000,
      food,
      subcategoryIds.get("Makanan Berat"),
      "KITCHEN",
    ],
    [
      "Mie Ayam Bahagia",
      "Mie ayam gurih dengan sayuran segar",
      22000,
      food,
      subcategoryIds.get("Mie"),
      "KITCHEN",
    ],
    [
      "Kopi Susu Rumah",
      "Espresso, susu, dan gula aren",
      18000,
      drink,
      subcategoryIds.get("Coffee"),
      "CASHIER",
    ],
  ]) {
    if (!(await store.get("SELECT id FROM products WHERE name=?", name)))
      await store.run(
        "INSERT INTO products(name,description,price,category_id,subcategory_id,prep_station,stock_quantity) VALUES(?,?,?,?,?,?,50)",
        name,
        description,
        price,
        category,
        subcategory,
        station,
      );
    else
      await store.run(
        "UPDATE products SET category_id=?,subcategory_id=?,prep_station=? WHERE name=?",
        category,
        subcategory,
        station,
        name,
      );
  }
  const rawCoffeeName = "Biji Kopi Arabica Sukabumi – Medium Roast";
  if (!(await store.get("SELECT id FROM products WHERE name=?", rawCoffeeName)))
    await store.run(
      `INSERT INTO products(name,description,price,category_id,subcategory_id,image_url,prep_station,stock_quantity,
       stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold)
       VALUES(?,?,?,?,?,?,?,?,'GRAM',100,100,100,2000)`,
      rawCoffeeName,
      "Biji kopi Arabica pilihan dengan profil medium roast. Memiliki karakter rasa cokelat, caramel, dan nutty. Cocok digunakan untuk espresso, milk-based coffee, maupun manual brew. Dijual mulai 100 gram dengan kelipatan 100 gram.",
      18000,
      raw,
      subcategoryIds.get("Kopi"),
      "/demo/bahan-baku-kopi.svg",
      "CASHIER",
      10000,
    );
  if (resetLocalUat) {
    await store.run(
      "UPDATE categories SET active=1 WHERE name IN ('Makanan','Minuman','Bahan Baku')",
    );
    await store.run(
      "UPDATE products SET active=1 WHERE name IN ('Nasi Goreng Warkost','Mie Ayam Bahagia','Kopi Susu Rumah','Biji Kopi Arabica Sukabumi – Medium Roast')",
    );
  }
  const customer = await store.get(
    "SELECT id FROM users WHERE email='customer@warkost.local'",
  );
  await store.run(
    "INSERT OR IGNORE INTO loyalty_accounts(user_id) VALUES(?)",
    customer.id,
  );
  if (
    !(await store.get("SELECT id FROM addresses WHERE user_id=?", customer.id))
  )
    await store.run(
      "INSERT INTO addresses(user_id,label,detail,latitude,longitude,is_default) VALUES(?,?,?,?,?,1)",
      customer.id,
      "Rumah",
      "Jl. Ahmad Yani No. 12, Sukabumi",
      -6.9217,
      106.9272,
    );
  if (resetLocalUat) {
    await store.run(
      "UPDATE addresses SET is_default=0 WHERE user_id=? AND active=1",
      customer.id,
    );
    const defaultAddress = await store.get(
      "SELECT id FROM addresses WHERE user_id=? AND active=1 ORDER BY id DESC LIMIT 1",
      customer.id,
    );
    if (defaultAddress)
      await store.run(
        "UPDATE addresses SET is_default=1 WHERE id=?",
        defaultAddress.id,
      );
  }
}

try {
  await seed();
  console.log(
    "Seed siap: owner, admin, kitchen, driver, dan customer @warkost.local",
  );
} finally {
  await store.close();
}
