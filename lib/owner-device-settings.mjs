import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const DEFAULT_DEVICE = Object.freeze({
  enabled: true,
  transport: "NETWORK_AGENT",
  host: "",
  port: 9100,
  paperWidth: 80,
  autoPrint: true,
  copies: 1,
  timeoutMs: 5000,
});

const DEFAULTS = Object.freeze({
  agentPollSeconds: 5,
  admin: Object.freeze({ ...DEFAULT_DEVICE, printerKey: "printer_admin" }),
  kitchen: Object.freeze({ ...DEFAULT_DEVICE, printerKey: "printer_kitchen" }),
});

const TRANSPORTS = new Set(["NETWORK_AGENT", "USB_AGENT"]);
const WIDTHS = new Set([58, 80]);

const bool = (value, fallback = false) => {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "boolean") return value;
  return String(value).toLowerCase() === "true" || String(value) === "1";
};

const integer = (value, fallback) => {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
};

const key = (station, name) => `printer_${station.toLowerCase()}_${name}`;

function normalizeDevice(station, source = {}) {
  const defaults = DEFAULTS[station.toLowerCase()];
  const transport = String(source.transport || defaults.transport).toUpperCase();
  const host = String(source.host ?? defaults.host).trim();
  const port = integer(source.port, defaults.port);
  const paperWidth = integer(source.paperWidth, defaults.paperWidth);
  const copies = integer(source.copies, defaults.copies);
  const timeoutMs = integer(source.timeoutMs, defaults.timeoutMs);
  const enabled = bool(source.enabled, defaults.enabled);
  const autoPrint = bool(source.autoPrint, defaults.autoPrint);

  if (!TRANSPORTS.has(transport))
    throw new DomainError("Tipe koneksi printer tidak valid");
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535)
    throw new DomainError("Port printer tidak valid");
  if (!WIDTHS.has(paperWidth))
    throw new DomainError("Lebar kertas printer harus 58 mm atau 80 mm");
  if (!Number.isSafeInteger(copies) || copies < 1 || copies > 5)
    throw new DomainError("Jumlah copy printer tidak valid");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30000)
    throw new DomainError("Timeout printer tidak valid");
  if (transport === "NETWORK_AGENT" && enabled && host.length > 255)
    throw new DomainError("Alamat printer terlalu panjang");

  return {
    station,
    printerKey: defaults.printerKey,
    enabled,
    transport,
    host,
    port,
    paperWidth,
    autoPrint,
    copies,
    timeoutMs,
    readyForAgent:
      enabled &&
      (transport === "USB_AGENT" || (transport === "NETWORK_AGENT" && host.length > 0)),
  };
}

function fromRows(rows) {
  const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
  const device = (station) =>
    normalizeDevice(station.toUpperCase(), {
      enabled: values[key(station, "enabled")],
      transport: values[key(station, "transport")],
      host: values[key(station, "host")],
      port: values[key(station, "port")],
      paperWidth: values[key(station, "paper_width")],
      autoPrint: values[key(station, "auto_print")],
      copies: values[key(station, "copies")],
      timeoutMs: values[key(station, "timeout_ms")],
    });

  return {
    agentPollSeconds: Math.min(
      60,
      Math.max(2, integer(values.printer_agent_poll_seconds, DEFAULTS.agentPollSeconds)),
    ),
    admin: device("admin"),
    kitchen: device("kitchen"),
  };
}

async function readAll() {
  const rows = await store.all(
    "SELECT `key`,value FROM settings WHERE `key` LIKE 'printer_admin_%' OR `key` LIKE 'printer_kitchen_%' OR `key`='printer_agent_poll_seconds'",
  );
  return fromRows(rows);
}

export async function getOwnerDeviceSettings(user) {
  requiredCapability(user, CAPABILITIES.SETTINGS_READ);
  return readAll();
}

export async function saveOwnerDeviceSettings(user, input = {}) {
  requiredCapability(user, CAPABILITIES.SETTINGS_WRITE);
  const admin = normalizeDevice("ADMIN", input.admin || {});
  const kitchen = normalizeDevice("KITCHEN", input.kitchen || {});
  const agentPollSeconds = integer(
    input.agentPollSeconds,
    DEFAULTS.agentPollSeconds,
  );
  if (agentPollSeconds < 2 || agentPollSeconds > 60)
    throw new DomainError("Interval sinkron printer harus 2–60 detik");

  await store.transaction(async (tx, mysql) => {
    const save = mysql
      ? "INSERT INTO settings(`key`,value) VALUES(?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)"
      : "INSERT INTO settings(`key`,value) VALUES(?,?) ON CONFLICT(`key`) DO UPDATE SET value=excluded.value";
    const rows = [["printer_agent_poll_seconds", agentPollSeconds]];
    for (const [station, config] of [
      ["admin", admin],
      ["kitchen", kitchen],
    ]) {
      rows.push(
        [key(station, "enabled"), config.enabled],
        [key(station, "transport"), config.transport],
        [key(station, "host"), config.host],
        [key(station, "port"), config.port],
        [key(station, "paper_width"), config.paperWidth],
        [key(station, "auto_print"), config.autoPrint],
        [key(station, "copies"), config.copies],
        [key(station, "timeout_ms"), config.timeoutMs],
      );
    }
    for (const [settingKey, value] of rows)
      await tx.run(save, settingKey, String(value));
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PRINTER_DEVICE_SETTINGS_UPDATED",
      JSON.stringify({
        agentPollSeconds,
        admin: { ...admin, host: admin.host || null },
        kitchen: { ...kitchen, host: kitchen.host || null },
      }),
    );
  });

  return readAll();
}

export async function getPrinterRuntimeConfig(user) {
  requiredCapability(user, CAPABILITIES.PRINTER_READ);
  const config = await readAll();
  if (user.role === "ADMIN")
    return { agentPollSeconds: config.agentPollSeconds, devices: [config.admin] };
  if (user.role === "KITCHEN")
    return { agentPollSeconds: config.agentPollSeconds, devices: [config.kitchen] };
  return {
    agentPollSeconds: config.agentPollSeconds,
    devices: [config.admin, config.kitchen],
  };
}
