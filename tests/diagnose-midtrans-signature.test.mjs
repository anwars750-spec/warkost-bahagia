import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/diagnose-midtrans-signature.mjs');
const serverKey = 'SB-Mid-server-test-no-real-secret';
const merchant = 'WARKOST_TEST_MERCHANT';
const payload = {
  order_id: 'WB-SB-12345678-1234-1234-1234-123456789abc',
  status_code: '200',
  gross_amount: '22000.00',
  merchant_id: merchant,
  transaction_status: 'settlement',
};
const signed = (data, key = serverKey) => ({
  ...data,
  signature_key: crypto.createHash('sha512')
    .update(data.order_id + data.status_code + data.gross_amount + key)
    .digest('hex'),
});
function check(data, env = {}) {
  const r = spawnSync(process.execPath, [script], {
    input: JSON.stringify(data),
    encoding: 'utf8',
    env: { ...process.env, MIDTRANS_SANDBOX_SERVER_KEY: serverKey, MIDTRANS_SANDBOX_MERCHANT_ID: merchant, ...env },
  });
  assert.equal(r.stderr, '');
  assert.ok(!r.stdout.includes(serverKey));
  assert.ok(!r.stdout.includes(data.signature_key || 'UNLIKELY-FALSE-POSITIVE'));
  assert.ok(!r.stdout.includes(data.order_id || 'UNLIKELY-FALSE-POSITIVE'));
  return { status: r.status, report: JSON.parse(r.stdout) };
}
test('accepts an unmodified, matching signed Sandbox callback', () => {
  const r = check(signed(payload));
  assert.equal(r.status, 0);
  assert.equal(r.report.signature_matches_runtime_sandbox_key, true);
  assert.equal(r.report.merchant_matches_runtime_sandbox_merchant, true);
});
test('rejects wrong key and does not reveal payload or credentials', () => {
  const r = check(signed(payload, 'SB-Mid-server-other'));
  assert.equal(r.status, 1);
  assert.equal(r.report.signature_matches_runtime_sandbox_key, false);
});
test('detects amount spelling mismatch but still rejects mutated payload', () => {
  const r = check({ ...signed(payload), gross_amount: '22000' });
  assert.equal(r.status, 1);
  assert.equal(r.report.alternate_amount_spelling_match, 'decimal_2');
});
test('rejects a valid signature for a different merchant', () => {
  const r = check(signed({ ...payload, merchant_id: 'OTHER_MERCHANT' }));
  assert.equal(r.status, 1);
  assert.equal(r.report.merchant_matches_runtime_sandbox_merchant, false);
});
test('rejects absent Sandbox env before processing notification', () => {
  const r = check(signed(payload), { MIDTRANS_SANDBOX_SERVER_KEY: '' });
  assert.equal(r.status, 2);
  assert.equal(r.report.error, 'SANDBOX_ENV_MISSING_OR_INVALID');
});
