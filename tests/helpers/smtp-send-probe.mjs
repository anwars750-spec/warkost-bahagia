import crypto from "node:crypto";
import { sendOtpEmail } from "../../lib/email.mjs";
let stage = "pending";
process.on("message", (message) => {
  if (message.type === "status") process.send({ type: "status", stage });
  if (message.type === "stop") process.disconnect();
});
sendOtpEmail({
  to: "fixture@example.test",
  purpose: "REGISTRATION",
  otp: String(crypto.randomInt(0, 1000000)).padStart(6, "0"),
  expiresMinutes: 10,
}).then(
  () => {
    stage = "resolved";
    process.send({ type: "result", stage });
  },
  () => {
    stage = "rejected";
    process.send({ type: "result", stage });
  },
);
