import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const mobileCss = await readFile(new URL("../app/owner-stock-mobile-final.css", import.meta.url), "utf8");
const settingsCss = await readFile(new URL("../app/owner-settings-dedicated-view.css", import.meta.url), "utf8");

test("owner stock overview mobile is hard locked to viewport", () => {
  assert.match(mobileCss, /\.oso-backdrop[\s\S]*position:\s*fixed\s*!important/);
  assert.match(mobileCss, /\.oso-modal[\s\S]*width:\s*100vw\s*!important/);
  assert.match(mobileCss, /\.oso-modal[\s\S]*height:\s*100dvh\s*!important/);
  assert.match(mobileCss, /overflow-x:\s*hidden\s*!important/);
});

test("owner stock mobile layout prevents child horizontal overflow", () => {
  assert.match(mobileCss, /\.oso-modal \*/);
  assert.match(mobileCss, /min-width:\s*0\s*!important/);
  assert.match(mobileCss, /\.oso-row[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
});

test("owner stock mobile final stylesheet is loaded", () => {
  assert.match(settingsCss, /@import\s+"\.\/owner-stock-mobile-final\.css"/);
});
