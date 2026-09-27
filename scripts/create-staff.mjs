import * as store from "../lib/store.mjs";
import { hashPassword } from "../lib/auth.mjs";
const role = process.env.STAFF_ROLE,
  name = String(process.env.STAFF_NAME || "").trim(),
  email = String(process.env.STAFF_EMAIL || "")
    .trim()
    .toLowerCase(),
  password = String(process.env.STAFF_PASSWORD || "");
if (
  !["ADMIN", "DRIVER"].includes(role) ||
  name.length < 2 ||
  name.length > 80 ||
  !/^\S+@\S+\.\S+$/.test(email) ||
  password.length < 14 ||
  password.length > 128
)
  throw Error(
    "Set STAFF_ROLE=ADMIN|DRIVER, STAFF_NAME, STAFF_EMAIL dan STAFF_PASSWORD minimal 14 karakter",
  );
await store.run(
  "INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
  name,
  email,
  hashPassword(password),
  role,
);
console.log("Akun staf dibuat:", role, email);
