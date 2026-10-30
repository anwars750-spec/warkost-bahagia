import { authCleanupStage, authStage } from "./auth-timing.mjs";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import tls from "node:tls";

const truthy = new Set(["1", "true", "yes", "on"]);
const falsy = new Set(["0", "false", "no", "off"]);
let outboxQueue = Promise.resolve();

function booleanValue(value, name) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (truthy.has(normalized)) return true;
  if (falsy.has(normalized)) return false;
  throw Error(`${name} harus bernilai true atau false`);
}

function safeHeader(value, name) {
  const result = String(value || "").trim();
  if (!result || /[\r\n\0]/.test(result)) throw Error(`${name} tidak valid`);
  return result;
}

export function emailTransportConfig(environment = process.env) {
  const production = environment.NODE_ENV === "production";
  const demo = environment.DEPLOYMENT_ENV === "demo";
  const requested = String(environment.EMAIL_TRANSPORT || "").toLowerCase();
  const mode = requested || (production && !demo ? "smtp" : "development");
  if (production && !demo && mode !== "smtp")
    throw Error("Production wajib memakai EMAIL_TRANSPORT=smtp");
  if (mode === "development") {
    if (production && !demo)
      throw Error(
        "Transport email development tidak boleh dipakai di production",
      );
    return {
      mode,
      outboxPath: path.resolve(
        /*turbopackIgnore: true*/
        environment.OTP_OUTBOX_PATH || ".uat/otp-outbox.json",
      ),
    };
  }
  if (mode !== "smtp") throw Error("EMAIL_TRANSPORT tidak didukung");
  const host = safeHeader(environment.SMTP_HOST, "SMTP_HOST");
  const user = safeHeader(environment.SMTP_USER, "SMTP_USER");
  const password = String(environment.SMTP_PASS || "");
  const from = safeHeader(environment.SMTP_FROM, "SMTP_FROM");
  const port = Number(environment.SMTP_PORT);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw Error("SMTP_PORT tidak valid");
  if (!password) throw Error("SMTP_PASS wajib diisi");
  const secure = booleanValue(environment.SMTP_SECURE, "SMTP_SECURE");
  return { mode, host, port, secure, user, password, from };
}

function appendDevelopmentEmail(config, message) {
  outboxQueue = outboxQueue.then(() => {
    fs.mkdirSync(path.dirname(config.outboxPath), { recursive: true });
    let entries = [];
    if (fs.existsSync(config.outboxPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(config.outboxPath, "utf8"));
        if (Array.isArray(parsed)) entries = parsed;
      } catch {
        throw Error("OTP outbox development tidak valid");
      }
    }
    entries.push(message);
    fs.writeFileSync(config.outboxPath, JSON.stringify(entries, null, 2), {
      mode: 0o600,
    });
  });
  return outboxQueue;
}

function smtpReader(socket) {
  let buffer = "";
  const pending = [];
  let failure;
  const settle = () => {
    while (pending.length) {
      const lines = buffer.split("\r\n");
      let end = -1;
      for (let index = 0; index < lines.length - 1; index += 1) {
        if (/^\d{3} /.test(lines[index])) {
          end = index;
          break;
        }
      }
      if (end < 0) return;
      const responseLines = lines.slice(0, end + 1);
      buffer = lines.slice(end + 1).join("\r\n");
      pending.shift().resolve({
        code: Number(responseLines.at(-1).slice(0, 3)),
        text: responseLines.join("\n"),
      });
    }
  };
  const onData = (chunk) => {
    buffer += chunk.toString("utf8");
    settle();
  };
  const onError = (error) => {
    failure = error;
    while (pending.length) pending.shift().reject(error);
  };
  const onClose = () => onError(Error("SMTP connection closed before reply"));
  socket.on("close", onClose);
  socket.on("end", onClose);
  socket.on("data", onData);
  socket.on("error", onError);
  return {
    read() {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        pending.push({ resolve, reject });
        settle();
      });
    },
    detach() {
      socket.off("close", onClose);
      socket.off("end", onClose);
      socket.off("data", onData);
      socket.off("error", onError);
    },
  };
}

function expectCode(response, expected, step) {
  if (!expected.includes(response.code))
    throw Error(`SMTP gagal pada ${step} (${response.code})`);
}

async function openSocket(config) {
  const options = { host: config.host, port: config.port };
  const socket = config.secure
    ? tls.connect({ ...options, servername: config.host })
    : net.connect(options);
  socket.setNoDelay(true);
  socket.setTimeout(15_000, () => socket.destroy(Error("SMTP timeout")));
  try {
    await new Promise((resolve, reject) => {
      socket.once(config.secure ? "secureConnect" : "connect", resolve);
      socket.once("error", reject);
    });
  } catch (error) {
    socket.destroy();
    throw error;
  }
  return socket;
}

