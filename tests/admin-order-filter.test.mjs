import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ADMIN_ORDER_FILTERS,
  adminOrderCounts,
  adminOrderGroup,
  filterAdminOrders,
} from "../lib/admin-order-filter.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

const delivered = {
  id: 42,
  status: "DELIVERED",
  customer_name: "Pelanggan Demo",
  address: "Jalan Bahagia Nomor 10",
};

test("mapping dan count Admin mengikuti enam filter operasional", () => {
  assert.deepEqual(
    ADMIN_ORDER_FILTERS.map(({ key }) => key),
    ["all", "waiting", "preparing", "ready", "delivery", "done"],
  );
  assert.equal(adminOrderGroup("PENDING"), "waiting");
  assert.equal(adminOrderGroup("CONFIRMED"), "waiting");
  assert.equal(adminOrderGroup("PREPARING"), "preparing");
  assert.equal(adminOrderGroup("READY"), "ready");
  for (const status of ["ASSIGNED", "PICKED_UP", "ON_DELIVERY"])
    assert.equal(adminOrderGroup(status), "delivery");
  assert.equal(adminOrderGroup("DELIVERED"), "done");

  assert.deepEqual(adminOrderCounts([delivered]), {
    all: 1,
    waiting: 0,
    preparing: 0,
    ready: 0,
    delivery: 0,
    done: 1,
  });
  assert.deepEqual(filterAdminOrders([delivered], "all"), [delivered]);
  for (const filter of ["waiting", "preparing", "ready", "delivery"])
    assert.deepEqual(filterAdminOrders([delivered], filter), []);
  assert.deepEqual(filterAdminOrders([delivered], "done"), [delivered]);
});

test("switch filter tiga siklus tidak menyisakan kartu stale", () => {
  const sequence = ["all", "waiting", "done", "waiting", "all"];
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const filter of sequence) {
      const ids = filterAdminOrders([delivered], filter).map(({ id }) => id);
      assert.deepEqual(
        ids,
        ["all", "done"].includes(filter) ? [delivered.id] : [],
        `cycle ${cycle + 1} filter ${filter}`,
      );
    }
  }
});

test("search ID, WB, pelanggan, alamat dan filter status dikombinasikan", () => {
  const waiting = {
    id: 7,
    status: "PENDING",
    customer_name: "Customer Lain",
    address: "Jalan Merdeka",
  };
  const orders = [delivered, waiting];

  for (const query of ["42", "#42", "WB000042", "pelanggan demo", "bahagia"])
    assert.deepEqual(
      filterAdminOrders(orders, "done", query).map(({ id }) => id),
      [42],
      query,
    );
  assert.deepEqual(filterAdminOrders(orders, "waiting", "Pelanggan Demo"), []);
  assert.deepEqual(
    filterAdminOrders(orders, "waiting", "customer lain").map(({ id }) => id),
    [7],
  );
});

test("refresh data langsung memindahkan order ke filter status terbaru", () => {
  const initial = [{ ...delivered, id: 9, status: "PENDING" }];
  assert.deepEqual(
    filterAdminOrders(initial, "waiting").map(({ id }) => id),
    [9],
  );

  const refreshed = [{ ...initial[0], status: "DELIVERED" }];
  assert.deepEqual(filterAdminOrders(refreshed, "waiting"), []);
  assert.deepEqual(
    filterAdminOrders(refreshed, "done").map(({ id }) => id),
    [9],
  );
  assert.deepEqual(adminOrderCounts(refreshed), {
    all: 1,
    waiting: 0,
    preparing: 0,
    ready: 0,
    delivery: 0,
    done: 1,
  });
});

test("React adalah satu-satunya owner filter dan legacy DOM guard dihapus", () => {
  const page = read("app/page.js");
  const enhancer = read("app/AdminUiEnhancer.js");
  const layout = read("app/layout.js");
  const shortcut = read("app/AdminCodSettlementShortcut.js");
  const adminCss = read("app/admin-ui.css");
  const hotfixCss = read("app/admin-operational-hotfix.css");

  assert.match(
    page,
    /\[adminOrderFilter, setAdminOrderFilter\] = useState\("all"\)/,
  );
  assert.match(
    page,
    /\[adminOrderSearch, setAdminOrderSearch\] = useState\(""\)/,
  );
  assert.match(page, /const adminVisibleOrders = filterAdminOrders\(/);
  assert.match(page, /role === "ADMIN"[\s\S]*?adminVisibleOrders/);
  assert.match(page, /id="admin-order-tools"/);
  assert.match(page, /value=\{adminOrderSearch\}/);
  assert.match(page, /onClick=\{\(\) => setAdminOrderFilter\(key\)\}/);
  assert.match(page, /\{visibleOrders\.map\(\(o\) => \(/);

  for (const legacy of [
    /activeFilter/,
    /applyFilter/,
    /ensureTools/,
    /card\.hidden/,
    /getElementById\("admin-order-tools"\)/,
  ])
    assert.doesNotMatch(enhancer, legacy);
  assert.match(enhancer, /decorateOrders/);

  assert.equal(
    fs.existsSync(path.join(projectRoot, "app/AdminOrderFilterGuard.js")),
    false,
  );
  assert.doesNotMatch(layout, /AdminOrderFilterGuard/);
  assert.doesNotMatch(shortcut, /#admin-order-tools/);
  assert.match(shortcut, /warkost:admin-order-filter-reset/);
  assert.doesNotMatch(adminCss, /admin-order-card\[hidden\]/);
  assert.doesNotMatch(hotfixCss, /order\[hidden\]/);
});

test("detail order dan settlement COD tetap terhubung pada kartu React", () => {
  const page = read("app/page.js");
  assert.match(page, /Lihat item & riwayat/);
  assert.match(page, /Verifikasi setoran COD/);
  assert.match(page, /cod-settlement-verify/);
  assert.match(page, /settlement_status === "SUBMITTED"/);
});
