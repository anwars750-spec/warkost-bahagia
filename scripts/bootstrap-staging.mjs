import * as store from "../lib/store.mjs";
import { hashPassword } from "../lib/auth.mjs";
import { validateHostingerEnvironment } from "../lib/hostinger.mjs";

const errors = validateHostingerEnvironment(process.env);
if (errors.length) throw Error(errors.join("; "));

const password = process.env.STAGING_UAT_PASSWORD;
const accounts = [
  ["admin@warkost.local", "Admin Warkost", "ADMIN"],
  ["driver@warkost.local", "Driver Warkost", "DRIVER"],
  ["customer@warkost.local", "Pelanggan Demo", "CUSTOMER"],
];

try {
  await store.transaction(async (tx) => {
    await tx.run(
      "INSERT OR IGNORE INTO settings(`key`,value) VALUES(?,?)",
      "brand_name",
      "Warkost Bahagia Staging",
    );
    await tx.run(
      "INSERT OR IGNORE INTO settings(`key`,value) VALUES(?,?)",
      "rupiah_per_point",
      "10000",
    );

    for (const [email, name, role] of accounts)
      await tx.run(
        "INSERT OR IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
        name,
        email,
        hashPassword(password),
        role,
      );

    if (process.env.STAGING_RESET_DEMO_PASSWORD === "true") {
      for (const [email] of accounts) {
        const account = await tx.get(
          "SELECT id FROM users WHERE email=?",
          email,
        );
        if (!account) continue;
        await tx.run(
          "UPDATE users SET password_hash=?,active=1 WHERE id=?",
          hashPassword(password),
          account.id,
        );
        await tx.run(
          "UPDATE sessions SET revoked_at=CURRENT_TIMESTAMP WHERE user_id=? AND revoked_at IS NULL",
          account.id,
        );
      }
    }

    for (const name of ["Makanan", "Minuman"])
      await tx.run("INSERT OR IGNORE INTO categories(name) VALUES(?)", name);

    const productCount = await tx.get("SELECT COUNT(*) n FROM products");
    if (Number(productCount.n) === 0) {
      const food = await tx.get(
        "SELECT id FROM categories WHERE name=?",
        "Makanan",
      );
      const drink = await tx.get(
        "SELECT id FROM categories WHERE name=?",
        "Minuman",
      );
      for (const [name, description, price, categoryId] of [
        [
          "Nasi Goreng Warkost",
          "Nasi goreng hangat dengan telur dan kerupuk",
          25000,
          food.id,
        ],
        [
          "Mie Ayam Bahagia",
          "Mie ayam gurih dengan sayuran segar",
          22000,
          food.id,
        ],
        ["Kopi Susu Rumah", "Espresso, susu, dan gula aren", 18000, drink.id],
      ])
        await tx.run(
          "INSERT INTO products(name,description,price,category_id) VALUES(?,?,?,?)",
          name,
          description,
          price,
          categoryId,
        );
    }

    const customer = await tx.get(
      "SELECT id FROM users WHERE email=?",
      "customer@warkost.local",
    );
    if (
      !(await tx.get("SELECT id FROM addresses WHERE user_id=?", customer.id))
    )
      await tx.run(
        "INSERT INTO addresses(user_id,label,detail) VALUES(?,?,?)",
        customer.id,
        "Alamat Staging",
        "Jl. Ahmad Yani No. 12, Sukabumi",
      );
  });
  console.log("Bootstrap staging siap untuk tiga role UAT");
} finally {
  await store.close();
}
