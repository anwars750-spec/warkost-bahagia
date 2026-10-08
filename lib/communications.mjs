import * as store from "./store.mjs";
import { DomainError, required } from "./domain.mjs";

export const CONVERSATION_TYPES = Object.freeze({
  ADMIN: "CUSTOMER_ADMIN",
  DRIVER: "CUSTOMER_DRIVER",
});

export const CONVERSATION_STATUSES = Object.freeze({
  OPEN: "OPEN",
  HANDLED: "HANDLED",
  CLOSED: "CLOSED",
});

const DRIVER_CHAT_PHASES = new Set(["ASSIGNED", "PICKED_UP", "ON_DELIVERY"]);

const threadKey = (type, orderId, driverId = null) =>
  type === CONVERSATION_TYPES.ADMIN
    ? `CUSTOMER_ADMIN:${orderId}`
    : `CUSTOMER_DRIVER:${orderId}:${driverId}`;

function validId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new DomainError(`${label} tidak valid`);
}

function validType(type) {
  if (!Object.values(CONVERSATION_TYPES).includes(type))
    throw new DomainError("Tipe percakapan tidak valid");
}

async function orderContext(source, orderId, mysql = false) {
  return source.get(
    `SELECT o.id,o.customer_id,o.status,o.total,o.created_at,
            a.detail delivery_address,p.method payment_method,p.status payment_status,
            cu.name customer_name,d.driver_id assigned_driver_id,du.name driver_name
       FROM orders o
       JOIN addresses a ON a.id=o.address_id
       JOIN payments p ON p.order_id=o.id
       JOIN users cu ON cu.id=o.customer_id
       LEFT JOIN deliveries d ON d.order_id=o.id
       LEFT JOIN users du ON du.id=d.driver_id
      WHERE o.id=?${mysql ? " FOR UPDATE" : ""}`,
    orderId,
  );
}

async function conversationContext(source, conversationId, mysql = false) {
  return source.get(
    `SELECT c.*,
            o.status order_status,o.total,o.created_at order_created_at,
            a.detail delivery_address,p.method payment_method,p.status payment_status,
            cu.name customer_name,d.driver_id assigned_driver_id,du.name driver_name
       FROM conversations c
       JOIN orders o ON o.id=c.order_id
       JOIN addresses a ON a.id=o.address_id
       JOIN payments p ON p.order_id=o.id
       JOIN users cu ON cu.id=c.customer_id
       LEFT JOIN deliveries d ON d.order_id=o.id
       LEFT JOIN users du ON du.id=d.driver_id
      WHERE c.id=?${mysql ? " FOR UPDATE" : ""}`,
    conversationId,
  );
}

function authorizeRead(user, conversation) {
  required(user, ["CUSTOMER", "ADMIN", "DRIVER"]);
  if (user.role === "CUSTOMER") {
    if (Number(conversation.customer_id) !== Number(user.id))
      throw new DomainError("Percakapan tidak ditemukan", 404);
    return;
  }
  if (user.role === "ADMIN") {
    if (conversation.type !== CONVERSATION_TYPES.ADMIN)
      throw new DomainError("Akses percakapan ditolak", 403);
    return;
  }
  if (
    conversation.type !== CONVERSATION_TYPES.DRIVER ||
    Number(conversation.driver_id) !== Number(user.id) ||
    Number(conversation.assigned_driver_id) !== Number(user.id)
  )
    throw new DomainError("Akses percakapan ditolak", 403);
}

function authorizeSend(user, conversation) {
  authorizeRead(user, conversation);
  if (conversation.status === CONVERSATION_STATUSES.CLOSED)
    throw new DomainError("Percakapan sudah selesai", 409);
  if (
    conversation.type === CONVERSATION_TYPES.DRIVER &&
    !DRIVER_CHAT_PHASES.has(conversation.order_status)
  )
    throw new DomainError(
      conversation.order_status === "DELIVERED"
        ? "Percakapan Driver hanya dapat dibaca setelah pesanan selesai"
        : "Chat Driver belum tersedia pada fase pesanan ini",
      409,
    );
}

