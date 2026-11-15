#!/usr/bin/env node
// Read-only forensic check: pass an ORIGINAL Midtrans Sandbox notification JSON on stdin.
// Requires sandbox credentials in the process environment. Never prints identifiers or secrets.
import crypto from 'node:crypto';

const maxInputBytes = 64 * 1024;
const sandboxKey = process.env.MIDTRANS_SANDBOX_SERVER_KEY || '';
const merchantId = process.env.MIDTRANS_SANDBOX_MERCHANT_ID || '';
const signedFields = ['order_id', 'status_code', 'gross_amount'];
const validKey = /^SB-Mid-server-[A-Za-z0-9_-]+$/.test(sandboxKey);
const validMerchant = /^[A-Za-z0-9_-]{1,64}$/.test(merchantId);
const signaturePattern = /^[a-f0-9]{128}$/i;
const amountPattern = /^(0|[1-9]\d{0,14})(?:\.0+)?$/;
const orderPattern = /^WB-SB-[a-f0-9-]{36}$/;

function exitWithError(code) {
  console.log(JSON.stringify({ result: 'CANNOT_DIAGNOSE', error: code }));
  process.exitCode = 2;
}
function matchesSignature(data, amount = data.gross_amount) {
  if (!signedFields.every((field) => typeof data[field] === 'string') ||
      typeof data.signature_key !== 'string' ||
      !signaturePattern.test(data.signature_key)) return false;
  const calculated = crypto.createHash('sha512')
    .update(data.order_id + data.status_code + amount + sandboxKey)
    .digest();
  return crypto.timingSafeEqual(calculated, Buffer.from(data.signature_key, 'hex'));
}
function alternateAmountMatch(data) {
  const amount = data.gross_amount;
  if (typeof amount !== 'string' || !amountPattern.test(amount)) return null;
  const integer = amount.split('.')[0];
  const candidates = [integer, integer + '.0', integer + '.00', integer + '.0000'];
  for (const candidate of candidates) {
    if (candidate !== amount && matchesSignature(data, candidate)) {
      return candidate.includes('.') ? 'decimal_' + candidate.split('.')[1].length : 'integer';
    }
  }
  return null;
}
async function main() {
  if (!validKey || !validMerchant) {
    exitWithError('SANDBOX_ENV_MISSING_OR_INVALID');
    return;
  }
  let size = 0;
  const chunks = [];
  try {
    for await (const chunk of process.stdin) {
      size += chunk.length;
      if (size > maxInputBytes) {
        exitWithError('INPUT_TOO_LARGE');
        return;
      }
      chunks.push(chunk);
    }
  } catch {
    exitWithError('CANNOT_READ_STDIN');
    return;
  }
  let data;
  try {
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    exitWithError('INVALID_JSON');
    return;
  }
  if (!data || Array.isArray(data) || typeof data !== 'object') {
    exitWithError('EXPECTED_NOTIFICATION_OBJECT');
    return;
  }
  const signatureValid = matchesSignature(data);
  const merchantMatches = typeof data.merchant_id === 'string' && data.merchant_id === merchantId;
  const report = {
    result: signatureValid && merchantMatches ? 'SIGNATURE_AND_MERCHANT_MATCH' : 'NOT_VERIFIED',
    sandbox_key_format_valid: true,
    signature_field_format_valid: typeof data.signature_key === 'string' && signaturePattern.test(data.signature_key),
    signed_fields_are_strings: signedFields.every((field) => typeof data[field] === 'string'),
    signed_fields: Object.fromEntries(signedFields.map((field) => [field, typeof data[field]])),
    signature_matches_runtime_sandbox_key: signatureValid,
    merchant_matches_runtime_sandbox_merchant: merchantMatches,
    order_id_shape_valid: typeof data.order_id === 'string' && orderPattern.test(data.order_id),
    gross_amount_whole_idr_format: typeof data.gross_amount === 'string' && amountPattern.test(data.gross_amount),
    // Diagnostic only. NEVER trust or accept a modified payload based on this value.
    alternate_amount_spelling_match: signatureValid ? null : alternateAmountMatch(data),
  };
  console.log(JSON.stringify(report, null, 2));
  if (!signatureValid || !merchantMatches) process.exitCode = 1;
}
await main();
