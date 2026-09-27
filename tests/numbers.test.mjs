import test from "node:test";
import assert from "node:assert/strict";
import { nonNegativeInteger } from "../lib/numbers.mjs";

test("agregat integer konsisten untuk SQLite dan MySQL", () => {
  assert.equal(nonNegativeInteger(0), 0);
  assert.equal(nonNegativeInteger("40000"), 40000);
  assert.throws(() => nonNegativeInteger("1.5"), /bilangan bulat/);
  assert.throws(() => nonNegativeInteger("9007199254740992"), /aman/);
});
