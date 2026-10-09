import * as store from "./store.mjs";
import { DomainError, required, requiredCapability } from "./domain.mjs";
import { listActivePromotions } from "./promotions.mjs";
import { CAPABILITIES } from "./rbac.mjs";
import { STOCK_UNITS } from "./product-units.mjs";

const positive = (value) =>
  Number.isSafeInteger(Number(value)) && Number(value) > 0;
const categoryOrder =
  "CASE c.name WHEN 'Makanan' THEN 1 WHEN 'Minuman' THEN 2 WHEN 'Bahan Baku' THEN 3 ELSE 4 END";

export async function listCatalog(admin = false) {
  const categories = await store.all(
    admin
      ? "SELECT * FROM categories c ORDER BY " + categoryOrder + ",c.id"
      : "SELECT id,name FROM categories c WHERE active=1 ORDER BY " +
          categoryOrder +
          ",c.id",
  );
  const subcategories = await store.all(
    admin
      ? "SELECT s.*,c.name category_name FROM product_subcategories s JOIN categories c ON c.id=s.category_id ORDER BY " +
          categoryOrder +
          ",s.sort_order,s.id"
      : "SELECT s.id,s.category_id,s.name FROM product_subcategories s JOIN categories c ON c.id=s.category_id WHERE s.active=1 AND c.active=1 ORDER BY " +
          categoryOrder +
          ",s.sort_order,s.id",
  );
  const products = await store.all(
    admin
      ? "SELECT p.*,c.name category_name,s.name subcategory_name FROM products p JOIN categories c ON c.id=p.category_id LEFT JOIN product_subcategories s ON s.id=p.subcategory_id ORDER BY " +
          categoryOrder +
          ",p.id DESC"
      : `SELECT p.id,p.category_id,p.subcategory_id,p.name,p.description,p.price,p.image_url,
          p.stock_unit,p.price_unit_quantity,p.minimum_order_quantity,p.order_step_quantity,
          CASE WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)<0 THEN 0 ELSE p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0) END available_quantity,
          CASE WHEN p.stock_quantity-COALESCE((SELECT SUM(r.quantity) FROM stock_reservations r WHERE r.product_id=p.id AND r.status='RESERVED' AND r.expires_at>CURRENT_TIMESTAMP),0)>=p.minimum_order_quantity THEN 1 ELSE 0 END in_stock
        FROM products p
        JOIN categories c ON c.id=p.category_id
        LEFT JOIN product_subcategories s ON s.id=p.subcategory_id
        WHERE p.active=1 AND c.active=1 AND (p.subcategory_id IS NULL OR s.active=1)
        ORDER BY ${categoryOrder},p.id DESC`,
  );
  const brand = await store.get(
    "SELECT value FROM settings WHERE `key`=?",
    "brand_name",
  );
  return {
    categories,
    subcategories,
    products,
    promotions: admin ? [] : await listActivePromotions(),
    brand: brand?.value || "Warkost Bahagia",
  };
}

