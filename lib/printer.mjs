import * as store from "./store.mjs";
import { DomainError, requiredCapability } from "./domain.mjs";
import { CAPABILITIES } from "./rbac.mjs";

const stationFor = (user) =>
  user.role === "KITCHEN" ? "KITCHEN" : user.role === "ADMIN" ? "ADMIN" : null;

export async function listPrintJobs(user) {
  requiredCapability(user, CAPABILITIES.PRINTER_READ);
  const station = stationFor(user);
  return store.all(
    "SELECT id,order_id,station,status,printer_key,attempts,reprint_count,error_message,created_at,updated_at,printed_at FROM print_jobs" +
      (station ? " WHERE station=?" : "") +
      " ORDER BY id DESC LIMIT 100",
    ...(station ? [station] : []),
  );
}

export async function retryPrintJob(user, id) {
  requiredCapability(user, CAPABILITIES.PRINTER_OPERATE);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Print job tidak valid");
  const station = stationFor(user);
  return store.transaction(async (tx, mysql) => {
    const job = await tx.get(
      "SELECT id,order_id,station,status FROM print_jobs WHERE id=?" +
        (mysql ? " FOR UPDATE" : ""),
      id,
    );
    if (!job) throw new DomainError("Print job tidak ditemukan", 404);
    if (job.station !== station) throw new DomainError("Akses ditolak", 403);
    if (!["FAILED", "PRINTED", "REPRINTED"].includes(job.status))
      throw new DomainError("Print job belum dapat diulang", 409);
    await tx.run(
      "UPDATE print_jobs SET status='REPRINTED',attempts=attempts+1,reprint_count=reprint_count+1,error_message=NULL,printed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      id,
    );
    await tx.run(
      "INSERT INTO audit_logs(actor_id,action,details) VALUES(?,?,?)",
      user.id,
      "PRINT_JOB_RETRIED",
      JSON.stringify({ printJobId: id, orderId: job.order_id, station }),
    );
    return { id, status: "REPRINTED" };
  });
}
