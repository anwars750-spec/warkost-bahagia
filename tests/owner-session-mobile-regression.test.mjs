import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const source = (file) => fs.readFileSync(path.resolve(file), "utf8");

test("Owner session expiry triggers one logout and clears owner navigation", () => {
  const navigation = source("app/OwnerNavigationRuntime.js");

  assert.match(navigation, /let logoutTriggered = false/);
  assert.match(navigation, /response\.status === 401/);
  assert.match(navigation, /triggerExpiredSessionLogout\(\)/);
  assert.match(navigation, /sessionStorage\.removeItem\("warkost-owner-nav-active"\)/);
  assert.match(navigation, /normalizeLabel\(button\) === "Keluar"/);
  assert.match(navigation, /logoutButton\?\.click\(\)/);
});

test("Owner dashboard auth errors are not logged as server failures", () => {
  const route = source("app/api/owner-dashboard-v2/route.js");

  assert.match(route, /const status = error\?\.status \|\| 500/);
  assert.match(route, /if \(status >= 500\) console\.error/);
  assert.match(route, /return out\([\s\S]*status,[\s\S]*\)/);
});

test("Owner KPI mobile remains two columns with final digital card full width", () => {
  const styles = source("app/owner-dashboard-mobile-filter-polish.css");

  assert.match(styles, /@media \(max-width: 410px\)/);
  assert.match(
    styles,
    /\.owner-dashboard-kpis-v3\s*\{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important/,
  );
  assert.match(
    styles,
    /\.owner-dashboard-kpis-v3 article:last-child\s*\{[\s\S]*grid-column: 1 \/ -1/,
  );
});