async function conversationMessages(source, conversationId) {
  return source.all(
    `SELECT m.id,m.sender_user_id,m.sender_role,m.message,m.created_at,m.read_at,u.name sender_name
       FROM conversation_messages m
       JOIN users u ON u.id=m.sender_user_id
      WHERE m.conversation_id=?
      ORDER BY m.id`,
    conversationId,
  );
}

async function markRead(source, conversationId, userId) {
  await source.run(
    "UPDATE conversation_messages SET read_at=COALESCE(read_at,CURRENT_TIMESTAMP) WHERE conversation_id=? AND sender_user_id!=? AND read_at IS NULL",
    conversationId,
    userId,
  );
}

async function serializeConversation(source, conversation, userId) {
  return {
    id: Number(conversation.id),
    type: conversation.type,
    status: conversation.status,
    customer: {
      id: Number(conversation.customer_id),
      name: conversation.customer_name,
    },
    driver: conversation.driver_id
      ? {
          id: Number(conversation.driver_id),
          name: conversation.driver_name || "Driver Warkost",
        }
      : null,
    order: {
      id: Number(conversation.order_id),
      display_number: `WB${String(conversation.order_id).padStart(6, "0")}`,
      status: conversation.order_status,
      payment_status: conversation.payment_status,
      payment_method: conversation.payment_method,
      total: Number(conversation.total),
      address: conversation.delivery_address,
    },
    can_send:
      conversation.status !== CONVERSATION_STATUSES.CLOSED &&
      (conversation.type !== CONVERSATION_TYPES.DRIVER ||
        DRIVER_CHAT_PHASES.has(conversation.order_status)),
    unread: Number(
      (
        await source.get(
          "SELECT COUNT(*) count FROM conversation_messages WHERE conversation_id=? AND sender_user_id!=? AND read_at IS NULL",
          conversation.id,
          userId,
        )
      ).count,
    ),
    created_at: conversation.created_at,
    updated_at: conversation.updated_at,
    closed_at: conversation.closed_at,
    messages: await conversationMessages(source, conversation.id),
  };
}

export async function openConversation(user, { type, orderId }) {
  required(user, ["CUSTOMER", "DRIVER"]);
  validType(type);
  validId(orderId, "Pesanan");
  return store.transaction(async (tx, mysql) => {
    const order = await orderContext(tx, orderId, mysql);
    if (!order) throw new DomainError("Pesanan tidak ditemukan", 404);
    if (
      user.role === "CUSTOMER" &&
      Number(order.customer_id) !== Number(user.id)
    )
      throw new DomainError("Pesanan tidak ditemukan", 404);

    let driverId = null;
    if (type === CONVERSATION_TYPES.ADMIN) {
      if (user.role !== "CUSTOMER")
        throw new DomainError("Akses percakapan ditolak", 403);
    } else {
      driverId = Number(order.assigned_driver_id || 0);
      if (!driverId) throw new DomainError("Driver belum ditugaskan", 409);
      if (user.role === "DRIVER" && driverId !== Number(user.id))
        throw new DomainError("Akses percakapan ditolak", 403);
    }

    const key = threadKey(type, orderId, driverId);
    let conversation = await tx.get(
      "SELECT id FROM conversations WHERE thread_key=?" +
        (mysql ? " FOR UPDATE" : ""),
      key,
    );
    if (!conversation) {
      if (
        type === CONVERSATION_TYPES.DRIVER &&
        !DRIVER_CHAT_PHASES.has(order.status)
      )
        throw new DomainError(
          "Chat Driver belum tersedia pada fase pesanan ini",
          409,
        );
      await tx.run(
        "INSERT OR IGNORE INTO conversations(thread_key,type,customer_id,order_id,driver_id,status) VALUES(?,?,?,?,?,'OPEN')",
        key,
        type,
        order.customer_id,
        orderId,
        driverId || null,
      );
      conversation = await tx.get(
        "SELECT id FROM conversations WHERE thread_key=?" +
          (mysql ? " FOR UPDATE" : ""),
        key,
      );
    }
    const context = await conversationContext(tx, Number(conversation.id));
    authorizeRead(user, context);
    await markRead(tx, context.id, user.id);
    return serializeConversation(tx, context, user.id);
  });
}

