import test from "node:test";
import assert from "node:assert/strict";
import { normalizePrinterProfile } from "../lib/printer-profile.mjs";
import { renderEscPos } from "../lib/print-escpos.mjs";
const ticket = {
  station: "KITCHEN",
  serviceType: "PICKUP",
  orderId: 7,
  items: [
    { name: "Nasi " + "A".repeat(80), quantity: 1, note: "tanpa sambal" },
  ],
};
test("generic profiles support explicit widths, font densities, copies and defaults without brands", () => {
  assert.equal(normalizePrinterProfile({ paperWidth: 58 }).columns, 32);
  assert.equal(normalizePrinterProfile({}).columns, 48);
  assert.equal(
    normalizePrinterProfile({
      paperWidth: 80,
      font: "B",
      columns: 64,
      copies: 5,
    }).copies,
    5,
  );
  assert.equal(
    normalizePrinterProfile({ paperWidth: 58, font: "B", columns: 42 }).columns,
    42,
  );
});
for (const cutMode of ["NONE", "FULL", "PARTIAL"])
  for (const cutCommand of ["GS_V", "GS_V_FEED"])
    test(`${cutMode} ${cutCommand}: exact declared cut bytes; no cutter means no cut`, () => {
      const b = renderEscPos(ticket, "KITCHEN", { cutMode, cutCommand });
      const expected =
        cutMode === "NONE"
          ? []
          : cutCommand === "GS_V"
            ? [29, 86, cutMode === "FULL" ? 0 : 1]
            : [29, 86, cutMode === "FULL" ? 65 : 66, 0];
      if (expected.length)
        assert.deepEqual([...b.subarray(-expected.length)], expected);
      else assert.equal(b.includes(Buffer.from([29, 86])), false);
    });
test("58mm profile wraps every printable line at 32 columns and selects font explicitly", () => {
  const b = renderEscPos(ticket, "KITCHEN", {
    paperWidth: 58,
    cutMode: "NONE",
  });
  assert.deepEqual([...b.subarray(0, 5)], [27, 64, 27, 77, 0]);
  assert.ok(
    b
      .subarray(5)
      .toString("ascii")
      .split("\n")
      .every((l) => l.length <= 32),
  );
});
test("CP437 and CP858 emit genuine bytes and explicit operator-selected codepage", () => {
  for (const [characterSet, codePage, name, byte] of [
    ["CP437", 0, "caf\u00e9", 0x82],
    ["CP858", 19, "Prix \u20ac", 0xd5],
  ]) {
    const b = renderEscPos(
      { ...ticket, items: [{ name, quantity: 1 }] },
      "KITCHEN",
      { characterSet, codePage },
    );
    assert.deepEqual([...b.subarray(5, 8)], [27, 116, codePage]);
    assert.ok(b.includes(byte));
  }
  assert.throws(
    () =>
      renderEscPos(
        { ...ticket, items: [{ name: "\u6f22", quantity: 1 }] },
        "KITCHEN",
        { characterSet: "CP437", codePage: 0 },
      ),
    /Karakter/,
  );
});
test("intentional copies are one bounded payload, labelled and each cut once", () => {
  const b = renderEscPos(ticket, "KITCHEN", { copies: 2 });
  assert.equal(b.toString("ascii").match(/SALINAN 1\/2/g).length, 1);
  assert.equal(b.toString("ascii").match(/SALINAN 2\/2/g).length, 1);
  assert.equal(b.toString("hex").split("1d5600").length - 1, 2);
});
test("unsupported protocols/encodings, inconsistent density and arbitrary commands fail closed", () => {
  for (const p of [
    { adapter: "USB" },
    { adapter: "BLUETOOTH" },
    { adapter: "PCL" },
    { characterSet: "UTF8" },
    { characterSet: "CP437" },
    { codePage: 256 },
    { cutMode: "RAW" },
    { cutCommand: "1b69" },
    { paperWidth: 70 },
    { paperWidth: 58, columns: 64 },
    { font: "X" },
    { columns: 0 },
    { copies: 0 },
    { copies: 6 },
    { feedLines: 9 },
    { rawCommand: "bad" },
    JSON.parse('{"__proto__":{}}'),
  ])
    assert.throws(() => normalizePrinterProfile(p));
});

test("zero extra feed still flushes final text line for a manual cutter", () => {
  const b = renderEscPos(ticket, "KITCHEN", { cutMode: "NONE", feedLines: 0 });
  assert.equal(b.at(-1), 10);
});
