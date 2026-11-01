import net from "node:net";
import tls from "node:tls";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export async function localSmtpFixture(options = {}) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "warkost-smtp-fixture-"),
  );
  const key = path.join(directory, "key.pem"),
    cert = path.join(directory, "cert.pem");
  const openssl =
    process.platform === "win32" &&
    fs.existsSync("C:/Program Files/Git/mingw64/bin/openssl.exe")
      ? "C:/Program Files/Git/mingw64/bin/openssl.exe"
      : "openssl";
  try {
    execFileSync(
      openssl,
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost,IP:127.0.0.1",
        "-days",
        "1",
        "-keyout",
        key,
        "-out",
        cert,
      ],
      { stdio: "ignore", windowsHide: true },
    );
  } catch {
    throw Error("Local SMTP TLS tests require openssl");
  }
  const secureContext = tls.createSecureContext({
    key: fs.readFileSync(key),
    cert: fs.readFileSync(cert),
  });
  const sockets = new Set(),
    events = [],
    waiters = new Map(),
    messages = new Map();
  let acceptQuit, acceptData;
  const quitGate = options.holdQuit
    ? new Promise((resolve) => {
        acceptQuit = resolve;
      })
    : Promise.resolve();
  const dataGate = options.holdData
    ? new Promise((resolve) => {
        acceptData = resolve;
      })
    : Promise.resolve();
  const emit = (stage) => {
    events.push(stage);
    for (const resolve of waiters.get(stage) || []) resolve();
    waiters.delete(stage);
  };
  const pause = (duration) =>
    new Promise((resolve) => setTimeout(resolve, duration || 0));
  const server = net.createServer((raw) => {
    sockets.add(raw);
    raw.on("close", () => {
      sockets.delete(raw);
      emit("connection_closed");
    });
    raw.on("error", () => {});
    raw.setNoDelay(true);
    let socket = raw,
      buffer = "",
      data = false,
      parts = [];
    const send = async (text, delay = options.commandDelayMs) => {
      await pause(delay);
      if (!socket.destroyed) socket.write(text + "\r\n");
    };
    const line = async (value) => {
      if (data) {
        if (value !== ".") {
          parts.push(value);
          return;
        }
        data = false;
        const message = parts.join("\r\n");
        parts = [];
        const to = message.match(/^To: (.+)$/m)?.[1];
        const code = message.match(/\b\d{6}\b/)?.[0];
        if (to && code) messages.set(to, code);
        emit("data_received");
        await dataGate;
        if (options.dataDisconnect) {
          socket.destroy();
          return;
        }
        await send(
          `${options.dataCode || 250} fixture DATA result`,
          options.dataDelayMs,
        );
        emit(
          (options.dataCode || 250) === 250 ? "data_accepted" : "data_rejected",
        );
        return;
      }
      const verb = value.split(" ")[0];
      if (verb === "EHLO")
        return send("250-fixture\r\n250-STARTTLS\r\n250 AUTH PLAIN");
      if (verb === "STARTTLS") {
        raw.off("data", onData);
        await send("220 Start TLS");
        socket = new tls.TLSSocket(raw, { isServer: true, secureContext });
        socket.on("error", () => {});
        socket.on("data", onData);
        return;
      }
      if (verb === "AUTH")
        return send(`${options.authCode || 235} fixture AUTH result`);
      if (verb === "MAIL" || verb === "RCPT") return send("250 OK");
      if (verb === "DATA") {
        data = true;
        return send("354 End with dot");
      }
      if (verb === "QUIT") {
        emit("quit_received");
        await quitGate;
        await pause(options.quitDelayMs);
        if (options.quitDisconnect) {
          socket.destroy();
          return;
        }
        if (!socket.destroyed) socket.end("221 Bye\r\n");
        emit("quit_completed");
        return;
      }
      return send("500 Unsupported");
    };
    let sequence = Promise.resolve();
    function onData(chunk) {
      buffer += chunk.toString("utf8");
      let end;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const value = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        sequence = sequence
          .then(() => line(value))
          .catch(() => socket.destroy());
      }
    }
    raw.on("data", onData);
    void send("220 fixture ready", options.greetingDelayMs);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    port: server.address().port,
    cert,
    messages,
    events,
    releaseQuit: () => acceptQuit?.(),
    releaseData: () => acceptData?.(),
    waitFor(stage) {
      return events.includes(stage)
        ? Promise.resolve()
        : new Promise((resolve) => {
            waiters.set(stage, [...(waiters.get(stage) || []), resolve]);
          });
    },
    async close() {
      acceptQuit?.();
      acceptData?.();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
      const resolved = path.resolve(directory);
      if (
        path.dirname(resolved) !== path.resolve(os.tmpdir()) ||
        !path.basename(resolved).startsWith("warkost-smtp-fixture-")
      )
        throw Error("Unexpected fixture cleanup path");
      fs.rmSync(resolved, { recursive: true, force: true });
    },
  };
}
