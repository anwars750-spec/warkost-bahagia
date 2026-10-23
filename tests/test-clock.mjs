const FIXED_TEST_NOW = Date.parse("2026-10-23T05:00:00.000Z");

// Full regression tests must be deterministic and must not depend on the
// real clock. 12:00 WIB is safely inside the default 08:00-22:00 schedule.
if (process.env.NODE_ENV !== "production") {
  Date.now = () => FIXED_TEST_NOW;

  // Owner demo tests expect the script default host. A manual UAT shell may
  // still carry OWNER_DEMO_HOST=0.0.0.0, so keep that state out of tests.
  delete process.env.OWNER_DEMO_HOST;
}
