import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
const positive = (n) => Number.isSafeInteger(n) && n > 0;
export async function listCatalog(admin = false) {
  const categories = await store.all(
    admin
      ? "SELECT * FROM categories ORDER BY id"
      : "SELECT * FROM categories WHERE active=1 ORDER BY id",
  );
  const products = await store.all(
    admin
      ? "SELECT * FROM products ORDER BY id DESC"
      : "SELECT * FROM products WHERE active=1 AND category_id IN(SELECT id FROM categories WHERE active=1) ORDER BY id DESC",
  );
  const brand = await store.get(
    "SELECT value FROM settings WHERE `key`=?",
    "brand_name",
  );
  return { categories, products, brand: brand?.value || "Warkost Bahagia" };
}
export async function saveCategory(user, input) {
  required(user, ["ADMIN", "OWNER"]);
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new DomainError("Nama kategori harus 2–80 karakter");
  if (input.id !== undefined) {
    if (!positive(input.id)) throw new DomainError("ID kategori tidak valid");
    const changed = await store.run(
      "UPDATE categories SET name=?,active=? WHERE id=?",
      name,
      input.active === true ? 1 : 0,
      input.id,
    );
    if (!changed.changes)
      throw new DomainError("Kategori tidak ditemukan", 404);
  } else {
    try {
      await store.run(
        "INSERT INTO categories(name,active) VALUES(?,?)",
        name,
        1,
      );
    } catch (e) {
      if (e.code === "ERR_SQLITE_ERROR" || e.code === "ER_DUP_ENTRY")
        throw new DomainError("Nama kategori sudah digunakan");
      throw e;
    }
  }
  await store.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "CATEGORY_SAVED",
    JSON.stringify({ id: input.id || null, name }),
  );
  return { ok: true };
}
export async function saveProduct(user, input) {
  required(user, ["ADMIN", "OWNER"]);
  const name = String(input.name || "").trim(),
    description = String(input.description || "").trim(),
    price = input.price,
    categoryId = input.categoryId,
    imageUrl = String(input.imageUrl || "").trim(),
    prepStation = input.prepStation || "KITCHEN";
  if (
    name.length < 2 ||
    name.length > 100 ||
    description.length > 500 ||
    !positive(price) ||
    price > 100000000 ||
    !positive(categoryId) ||
    imageUrl.length > 1000 ||
    !["KITCHEN", "CASHIER"].includes(prepStation) ||
    (imageUrl &&
      !/^\/api\/media\/[0-9a-f-]{36}$/.test(imageUrl) &&
      !/^https:\/\//.test(imageUrl))
  )
    throw new DomainError("Data produk tidak valid");
  if (
    imageUrl.startsWith("/api/media/") &&
    !(await store.get(
      "SELECT id FROM media_assets WHERE id=?",
      imageUrl.slice(11),
    ))
  )
    throw new DomainError("Gambar produk tidak ditemukan");
  if (!(await store.get("SELECT id FROM categories WHERE id=?", categoryId)))
    throw new DomainError("Kategori tidak ditemukan");
  if (input.id !== undefined) {
    if (!positive(input.id)) throw new DomainError("ID produk tidak valid");
    const changed = await store.run(
      "UPDATE products SET name=?,description=?,price=?,category_id=?,image_url=?,active=?,prep_station=? WHERE id=?",
      name,
      description,
      price,
      categoryId,
      imageUrl,
      input.active === true ? 1 : 0,
      prepStation,
      input.id,
    );
    if (!changed.changes) throw new DomainError("Produk tidak ditemukan", 404);
  } else
    await store.run(
      "INSERT INTO products(name,description,price,category_id,image_url,active,prep_station,stock_quantity) VALUES(?,?,?,?,?,?,?,0)",
      name,
      description,
      price,
      categoryId,
      imageUrl,
      input.active === true ? 1 : 0,
      prepStation,
    );
  await store.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "PRODUCT_SAVED",
    JSON.stringify({ id: input.id || null, name, prepStation }),
  );
  return { ok: true };
}
