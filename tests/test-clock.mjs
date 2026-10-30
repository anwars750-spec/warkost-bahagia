// Keep full regression deterministic for Store Operating Hours only.
// 12:00 WIB is safely inside the default 08:00-22:00 schedule.
process.env.WARKOST_TEST_STORE_NOW_MS = String(
  Date.parse("2026-10-23T05:00:00.000Z"),
);

// Owner demo tests expect the script default host. A manual UAT shell may
// still carry OWNER_DEMO_HOST=0.0.0.0, so keep that state out of tests.
delete process.env.OWNER_DEMO_HOST;
