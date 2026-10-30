export const MAX_ITEM_NOTE_LENGTH = 200;

export function normalizeItemNote(value) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Catatan item tidak valid");
  const note = value.trim();
  if (!note) return null;
  if (note.length > MAX_ITEM_NOTE_LENGTH)
    throw new Error(`Catatan item maksimal ${MAX_ITEM_NOTE_LENGTH} karakter`);
  return note;
}

export function updateCartQuantity(cart, productId, delta) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(delta))
    throw new Error("Perubahan jumlah item tidak valid");
  const quantity = Math.max(0, Number(cart[id] || 0) + delta);
  const next = { ...cart };
  if (quantity) next[id] = quantity;
  else delete next[id];
  return next;
}

export function updateItemNote(notes, productId, value) {
  const id = Number(productId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("Produk catatan tidak valid");
  const note = normalizeItemNote(value);
  const next = { ...notes };
  if (note) next[id] = note;
  else delete next[id];
  return next;
}

export function removeItemNote(notes, productId) {
  const next = { ...notes };
  delete next[Number(productId)];
  return next;
}
