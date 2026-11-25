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

test("print branding follows a reused sheet and defaults to delivery for older sheets", () => {
  const { sheet, makeElement, getHeader, getInnerHtmlWrites } = fakeSheet();

  assert.equal(ensurePrintBranding(sheet, makeElement), true);
  assert.match(getHeader().innerHTML, /<span>DELIVERY<\/span>/);

  sheet.dataset.fulfillmentType = "PICKUP";
  assert.equal(ensurePrintBranding(sheet, makeElement), true);
  assert.match(getHeader().innerHTML, /<span>PICKUP<\/span>/);
  assert.equal(ensurePrintBranding(sheet, makeElement), false);

  sheet.dataset.fulfillmentType = "DELIVERY";
  assert.equal(ensurePrintBranding(sheet, makeElement), true);
  assert.match(getHeader().innerHTML, /<span>DELIVERY<\/span>/);
  assert.equal(getInnerHtmlWrites(), 3);
});


test("an order ticket without fulfillment data does not use a delivery label", () => {
  const { sheet, makeElement, getHeader } = fakeSheet();
  sheet.matches = () => true;

  ensurePrintBranding(sheet, makeElement);
  assert.match(getHeader().innerHTML, /<span><\/span>/);
  sheet.dataset.fulfillmentType = "UNKNOWN";
  assert.equal(ensurePrintBranding(sheet, makeElement), false);
});