export async function getConversation(user, conversationId) {
  validId(conversationId, "Percakapan");
  return store.transaction(async (tx) => {
    const conversation = await conversationContext(tx, conversationId);
    if (!conversation) throw new DomainError("Percakapan tidak ditemukan", 404);
    authorizeRead(user, conversation);
    await markRead(tx, conversation.id, user.id);
    return serializeConversation(tx, conversation, user.id);
  });
}

export async function sendConversationMessage(
  user,
  { conversationId, message },
) {
  validId(conversationId, "Percakapan");
  const text = String(message || "").trim();
  if (!text || text.length > 1000)
    throw new DomainError("Pesan wajib diisi dan maksimal 1000 karakter");
  return store.transaction(async (tx, mysql) => {
    const conversation = await conversationContext(tx, conversationId, mysql);
    if (!conversation) throw new DomainError("Percakapan tidak ditemukan", 404);
    authorizeSend(user, conversation);
    const result = await tx.run(
      "INSERT INTO conversation_messages(conversation_id,sender_user_id,sender_role,message) VALUES(?,?,?,?)",
      conversation.id,
      user.id,
      user.role,
      text,
    );
    const nextStatus =
      conversation.type === CONVERSATION_TYPES.ADMIN && user.role === "CUSTOMER"
        ? CONVERSATION_STATUSES.OPEN
        : conversation.status;
    await tx.run(
      "UPDATE conversations SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
      nextStatus,
      conversation.id,
    );

    const orderLabel = `WB${String(conversation.order_id).padStart(6, "0")}`;
    if (conversation.type === CONVERSATION_TYPES.ADMIN) {
      if (user.role === "CUSTOMER") {
        for (const admin of await tx.all(
          "SELECT id FROM users WHERE role='ADMIN' AND active=1",
        ))
          await tx.run(
            "INSERT INTO notifications(user_id,message) VALUES(?,?)",
            admin.id,
            `Pesan Customer Service baru dari ${conversation.customer_name} · ${orderLabel}`,
          );
      } else
        await tx.run(
          "INSERT INTO notifications(user_id,message) VALUES(?,?)",
          conversation.customer_id,
          `Admin membalas bantuan pesanan ${orderLabel}`,
        );
    } else if (user.role === "CUSTOMER")
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        conversation.driver_id,
        `Pesan pengantaran baru dari ${conversation.customer_name} · ${orderLabel}`,
      );
    else
      await tx.run(
        "INSERT INTO notifications(user_id,message) VALUES(?,?)",
        conversation.customer_id,
        `Driver membalas koordinasi pengantaran ${orderLabel}`,
      );

    const updated = await conversationContext(tx, conversation.id);
    const messages = await conversationMessages(tx, conversation.id);
    return {
      conversation: await serializeConversation(tx, updated, user.id),
      message: messages.find(
        (item) => Number(item.id) === Number(result.lastInsertRowid),
      ),
    };
  });
}

