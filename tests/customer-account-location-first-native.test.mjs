import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const runtime = fs.readFileSync(
  new URL("../app/CustomerAccountAddressLocationFirst.js", import.meta.url),
  "utf8",
);
const launcher = fs.readFileSync(
  new URL("../app/CustomerLocationLauncher.js", import.meta.url),
  "utf8",
);
const layout = fs.readFileSync(
  new URL("../app/layout.js", import.meta.url),
  "utf8",
);
const { syncAccountPointReadyState } = await import(
  "../app/CustomerAccountAddressLocationFirst.js"
);

test("native account address runtime is mounted", () => {
  assert.match(layout, /CustomerAccountAddressLocationFirst/);
  assert.match(runtime, /wloc-native-location-first/);
});

test("location-first flow physically moves the picker before address fields", () => {
  assert.match(runtime, /heading\.insertAdjacentElement\("afterend", pickerCard\)/);
  assert.match(runtime, /pickerCard\.insertAdjacentElement\("afterend", detailSection\)/);
  assert.match(runtime, /detailSection\.insertAdjacentElement\("afterend", labelSection\)/);
});

test("steps two through five stay hidden until coordinates are valid", () => {
  assert.match(runtime, /wloc-native-step-hidden/);
  assert.match(runtime, /form\.dataset\.wlocPointReady === "1"/);
  assert.match(runtime, /syncAccountPointReadyState/);
});

test("customer sees a clear five-step address flow", () => {
  assert.match(launcher, /Pilih titik lokasi pengantaran/);
  assert.match(runtime, /Lengkapi detail alamat/);
  assert.match(runtime, /Beri label alamat/);
  assert.match(runtime, /Pilih sebagai alamat default/);
  assert.match(runtime, /Simpan alamat/);
});

test("point-ready synchronization is idempotent and has no polling loop", () => {
  assert.doesNotMatch(runtime, /setInterval/);
  assert.match(runtime, /latitudeField\?\.addEventListener\("input", sync\)/);
  assert.match(runtime, /longitudeField\?\.addEventListener\("input", sync\)/);

  let attributeWrites = 0;
  const values = { wlocPointReady: "1" };
  const form = {
    dataset: new Proxy(values, {
      set(target, key, value) {
        attributeWrites += 1;
        target[key] = value;
        return true;
      },
    }),
  };
  const hidden = new Set(["wloc-native-step-hidden"]);
  const section = {
    classList: {
      contains: (name) => hidden.has(name),
      toggle(name, force) {
        if (force) hidden.add(name);
        else hidden.delete(name);
      },
    },
  };

  assert.equal(
    syncAccountPointReadyState(
      form,
      { value: "-6.9217" },
      { value: "106.9272" },
      [section],
    ),
    true,
  );
  assert.equal(attributeWrites, 0);
  assert.equal(hidden.has("wloc-native-step-hidden"), false);

  assert.equal(
    syncAccountPointReadyState(form, { value: "" }, { value: "" }, [section]),
    false,
  );
  assert.equal(attributeWrites, 1);
  assert.equal(hidden.has("wloc-native-step-hidden"), true);
  syncAccountPointReadyState(form, { value: "" }, { value: "" }, [section]);
  assert.equal(attributeWrites, 1);
});