async function sendSmtp(config, message) {
  let socket = await authStage("smtp.connect", () => openSocket(config));
  let reader = smtpReader(socket);
  let cleanupOwnsSocket = false;
  const command = async (line, expected, step, timing) =>
    authStage(timing, async () => {
      socket.write(line + "\r\n");
      const response = await reader.read();
      expectCode(response, expected, step);
      return response;
    });
  try {
    expectCode(
      await authStage("smtp.greeting", () => reader.read()),
      [220],
      "koneksi",
    );
    let hello = await command("EHLO warkost.local", [250], "EHLO", "smtp.ehlo");
    if (!config.secure) {
      if (!/STARTTLS/i.test(hello.text))
        throw Error("SMTP server tidak menawarkan STARTTLS");
      await command("STARTTLS", [220], "STARTTLS", "smtp.starttls");
      reader.detach();
      socket = tls.connect({ socket, servername: config.host });
      socket.setNoDelay(true);
      await authStage(
        "smtp.tls",
        () =>
          new Promise((resolve, reject) => {
            socket.once("secureConnect", resolve);
            socket.once("error", reject);
          }),
      );
      reader = smtpReader(socket);
      hello = await command(
        "EHLO warkost.local",
        [250],
        "EHLO TLS",
        "smtp.ehlo_tls",
      );
    }
    if (!/AUTH/i.test(hello.text))
      throw Error("SMTP server tidak menawarkan autentikasi");
    const credential = Buffer.from(
      `\0${config.user}\0${config.password}`,
    ).toString("base64");
    await command(
      `AUTH PLAIN ${credential}`,
      [235],
      "autentikasi",
      "smtp.auth",
    );
    const fromAddress = config.from.match(/<([^>]+)>/)?.[1] || config.from;
    await command(
      `MAIL FROM:<${fromAddress}>`,
      [250],
      "MAIL FROM",
      "smtp.mail_from",
    );
    await command(
      `RCPT TO:<${message.to}>`,
      [250, 251],
      "RCPT TO",
      "smtp.rcpt_to",
    );
    await command("DATA", [354], "DATA", "smtp.data_ready");
    const boundary = `warkost-${Date.now().toString(36)}`;
    const subject = `=?UTF-8?B?${Buffer.from(message.subject).toString("base64")}?=`;
    const data = [
      `From: ${config.from}`,
      `To: ${message.to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary=${boundary}`,
      "",
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.text,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: 8bit",
      "",
      message.html,
      `--${boundary}--`,
      "",
    ]
      .join("\r\n")
      .replace(/^\./gm, "..");
    socket.write(data + "\r\n.\r\n");
    expectCode(
      await authStage("smtp.data_accept", () => reader.read()),
      [250],
      "pengiriman",
    );
    // RFC 5321 section 4.2.5: the final DATA 250 transfers responsibility
    // to the SMTP server. QUIT is graceful connection cleanup, not acceptance.
    cleanupOwnsSocket = true;
    const cleanupTimeout = setTimeout(() => socket.destroy(), 1000);
    cleanupTimeout.unref?.();
    socket.unref?.();
    void authCleanupStage("smtp.quit", () =>
      command("QUIT", [221], "QUIT", "smtp.quit"),
    )
      .catch(() => {
        /* An accepted message must not be retried as a failure. */
      })
      .finally(() => {
        clearTimeout(cleanupTimeout);
        reader.detach();
        socket.destroy();
      });
  } finally {
    if (!cleanupOwnsSocket) {
      reader.detach();
      socket.destroy();
    }
  }
}

function otpMessage({ to, purpose, otp, expiresMinutes }) {
  const action =
    purpose === "REGISTRATION"
      ? "menyelesaikan pendaftaran akun"
      : "mengatur ulang password";
  const subject =
    purpose === "REGISTRATION"
      ? "Kode verifikasi akun Warkost Bahagia"
      : "Kode reset password Warkost Bahagia";
  const text = `Warkost Bahagia\n\nGunakan kode ${otp} untuk ${action}. Kode berlaku ${expiresMinutes} menit.\n\nJika Anda tidak meminta ini, abaikan email ini.`;
  const html = `<!doctype html><html><body style="margin:0;background:#fff8ef;font-family:Arial,sans-serif;color:#4f2b20"><div style="max-width:520px;margin:24px auto;padding:28px;border:1px solid #ead8c7;border-radius:18px;background:#fff"><h1 style="margin:0 0 12px;font-size:24px">Warkost Bahagia</h1><p>Gunakan kode berikut untuk ${action}:</p><p style="margin:22px 0;padding:16px;border-radius:12px;background:#6d2b1e;color:#fff;font-size:30px;font-weight:700;letter-spacing:8px;text-align:center">${otp}</p><p>Kode berlaku selama ${expiresMinutes} menit.</p><p style="color:#7c6b62;font-size:13px">Jika Anda tidak meminta ini, abaikan email ini.</p></div></body></html>`;
  return { to, subject, text, html, createdAt: new Date().toISOString() };
}

export async function sendOtpEmail(details, environment = process.env) {
  const config = emailTransportConfig(environment);
  const message = otpMessage(details);
  if (config.mode === "development")
    return appendDevelopmentEmail(config, message);
  return sendSmtp(config, message);
}
