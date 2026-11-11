import crypto from "node:crypto";
import assert from "node:assert/strict";
import QRCode from "qrcode";

export const fixtureMerchant = "WARKOST_FIXTURE_MERCHANT";

export function providerTime(ms = Date.now()) {
  return new Date(ms + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 19)
    .replace("T", " ");
}

export function signedMidtrans(data, key, overrides = {}) {
  const payload = { ...data, ...overrides };
  return {
    ...payload,
    signature_key: crypto
      .createHash("sha512")
      .update(
        payload.order_id + payload.status_code + payload.gross_amount + key,
      )
      .digest("hex"),
  };
}

export function midtransFixture(key, { statusFor, onCharge } = {}) {
  const orders = new Map();
  const requests = [];
  const qr = QRCode.toBuffer("WARKOST MIDTRANS FIXTURE ONLY");
  const pending = (ref) => orders.get(ref);
  const setStatus = (ref, status, extra = {}) => {
    const current = pending(ref);
    assert.ok(current);
    const observation = {
      ...current,
      transaction_status: status,
      status_code:
        status === "settlement" ? "200" : status === "pending" ? "201" : "202",
      ...(status === "settlement" && { settlement_time: providerTime() }),
      ...extra,
    };
    orders.set(ref, observation);
    return observation;
  };
  async function fetcher(url, options) {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://api.sandbox.midtrans.com");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal);
    assert.ok(
      options.headers.Authorization ===
        "Basic " + Buffer.from(key + ":").toString("base64"),
    );
    requests.push({ path: parsed.pathname, method: options.method });
    if (parsed.pathname === "/v2/charge" && options.method === "POST") {
      const body = JSON.parse(options.body);
      const { order_id, gross_amount } = body.transaction_details;
      assert.equal(options.headers["Idempotency-Key"], order_id);
      assert.equal(body.payment_type, "qris");
      assert.equal(body.qris.acquirer, "gopay");
      assert.ok(body.custom_expiry.order_time.endsWith(" +0700"));
      assert.ok(body.custom_expiry.expiry_duration > 0);
      if (orders.has(order_id))
        return Response.json({ status_code: "406" }, { status: 406 });
      const data = {
        order_id,
        gross_amount: gross_amount + ".00",
        currency: "IDR",
        transaction_id: crypto.randomUUID(),
        merchant_id: fixtureMerchant,
        payment_type: "qris",
        status_code: "201",
        transaction_status: "pending",
        fraud_status: "accept",
        // Exercise the adapter's fixed origin even when the action supplies another host.
        actions: [
          { name: "generate-qr-code", url: "https://example.invalid/qr-code" },
        ],
      };
      orders.set(order_id, data);
      await onCharge?.(data);
      return Response.json(data, { status: 201 });
    }
    const status = parsed.pathname.match(/^\/v2\/(WB-SB-[a-f0-9-]+)\/status$/);
    if (status) {
      await statusFor?.(status[1], { pending, setStatus });
      return orders.has(status[1])
        ? Response.json(orders.get(status[1]))
        : Response.json({ status_code: "404" }, { status: 404 });
    }
    const image = parsed.pathname.match(/^\/v2\/qris\/([a-f0-9-]+)\/qr-code$/);
    if (
      image &&
      [...orders.values()].some((data) => data.transaction_id === image[1])
    )
      return new Response(await qr, {
        headers: { "Content-Type": "image/png" },
      });
    throw new Error("Unexpected fixture request");
  }
  return { fetcher, pending, requests, setStatus };
}
