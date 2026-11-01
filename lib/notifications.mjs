import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";
export async function listNotifications(user) {
  required(user, [
    "CUSTOMER",
    "ADMIN",
    "MANAGER",
    "DRIVER",
    "KITCHEN",
    "OWNER",
  ]);
  const notifications = await store.all(
    "SELECT id,message,read_at,created_at FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50",
    user.id,
  );
  const unread = (
    await store.get(
      "SELECT COUNT(*) count FROM notifications WHERE user_id=? AND read_at IS NULL",
      user.id,
    )
  ).count;
  return { notifications, unread };
}
export async function readNotification(user, id) {
  required(user, [
    "CUSTOMER",
    "ADMIN",
    "MANAGER",
    "DRIVER",
    "KITCHEN",
    "OWNER",
  ]);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new DomainError("Notifikasi tidak valid");
  await store.run(
    "UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=? AND read_at IS NULL",
    id,
    user.id,
  );
  return { ok: true };
}