export async function listAdminConversations(
  user,
  { filter = "all", query = "" } = {},
) {
  required(user, ["ADMIN"]);
  if (!new Set(["all", "unread", "active", "closed"]).has(filter))
    throw new DomainError("Filter percakapan tidak valid");
  const search = String(query || "")
    .trim()
    .slice(0, 80);
  const conditions = ["c.type='CUSTOMER_ADMIN'"];
  const params = [];
  if (filter === "unread") {
    conditions.push(
      "EXISTS (SELECT 1 FROM conversation_messages unread_message WHERE unread_message.conversation_id=c.id AND unread_message.sender_user_id!=? AND unread_message.read_at IS NULL)",
    );
    params.push(user.id);
  } else if (filter === "active")
    conditions.push("c.status IN ('OPEN','HANDLED')");
  else if (filter === "closed") conditions.push("c.status='CLOSED'");
  if (search) {
    conditions.push(
      "(LOWER(cu.name) LIKE ? OR CAST(c.order_id AS CHAR) LIKE ? OR LOWER(COALESCE(latest.message,'')) LIKE ?)",
    );
    const like = `%${search.toLowerCase()}%`;
    params.push(like, `%${search.replace(/\D/g, "") || search}%`, like);
  }
  const conversations = await store.all(
    `SELECT c.id,c.status,c.order_id,c.updated_at,c.created_at,
            cu.id customer_id,cu.name customer_name,
            o.status order_status,p.status payment_status,o.total,
            latest.message latest_message,latest.created_at latest_message_at,
            (SELECT COUNT(*) FROM conversation_messages unread_message WHERE unread_message.conversation_id=c.id AND unread_message.sender_user_id!=? AND unread_message.read_at IS NULL) unread_count
       FROM conversations c
       JOIN users cu ON cu.id=c.customer_id
       JOIN orders o ON o.id=c.order_id
       JOIN payments p ON p.order_id=o.id
       LEFT JOIN conversation_messages latest ON latest.id=(SELECT MAX(last_message.id) FROM conversation_messages last_message WHERE last_message.conversation_id=c.id)
      WHERE ${conditions.join(" AND ")}
      ORDER BY COALESCE(latest.created_at,c.updated_at) DESC,c.id DESC
      LIMIT 100`,
    user.id,
    ...params,
  );
  const totals = await store.get(
    `SELECT COUNT(*) total,
            COALESCE(SUM(CASE WHEN status IN ('OPEN','HANDLED') THEN 1 ELSE 0 END),0) active,
            COALESCE(SUM(CASE WHEN status='CLOSED' THEN 1 ELSE 0 END),0) closed,
            COALESCE(SUM(CASE WHEN EXISTS (SELECT 1 FROM conversation_messages m WHERE m.conversation_id=conversations.id AND m.sender_user_id!=? AND m.read_at IS NULL) THEN 1 ELSE 0 END),0) unread
       FROM conversations
      WHERE type='CUSTOMER_ADMIN'`,
    user.id,
  );
  return {
    conversations: conversations.map((item) => ({
      ...item,
      id: Number(item.id),
      order_id: Number(item.order_id),
      total: Number(item.total),
      unread_count: Number(item.unread_count),
      display_number: `WB${String(item.order_id).padStart(6, "0")}`,
    })),
    totals: {
      all: Number(totals.total || 0),
      unread: Number(totals.unread || 0),
      active: Number(totals.active || 0),
      closed: Number(totals.closed || 0),
    },
  };
}

export async function updateConversationStatus(user, conversationId, status) {
  required(user, ["ADMIN"]);
  validId(conversationId, "Percakapan");
  if (!Object.values(CONVERSATION_STATUSES).includes(status))
    throw new DomainError("Status percakapan tidak valid");
  return store.transaction(async (tx, mysql) => {
    const conversation = await conversationContext(tx, conversationId, mysql);
    if (!conversation) throw new DomainError("Percakapan tidak ditemukan", 404);
    if (conversation.type !== CONVERSATION_TYPES.ADMIN)
      throw new DomainError("Akses percakapan ditolak", 403);
    if (conversation.status !== status)
      await tx.run(
        `UPDATE conversations
            SET status=?,closed_at=${status === CONVERSATION_STATUSES.CLOSED ? "CURRENT_TIMESTAMP" : "NULL"},updated_at=CURRENT_TIMESTAMP
          WHERE id=?`,
        status,
        conversation.id,
      );
    const updated = await conversationContext(tx, conversation.id);
    return serializeConversation(tx, updated, user.id);
  });
}