export async function saveCategory(user, input) {
  requiredCapability(user, CAPABILITIES.CATALOG_WRITE);
  const name = String(input.name || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new DomainError("Nama kategori harus 2–80 karakter");
  if (input.id !== undefined) {
    if (!positive(input.id)) throw new DomainError("ID kategori tidak valid");
    const changed = await store.run(
      "UPDATE categories SET name=?,active=? WHERE id=?",
      name,
      input.active === true ? 1 : 0,
      Number(input.id),
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
    } catch (error) {
      if (error.code === "ERR_SQLITE_ERROR" || error.code === "ER_DUP_ENTRY")
        throw new DomainError("Nama kategori sudah digunakan");
      throw error;
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

export async function saveSubcategory(user, input) {
  required(user, ["MANAGER"]);
  const name = String(input.name || "").trim();
  const categoryId = Number(input.categoryId);
  const sortOrder = Number(input.sortOrder || 0);
  if (
    name.length < 2 ||
    name.length > 80 ||
    !positive(categoryId) ||
    !Number.isSafeInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 9999
  )
    throw new DomainError("Data subkategori tidak valid");
  if (!(await store.get("SELECT id FROM categories WHERE id=?", categoryId)))
    throw new DomainError("Kategori tidak ditemukan");
  try {
    if (input.id !== undefined) {
      if (!positive(input.id))
        throw new DomainError("ID subkategori tidak valid");
      const changed = await store.run(
        "UPDATE product_subcategories SET category_id=?,name=?,active=?,sort_order=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        categoryId,
        name,
        input.active === true ? 1 : 0,
        sortOrder,
        Number(input.id),
      );
      if (!changed.changes)
        throw new DomainError("Subkategori tidak ditemukan", 404);
    } else {
      await store.run(
        "INSERT INTO product_subcategories(category_id,name,active,sort_order) VALUES(?,?,1,?)",
        categoryId,
        name,
        sortOrder,
      );
    }
  } catch (error) {
    if (error.code === "ERR_SQLITE_ERROR" || error.code === "ER_DUP_ENTRY")
      throw new DomainError(
        "Nama subkategori sudah digunakan pada kategori ini",
      );
    throw error;
  }
  await store.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "SUBCATEGORY_SAVED",
    JSON.stringify({ id: input.id || null, categoryId, name }),
  );
  return { ok: true };
}

export async function saveProduct(user, input) {
  requiredCapability(user, CAPABILITIES.CATALOG_WRITE);
  const name = String(input.name || "").trim();
  const description = String(input.description || "").trim();
  const price = Number(input.price);
  const categoryId = Number(input.categoryId);
  const subcategoryId = [null, undefined, ""].includes(input.subcategoryId)
    ? null
    : Number(input.subcategoryId);
  const imageUrl = String(input.imageUrl || "").trim();
  const stockUnit = String(input.stockUnit ?? "PCS").toUpperCase();
  const priceUnitQuantity = Number(input.priceUnitQuantity ?? 1);
  const minimumOrderQuantity = Number(input.minimumOrderQuantity ?? 1);
  const orderStepQuantity = Number(input.orderStepQuantity ?? 1);
  const lowStockThreshold = Number(input.lowStockThreshold ?? 0);
  if (
    name.length < 2 ||
    name.length > 100 ||
    description.length > 500 ||
    !positive(price) ||
    price > 100000000 ||
    !positive(categoryId) ||
    (subcategoryId !== null && !positive(subcategoryId)) ||
    imageUrl.length > 1000 ||
    !STOCK_UNITS.includes(stockUnit) ||
    !positive(priceUnitQuantity) ||
    !positive(minimumOrderQuantity) ||
    !positive(orderStepQuantity) ||
    !Number.isSafeInteger(lowStockThreshold) ||
    lowStockThreshold < 0 ||
    (imageUrl &&
      !/^\/api\/media\/[0-9a-f-]{36}$/.test(imageUrl) &&
      !/^\/demo\/[a-z0-9._-]+\.(svg|webp|png)$/i.test(imageUrl) &&
      !/^https:\/\//.test(imageUrl))
  )
    throw new DomainError("Data produk tidak valid");
  if (
    (price * minimumOrderQuantity) % priceUnitQuantity !== 0 ||
    (price * orderStepQuantity) % priceUnitQuantity !== 0
  )
    throw new DomainError(
      "Harga dan satuan order harus menghasilkan Rupiah bulat",
    );
  if (
    imageUrl.startsWith("/api/media/") &&
    !(await store.get(
      "SELECT id FROM media_assets WHERE id=?",
      imageUrl.slice(11),
    ))
  )
    throw new DomainError("Gambar produk tidak ditemukan");
  const category = await store.get(
    "SELECT id,name,active FROM categories WHERE id=?",
    categoryId,
  );
  if (!category) throw new DomainError("Kategori tidak ditemukan");
  let subcategory = null;
  if (subcategoryId !== null) {
    subcategory = await store.get(
      "SELECT id,category_id,active FROM product_subcategories WHERE id=?",
      subcategoryId,
    );
    if (!subcategory || Number(subcategory.category_id) !== categoryId)
      throw new DomainError("Subkategori tidak sesuai kategori");
  }
  const active = input.active === true ? 1 : 0;
  if (active && (!category.active || (subcategory && !subcategory.active)))
    throw new DomainError(
      "Produk aktif memerlukan kategori dan subkategori aktif",
    );
  const prepStation = category.name === "Makanan" ? "KITCHEN" : "CASHIER";
  if (input.id !== undefined) {
    if (!positive(input.id)) throw new DomainError("ID produk tidak valid");
    const changed = await store.run(
      `UPDATE products SET name=?,description=?,price=?,category_id=?,subcategory_id=?,image_url=?,active=?,prep_station=?,
        stock_unit=?,price_unit_quantity=?,minimum_order_quantity=?,order_step_quantity=?,low_stock_threshold=? WHERE id=?`,
      name,
      description,
      price,
      categoryId,
      subcategoryId,
      imageUrl,
      active,
      prepStation,
      stockUnit,
      priceUnitQuantity,
      minimumOrderQuantity,
      orderStepQuantity,
      lowStockThreshold,
      Number(input.id),
    );
    if (!changed.changes) throw new DomainError("Produk tidak ditemukan", 404);
  } else {
    await store.run(
      `INSERT INTO products(name,description,price,category_id,subcategory_id,image_url,active,prep_station,stock_quantity,
        stock_unit,price_unit_quantity,minimum_order_quantity,order_step_quantity,low_stock_threshold)
       VALUES(?,?,?,?,?,?,?,?,0,?,?,?,?,?)`,
      name,
      description,
      price,
      categoryId,
      subcategoryId,
      imageUrl,
      active,
      prepStation,
      stockUnit,
      priceUnitQuantity,
      minimumOrderQuantity,
      orderStepQuantity,
      lowStockThreshold,
    );
  }
  await store.run(
    "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
    user.id,
    "PRODUCT_SAVED",
    JSON.stringify({ id: input.id || null, name, prepStation, stockUnit }),
  );
  return { ok: true };
}
