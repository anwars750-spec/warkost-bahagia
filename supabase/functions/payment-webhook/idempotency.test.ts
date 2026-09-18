type Event = { provider: string; eventId: string };
type EventState = "received" | "processed" | "duplicate";

function acceptEvent(store: Map<string, EventState>, event: Event): EventState {
  const key = event.provider + ":" + event.eventId;
  const existing = store.get(key);
  if (existing === "processed") return "duplicate";
  store.set(key, "processed");
  return "processed";
}

Deno.test("duplicate webhook has no second effect", () => {
  const store = new Map<string, EventState>();
  const event = { provider: "test", eventId: "evt-100" };
  const first = acceptEvent(store, event);
  const second = acceptEvent(store, event);
  if (first !== "processed") throw new Error("first event was not processed");
  if (second !== "duplicate") throw new Error("duplicate event was processed twice");
  if (store.size !== 1) throw new Error("duplicate created another event record");
});

Deno.test("same event id from different providers is independent", () => {
  const store = new Map<string, EventState>();
  if (acceptEvent(store, { provider: "btn", eventId: "evt-200" }) !== "processed") throw new Error("BTN event failed");
  if (acceptEvent(store, { provider: "gateway", eventId: "evt-200" }) !== "processed") throw new Error("gateway event incorrectly treated as duplicate");
  if (store.size !== 2) throw new Error("provider namespace collision");
});
