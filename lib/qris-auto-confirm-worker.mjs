import {
  QRIS_AUTO_CONFIRM_DELAY_MS,
  sweepPaidQrisAutoConfirm,
} from "./domain.mjs";
import { publishActionRealtime } from "./realtime.mjs";

export const QRIS_AUTO_CONFIRM_SWEEP_INTERVAL_MS = 5_000;
const WORKER_KEY = Symbol.for("warkost.qris.auto-confirm.v1");

function workerState() {
  if (!globalThis[WORKER_KEY])
    globalThis[WORKER_KEY] = {
      timer: null,
      running: null,
    };
  return globalThis[WORKER_KEY];
}

export async function runQrisAutoConfirmSweep(options = {}) {
  const result = await sweepPaidQrisAutoConfirm({
    delayMs: QRIS_AUTO_CONFIRM_DELAY_MS,
    ...options,
  });
  for (const order of result.confirmed) {
    try {
      await publishActionRealtime(
        "status",
        null,
        { orderId: order.id, status: "CONFIRMED" },
        order,
      );
    } catch (error) {
      console.error("QRIS auto-confirm realtime publication failed", {
        orderId: order.id,
        error,
      });
    }
  }
  return result;
}

export function startQrisAutoConfirmWorker({
  intervalMs = Number(process.env.QRIS_AUTO_CONFIRM_SWEEP_MS) ||
    QRIS_AUTO_CONFIRM_SWEEP_INTERVAL_MS,
  runImmediately = true,
} = {}) {
  if (process.env.QRIS_AUTO_CONFIRM_WORKER_DISABLED === "true") return null;
  const state = workerState();
  if (state.timer) return state.timer;
  const safeInterval = Math.max(1_000, Number(intervalMs) || 5_000);
  const run = () => {
    if (state.running) return state.running;
    state.running = runQrisAutoConfirmSweep()
      .catch((error) => console.error("QRIS auto-confirm sweep failed", error))
      .finally(() => {
        state.running = null;
      });
    return state.running;
  };
  state.timer = setInterval(run, safeInterval);
  state.timer.unref?.();
  if (runImmediately) void run();
  return state.timer;
}

export function stopQrisAutoConfirmWorker() {
  const state = workerState();
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}
