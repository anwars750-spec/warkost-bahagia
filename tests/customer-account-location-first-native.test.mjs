import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const form = await readFile(
  new URL("../app/CustomerAccountAddressLocationFirst.js", import.meta.url),
  "utf8",
);
const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");

test("React mounts the location-first form in Customer account settings", () => {
  assert.match(page, /role === "CUSTOMER" && view === "account"/);
  assert.match(
    page,
    /<CustomerAccountAddressLocationFirst\s+key=\{editingAddressRecord\?\.id \?\? "new"\}/,
  );
});

test("the location picker appears before the detail, label and save steps", () => {
  assert.match(
    form,
    /Pilih titik lokasi pengantaran[\s\S]*Lengkapi detail alamat[\s\S]*Beri label alamat[\s\S]*Pilih sebagai alamat default[\s\S]*Simpan alamat/,
  );
});

test("only a validated point opens detail fields and the submit button", () => {
  assert.match(
    form,
    /draft.point && \(\s*<>\s*<section className="wloc-native-detail-section"/,
  );
  assert.match(
    form,
    /draft.point && \(\s*<>\s*<small className="wloc-native-ready-note"/,
  );
});

test("a failed Account save keeps the draft and a successful save clears it", () => {
  assert.match(form, /if \(saved\) setDraft\(emptyDraft\)/);
  assert.match(form, /catch \(saveError\) \{\s*setError\(saveError.message\)/);
});

test("the account update removes the prior active row when editing", () => {
  assert.match(page, /commitSavedAddress\(saved.address, addressId\)/);
  assert.match(page, /item.id !== replacedId/);
});
