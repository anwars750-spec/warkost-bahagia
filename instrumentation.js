export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startQrisAutoConfirmWorker } =
    await import("./lib/qris-auto-confirm-worker.mjs");
  startQrisAutoConfirmWorker();
}
