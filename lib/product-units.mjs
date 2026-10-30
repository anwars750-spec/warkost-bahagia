export const STOCK_UNITS = Object.freeze(["PCS", "GRAM"]);

export function productQuantityRules(product) {
  const stockUnit = String(product?.stock_unit || "PCS").toUpperCase();
  const priceUnitQuantity = Number(product?.price_unit_quantity || 1);
  const minimumOrderQuantity = Number(product?.minimum_order_quantity || 1);
  const orderStepQuantity = Number(product?.order_step_quantity || 1);
  if (
    !STOCK_UNITS.includes(stockUnit) ||
    !Number.isSafeInteger(priceUnitQuantity) ||
    priceUnitQuantity < 1 ||
    !Number.isSafeInteger(minimumOrderQuantity) ||
    minimumOrderQuantity < 1 ||
    !Number.isSafeInteger(orderStepQuantity) ||
    orderStepQuantity < 1
  )
    throw new Error("Konfigurasi satuan produk tidak valid");
  return {
    stockUnit,
    priceUnitQuantity,
    minimumOrderQuantity,
    orderStepQuantity,
  };
}

export function validateOrderQuantity(product, quantity) {
  if (!Number.isSafeInteger(quantity)) return false;
  const rules = productQuantityRules(product);
  return (
    quantity >= rules.minimumOrderQuantity &&
    (quantity - rules.minimumOrderQuantity) % rules.orderStepQuantity === 0
  );
}

export function productLineTotal(product, quantity) {
  const { priceUnitQuantity } = productQuantityRules(product);
  const numerator = Number(product?.price) * Number(quantity);
  if (!Number.isSafeInteger(numerator) || numerator < 0)
    throw new Error("Total produk tidak valid");
  const total = numerator / priceUnitQuantity;
  if (!Number.isSafeInteger(total))
    throw new Error("Harga produk tidak menghasilkan nilai rupiah bulat");
  return total;
}

export function formatStockQuantity(quantity, stockUnit = "PCS") {
  const value = Number(quantity || 0);
  if (String(stockUnit).toUpperCase() !== "GRAM")
    return `${value.toLocaleString("id-ID")} pcs`;
  if (value >= 1000 && value % 100 === 0)
    return `${(value / 1000).toLocaleString("id-ID", {
      maximumFractionDigits: 1,
    })} kg`;
  return `${value.toLocaleString("id-ID")} g`;
}

export function productPriceLabel(product, money) {
  const { stockUnit, priceUnitQuantity } = productQuantityRules(product);
  return `${money(product.price)} / ${formatStockQuantity(priceUnitQuantity, stockUnit)}`;
}
