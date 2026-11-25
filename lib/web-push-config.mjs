import crypto from "node:crypto";
export const PUSH_ROLES = Object.freeze([
  "CUSTOMER",
  "ADMIN",
  "KITCHEN",
  "DRIVER",
]);
export function pushConfiguration(env = process.env) {
  const publicKey = env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = env.WEB_PUSH_CONTACT;
  if (!publicKey || !privateKey || !subject) return null;
  try {
    if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(subject))
      return null;
    const key = crypto.createECDH("prime256v1");
    const secret = Buffer.from(privateKey, "base64url");
    if (secret.length !== 32) return null;
    key.setPrivateKey(secret);
    if (key.getPublicKey().toString("base64url") !== publicKey) return null;
    return { publicKey, privateKey, subject };
  } catch {
    return null;
  }
}
