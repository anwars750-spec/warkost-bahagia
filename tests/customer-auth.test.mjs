import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { validateAuthForm } from "../app/customer-auth-form.mjs";
import {
  catalogPresentation,
  compactQuantity,
} from "../app/customer-catalog.mjs";
const valid = {
  name: "UAT Customer",
  email: "uat@example.test",
  phone: "081234567890",
  birthDate: "1996-09-18",
  password: "CustomerFixture#2026",
  passwordConfirmation: "CustomerFixture#2026",
  consent: true,
};
test("registration gives explicit validation feedback while preserving server requirements", () => {
  assert.equal(validateAuthForm("register", valid), null);
  for (const [changes, field] of [
    [{ password: "Aman#2026" }, "password"],
    [{ passwordConfirmation: "different" }, "passwordConfirmation"],
    [{ consent: false }, "consent"],
    [{ birthDate: "2099-01-01" }, "birthDate"],
    [{ birthDate: "1996-02-30" }, "birthDate"],
    [{ email: "bad" }, "email"],
    [{ phone: "1" }, "phone"],
    [{ name: "X" }, "name"],
  ])
    assert.equal(
      validateAuthForm("register", { ...valid, ...changes }).field,
      field,
    );
  assert.equal(
    validateAuthForm("register", { ...valid, password: "x".repeat(129) }).field,
    "password",
  );
});
test("login, guest, reset and OTP modes validate only their own fields", () => {
  assert.equal(
    validateAuthForm("login", {
      identifier: "customer@warkost.local",
      password: "legacy",
    }),
    null,
  );
  assert.equal(validateAuthForm("login", {}).field, "identifier");
  assert.equal(validateAuthForm("guest", { name: "Guest Fixture" }), null);
  assert.equal(
    validateAuthForm("password-reset-request", {
      identifier: "customer@warkost.local",
    }),
    null,
  );
  assert.equal(validateAuthForm("password-reset-new", valid), null);
  assert.equal(
    validateAuthForm("registration-otp", { code: "not-a-code" }).field,
    "code",
  );
  assert.equal(validateAuthForm("registration-otp", { code: "123456" }), null);
});
test("catalog grouping and quantities belong to React data rather than decorated DOM", () => {
  const menu = {
    categories: [
      { id: 1, name: "Makanan" },
      { id: 2, name: "Minuman" },
    ],
    subcategories: [
      { id: 2, category_id: 1, name: "Nasi", sort_order: 1 },
      { id: 1, category_id: 1, name: "Mie", sort_order: 0 },
    ],
  };
  const products = [
    { id: 1, category_id: 2 },
    { id: 2, category_id: 1, subcategory_id: 2 },
    { id: 3, category_id: 1, subcategory_id: 1 },
  ];
  const all = catalogPresentation(menu, products, 0, 0);
  assert.equal(all.title, "Semua Menu");
  assert.deepEqual(
    all.entries.map((e) => e.product.id),
    [3, 2, 1],
  );
  assert.equal(all.entries[0].categoryCount, 2);
  assert.equal(all.entries[0].categoryStart, true);
  assert.equal(all.entries[1].categoryStart, false);
  const filtered = catalogPresentation(menu, products.slice(1), 1, 2);
  assert.equal(filtered.title, "Nasi");
  assert.deepEqual(
    filtered.entries.map((e) => e.product.id),
    [2, 3],
  );
  assert.equal(compactQuantity(100, "GRAM"), "100g");
  assert.equal(compactQuantity(1500, "GRAM"), "1,5 kg");
  assert.equal(compactQuantity(2, "PCS"), "2");
  assert.equal(compactQuantity(1050, "GRAM"), "1.050g");
  assert.equal(compactQuantity(10000, "PCS"), "10.000");
});
test("one auth form, one request lock, and scoped Customer presentation replace competing paths", () => {
  const read = (p) =>
    fs.readFileSync(new URL("../" + p, import.meta.url), "utf8");
  const auth = read("app/CustomerAuth.js"),
    page = read("app/page.js"),
    layout = read("app/layout.js");
  assert.match(auth, /validateAuthForm/);
  assert.match(auth, /onSubmitCapture/);
  assert.match(auth, /noValidate/);
  assert.match(auth, /scrollIntoView/);
  assert.match(auth, /mode === "register" &&/);
  assert.match(page, /if \(authAttempt.current\) return/);
  assert.match(page, /controller.signal.aborted/);
  assert.match(page, /clearCustomerData/);
  assert.doesNotMatch(
    layout,
    /CustomerCatalogPolish|CustomerQuantityUnitPolish|CustomerBannerCarouselRuntime|CustomerLocationLauncher|CustomerQrisOnlyRuntime/,
  );
  assert.match(
    page,
    /role === "CUSTOMER" && <CustomerLogoutDialog|role === "CUSTOMER" && \(/,
  );
  assert.doesNotMatch(
    auth,
    /MutationObserver|querySelector|createPortal|setTimeout/,
  );
});
