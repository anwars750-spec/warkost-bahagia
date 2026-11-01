import crypto from "node:crypto";
import * as store from "./store.mjs";
import { hashPassword } from "./auth.mjs";
import { GUEST_EMAIL_SUFFIX } from "./customer-kind.mjs";
import { DomainError } from "./domain.mjs";

function guestName(value) {
  const name = String(value || "").trim();
  if (name.length < 2 || name.length > 80)
    throw new DomainError("Nama guest harus 2–80 karakter");
  return name;
}

export async function createGuestCustomer(input) {
  const name = guestName(input?.name);
  const id = crypto.randomUUID();
  const email = `guest-${id}${GUEST_EMAIL_SUFFIX}`;
  const passwordHash = hashPassword(crypto.randomBytes(32).toString("hex"));
  const created = await store.run(
    "INSERT INTO users(name,email,password_hash,role,active,email_verified_at) VALUES(?,?,?,'CUSTOMER',1,CURRENT_TIMESTAMP)",
    name,
    email,
    passwordHash,
  );
  return {
    id: Number(created.lastInsertRowid),
    name,
    email,
    role: "CUSTOMER",
    isGuest: true,
  };
}
