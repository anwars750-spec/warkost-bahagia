import test from "node:test";
import assert from "node:assert/strict";
import { readJsonBody } from "../lib/request.mjs";

const request = (body, type = "application/json", headers = {}) =>
  new Request("http://localhost/api/login", {
    method: "POST",
    headers: { "content-type": type, ...headers },
    body,
  });

test("body JSON menerima objek dan menolak format salah", async () => {
  assert.deepEqual(await readJsonBody(request('{"email":"test@example.com"}')), {
    email: "test@example.com",
  });
  await assert.rejects(readJsonBody(request("{")), { status: 400 });
  await assert.rejects(readJsonBody(request("null")), { status: 400 });
  await assert.rejects(readJsonBody(request("[]")), { status: 400 });
  await assert.rejects(readJsonBody(request("{}", "text/plain")), { status: 415 });
});

test("ukuran JSON dibatasi walau Content-Length tidak ada", async () => {
  const large = "x".repeat(64 * 1024 + 1);
  await assert.rejects(readJsonBody(request(large)), { status: 413 });
  await assert.rejects(
    readJsonBody(request("{}", "application/json", { "content-length": "65537" })),
    { status: 413 },
  );
});
