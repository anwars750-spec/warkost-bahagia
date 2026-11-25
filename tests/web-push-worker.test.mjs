import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const code = fs.readFileSync(
  new URL("../public/sw.js", import.meta.url),
  "utf8",
);
function worker({ allowed = true, windows = [] } = {}) {
  const handlers = {},
    shown = [],
    opened = [],
    closed = [];
  const self = {
    location: { origin: "https://warkost.test" },
    addEventListener: (name, handler) => (handlers[name] = handler),
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => windows,
      openWindow: async (url) => opened.push(url),
    },
    registration: {
      showNotification: async (title, options) =>
        shown.push({ title, ...options }),
      getNotifications: async () => [{ close: () => closed.push(true) }],
    },
  };
  vm.runInNewContext(code, {
    self,
    URL,
    fetch: async () => ({ ok: true, json: async () => ({ allowed }) }),
  });
  async function trigger(name, data) {
    let done;
    handlers[name]({ ...data, waitUntil: (promise) => (done = promise) });
    await done;
  }
  return { handlers, shown, opened, closed, trigger };
}
const payload = {
  orderId: 42,
  eventType: "ORDER_CONFIRMED",
  body: "Pesanan #42 dikonfirmasi.",
  url: "https://evil.test/",
  deliveryKey: "a".repeat(64),
};
test("actual service worker push handler authenticates receipt, limits content and uses stable tag", async () => {
  const w = worker();
  assert.equal(typeof w.handlers.push, "function");
  assert.equal(typeof w.handlers.notificationclick, "function");
  await w.trigger("push", { data: { json: () => payload } });
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].data.url, "/?pushOrder=42");
  assert.equal(w.shown[0].tag, "warkost:ORDER_CONFIRMED:42");
  const unauthorized = worker({ allowed: false });
  await unauthorized.trigger("push", { data: { json: () => payload } });
  assert.equal(unauthorized.shown.length, 0);
  await w.trigger("push", {
    data: {
      json: () => {
        throw Error("bad payload");
      },
    },
  });
  assert.equal(w.shown.length, 1);
});
test("notificationclick opens only same-origin order area; account switch/revoked receipt opens safe root", async () => {
  const w = worker();
  let closed = false;
  await w.trigger("notificationclick", {
    notification: { data: payload, close: () => (closed = true) },
  });
  assert.equal(closed, true);
  assert.equal(w.opened[0], "https://warkost.test/?pushOrder=42");
  const revoked = worker({ allowed: false });
  await revoked.trigger("notificationclick", {
    notification: { data: payload, close() {} },
  });
  assert.equal(revoked.opened[0], "https://warkost.test/");
});
test("notificationclick focuses existing same-origin window; logout closes shown notifications", async () => {
  const navigated = [],
    focused = [];
  const client = {
    url: "https://warkost.test/",
    navigate: async (url) => navigated.push(url),
    focus: async () => focused.push(true),
  };
  const w = worker({ windows: [{ url: "https://evil.test/" }, client] });
  await w.trigger("notificationclick", {
    notification: { data: payload, close() {} },
  });
  assert.equal(navigated[0], "https://warkost.test/?pushOrder=42");
  assert.equal(focused.length, 1);
  assert.equal(w.opened.length, 0);
  await w.trigger("message", { data: { type: "WARKOST_SESSION_ENDED" } });
  assert.equal(w.closed.length, 1);
});
test("private VAPID configuration has no client import/path; service worker never caches authentication", () => {
  const client = fs.readFileSync(
    new URL("../app/PushNotificationSettings.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    client,
    /WEB_PUSH_VAPID_PRIVATE_KEY|web-push-config|push-dispatcher|from ["']web-push/,
  );
  assert.doesNotMatch(code, /caches\.|addEventListener\(["']fetch/);
  assert.match(client, /Notification\.requestPermission/);
  assert.match(client, /action: "unsubscribe"/);
});

test("chat push uses unique message tag, safe conversation entry and session validation on display/click", async () => {
  const chat = {
    ...payload,
    eventType: "CHAT_MESSAGE",
    orderId: undefined,
    conversationId: 23,
    messageId: 87,
    body: "Pesan baru dari Warkost.",
  };
  const w = worker();
  await w.trigger("push", { data: { json: () => chat } });
  assert.equal(w.shown[0].tag, "warkost:CHAT_MESSAGE:23:87");
  assert.equal(w.shown[0].data.url, "/?conversationId=23");
  await w.trigger("notificationclick", {
    notification: { data: w.shown[0].data, close() {} },
  });
  assert.equal(w.opened[0], "https://warkost.test/?conversationId=23");
  const revoked = worker({ allowed: false });
  await revoked.trigger("push", { data: { json: () => chat } });
  assert.equal(revoked.shown.length, 0);
  await revoked.trigger("notificationclick", {
    notification: { data: chat, close() {} },
  });
  assert.equal(revoked.opened[0], "https://warkost.test/");
  const malformed = worker();
  await malformed.trigger("notificationclick", {
    notification: {
      data: { ...chat, conversationId: "https://evil.test" },
      close() {},
    },
  });
  assert.equal(malformed.opened[0], "https://warkost.test/");
});
