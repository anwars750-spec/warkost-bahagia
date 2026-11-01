import test from "node:test";
import assert from "node:assert/strict";
import { ensurePrintBranding } from "../lib/print-branding.mjs";

function fakeSheet() {
  let header = null;
  let innerHtmlWrites = 0;

  const makeElement = () => {
    const element = {
      className: "",
      dataset: {},
      _innerHTML: "",
      get innerHTML() {
        return this._innerHTML;
      },
      set innerHTML(value) {
        innerHtmlWrites += 1;
        this._innerHTML = value;
      },
    };
    return element;
  };

  const sheet = {
    dataset: {},
    querySelector(selector) {
      assert.equal(selector, ":scope > .warkost-print-brand");
      return header;
    },
    prepend(element) {
      header = element;
    },
  };

  return {
    sheet,
    makeElement,
    getHeader: () => header,
    getInnerHtmlWrites: () => innerHtmlWrites,
  };
}

test("print branding is idempotent and does not rewrite branded DOM", () => {
  const fixture = fakeSheet();

  const first = ensurePrintBranding(fixture.sheet, fixture.makeElement);
  const second = ensurePrintBranding(fixture.sheet, fixture.makeElement);

  assert.equal(first, true);
  assert.equal(second, false);
  assert.equal(fixture.getInnerHtmlWrites(), 1);
  assert.equal(fixture.sheet.dataset.warkostPrintSheet, "true");
  assert.equal(
    fixture.getHeader().dataset.warkostPrintBrandReady,
    "true",
  );
  assert.equal(fixture.getHeader().className, "warkost-print-brand");
});
