import test from "node:test";
import assert from "node:assert/strict";
import {
  authStage,
  authCleanupStage,
  withAuthTimings,
} from "../lib/auth-timing.mjs";
test("auth diagnostics are opt-in and never include operation data or unknown stage names", async () => {
  const rows = [];
  let calls = 0;
  const value = await withAuthTimings(
    "register",
    () =>
      authStage("register.validate", () => {
        calls++;
        return { private: "not-for-logs" };
      }),
    { enabled: false, report: (items) => rows.push(items) },
  );
  assert.equal(calls, 1);
  assert.equal(value.private === "not-for-logs", true);
  assert.equal(rows.length, 0);
  await withAuthTimings(
    "register",
    async () => {
      authStage("private-not-for-logs", () => null);
      return authStage("register.validate", () => ({
        private: "not-for-logs",
      }));
    },
    { enabled: true, report: (items) => rows.push(items) },
  );
  assert.equal(rows.length, 1);
  assert.equal(JSON.stringify(rows).includes("not-for-logs"), false);
  for (const row of rows[0]) {
    assert.deepEqual(Object.keys(row), ["stage", "durationMs"]);
    assert.equal(Number.isFinite(row.durationMs), true);
  }
});
test("concurrent auth timing contexts and deferred cleanup remain separate", async () => {
  const registration = [],
    verification = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let cleanup;
  await Promise.all([
    withAuthTimings(
      "register",
      async () => {
        cleanup = authCleanupStage("smtp.quit", () => gate);
        await authStage("register.validate", async () => {});
      },
      { enabled: true, report: (items) => registration.push(items) },
    ),
    withAuthTimings(
      "otp-verify",
      () => authStage("verify.validation", () => true),
      { enabled: true, report: (items) => verification.push(items) },
    ),
  ]);
  assert.equal(registration.length, 1);
  assert.equal(
    registration[0].some((item) => item.stage === "smtp.quit"),
    false,
  );
  assert.equal(
    verification[0].some((item) => item.stage === "register.validate"),
    false,
  );
  release();
  await cleanup;
  assert.equal(registration.length, 2);
  assert.deepEqual(
    registration[1].map((item) => item.stage),
    ["smtp.quit"],
  );
});
test("diagnostic failures do not change auth results", async () => {
  assert.equal(
    await withAuthTimings("register", () => 42, {
      enabled: true,
      report: () => {
        throw Error("diagnostic sink unavailable");
      },
    }),
    42,
  );
  const previous = process.env.AUTH_TIMINGS;
  process.env.AUTH_TIMINGS = "1";
  try {
    const response = Response.redirect("http://localhost");
    assert.equal(
      await withAuthTimings("register", () => response, { report: () => {} }),
      response,
    );
  } finally {
    if (previous === undefined) delete process.env.AUTH_TIMINGS;
    else process.env.AUTH_TIMINGS = previous;
  }
});
