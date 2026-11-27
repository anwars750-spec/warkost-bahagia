import { bridgeState, parsePrintPayload } from "./print-bridge.mjs";
import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const stationFor = (user) =>
  user.role === "KITCHEN" ? "KITCHEN" : user.role === "ADMIN" ? "ADMIN" : null;

export async function listPrintJobs(user) {
  requiredCapability(user, CAPABILITIES.PRINTER_READ);
  const station = stationFor(user);
  const jobs = await store.all(
    "SELECT id,order_id,station,status,printer_key,attempts,reprint_count,error_message,created_at,updated_at,printed_at,payload_json FROM print_jobs" +
      (station ? " WHERE station=?" : "") +
      " ORDER BY id DESC LIMIT 100",
    ...(station ? [station] : []),
  );
  return jobs.map((job) => {
    const { payload_json, ...safe } = job;
    return { ...safe, status: bridgeState(job) };
  });
}

export async function getPrintTicket(user, id) {
  requiredCapability(user, CAPABILITIES.PRINTER_READ);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Print job tidak valid");
  const station = stationFor(user);
  if (!station) throw new DomainError("Akses ditolak", 403);
  const job = await store.get(
    "SELECT j.order_id,j.station,j.payload_json,o.fulfillment_type FROM print_jobs j JOIN orders o ON o.id=j.order_id WHERE j.id=? AND j.station=?",
    id,
    station,
  );
  if (!job) throw new DomainError("Print job tidak ditemukan", 404);
  if (!["PICKUP", "DELIVERY"].includes(job.fulfillment_type))
    throw new DomainError("Jenis pesanan pada tiket tidak valid", 409);
  const payload = parsePrintPayload(job.payload_json);
  return {
    orderId: job.order_id,
    station: job.station,
    fulfillmentType: job.fulfillment_type,
    items: payload.items,
    ...(job.station === "ADMIN" && {
      address: payload.address,
      subtotal: payload.subtotal,
      deliveryFee: payload.deliveryFee,
      total: payload.total,
    }),
  };
}

export async function retryPrintJob(user, id, options = {}) {
  requiredCapability(user, CAPABILITIES.PRINTER_OPERATE);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Print job tidak valid");
  const station = stationFor(user);
  return store.transaction(async (tx, mysql) => {
    const job = await tx.get(
      "SELECT id,order_id,station,status,payload_json FROM print_jobs WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!job) throw new DomainError("Print job tidak ditemukan", 404);
    if (job.station !== station) throw new DomainError("Akses ditolak", 403);
    const state = bridgeState(job);
    if (
      ![
        "FAILED",
        "UNKNOWN",
        "SENT",
        "CONFIRMED",
        "UNVERIFIED",
        "SIMULATED",
      ].includes(state)
    )
      throw new DomainError("Print job belum dapat diulang", 409);
    if (state !== "FAILED" && options.acknowledgeDuplicateRisk !== true)
      throw new DomainError(
        "Periksa kertas dan konfirmasi risiko cetak ganda",
        409,
      );
    const payload = parsePrintPayload(job.payload_json);
    payload._bridge = { state: "QUEUED" };
    await tx.run(
      "UPDATE print_jobs SET status='QUEUED',reprint_count=reprint_count+1,payload_json=?,error_message=NULL,printed_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      JSON.stringify(payload),
      id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PRINT_JOB_RETRIED",
      JSON.stringify({ printJobId: id, orderId: job.order_id, station }),
    );
    return { id, status: "QUEUED" };
  });
}
