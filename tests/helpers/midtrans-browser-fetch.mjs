import fs from "node:fs/promises";
import { midtransFixture } from "./midtrans-fixture.mjs";

const control = process.env.WARKOST_MIDTRANS_FIXTURE_SETTLEMENT_FILE;
if (
  !control ||
  process.env.DEPLOYMENT_ENV !== "isolated-uat" ||
  process.env.DATABASE_URL
)
  throw new Error("Midtrans browser transport fixture needs isolated SQLite");

const fixture = midtransFixture(process.env.MIDTRANS_SANDBOX_SERVER_KEY, {
  async statusFor(ref, { pending, setStatus }) {
    if (pending(ref)?.transaction_status !== "pending") return;
    const selected = await fs.readFile(control, "utf8").catch(() => "");
    if (selected.split(/\s+/).includes(ref)) setStatus(ref, "settlement");
  },
});
const actualFetch = globalThis.fetch;
globalThis.fetch = function (input, options) {
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (url.hostname === "api.sandbox.midtrans.com") {
    if (url.origin !== "https://api.sandbox.midtrans.com")
      throw new Error("Invalid fixture provider origin");
    return fixture.fetcher(url.href, options);
  }
  if (url.hostname.endsWith(".midtrans.com"))
    throw new Error("Unexpected Midtrans transport");
  return actualFetch.call(this, input, options);
};
