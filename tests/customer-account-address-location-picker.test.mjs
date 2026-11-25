import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { readAddressPoint } from "../lib/address-point.mjs";

const form = await readFile(
  new URL("../app/CustomerAccountAddressLocationFirst.js", import.meta.url),
  "utf8",
);
const page = await readFile(new URL("../app/page.js", import.meta.url), "utf8");
const route = await readFile(
  new URL("../app/api/[action]/route.js", import.meta.url),
  "utf8",
);

test("Account opens the location picker with its current draft", () => {
  assert.match(form, /new CustomEvent\("warkost:location-picker-open"/);
  assert.match(form, /source: "account"/);
  assert.match(
    form,
    /address: \{ label: draft.label, detail: draft.detail, \.\.\.draft.point \}/,
  );
});

test("picker result atomically applies the selected label, detail and coordinates", () => {
  assert.match(
    form,
    /applyAddress\(\{ label, detail, latitude, longitude \}\)/,
  );
  assert.match(
    form,
    /setDraft\(\(current\) => \(\{ \.\.\.current, label, detail, point \}\)\)/,
  );
});

test("Account save requires the same draft point shown in the form", () => {
  assert.match(form, /if \(!draft.point\)/);
  assert.match(form, /\.\.\.draft.point,\s*isDefault: draft.isDefault/);
  assert.doesNotMatch(
    form,
    /MutationObserver|new FormData|setNativeValue|name="(?:latitude|longitude)"/,
  );
});

test("address HTTP writes validate the coordinate pair before dispatching either mutation", () => {
  assert.match(route, /action === "address" \|\| action === "address-replace"/);
  assert.match(
    route,
    /if \(!point\) throw new DomainError\("Titik lokasi tidak valid"\)/,
  );
});

test("address coordinate parsing preserves numbers and numeric strings", () => {
  assert.deepEqual(readAddressPoint("-6.9", 106), {
    latitude: -6.9,
    longitude: 106,
  });
});

test("a coordinate of zero is valid", () => {
  assert.deepEqual(readAddressPoint(0, "0"), { latitude: 0, longitude: 0 });
});

test("missing and whitespace coordinates are invalid", () => {
  for (const value of [undefined, null, "", " "]) {
    assert.equal(readAddressPoint(value, 106), null);
    assert.equal(readAddressPoint(-6.9, value), null);
  }
});

test("out-of-range, nonfinite and coerced booleans or arrays are invalid", () => {
  for (const value of [91, -91, NaN, Infinity, true, [], "invalid"]) {
    assert.equal(readAddressPoint(value, 106), null);
  }
  assert.equal(readAddressPoint(-6.9, 181), null);
});

test("an in-flight Account mutation blocks duplicate submissions", () => {
  assert.match(page, /if \(addressSaveAttempt.current\) return false/);
  assert.match(
    page,
    /addressSaveAttempt.current = true;[\s\S]*?await api\(/,
  );
});
