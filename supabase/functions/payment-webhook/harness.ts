export type HarnessCase = {
  name: string;
  expectedStatus: number;
  body: Record<string, unknown>;
  signature: "valid" | "invalid" | "missing";
};

export const PAYMENT_HARNESS_CASES: HarnessCase[] = [
  { name: "valid webhook envelope", expectedStatus: 200, body: { event_id: "evt-harness-001", status: "paid" }, signature: "valid" },
  { name: "missing signature", expectedStatus: 503, body: { event_id: "evt-harness-002" }, signature: "missing" },
  { name: "invalid signature", expectedStatus: 401, body: { event_id: "evt-harness-003" }, signature: "invalid" },
  { name: "empty body", expectedStatus: 400, body: {}, signature: "valid" },
];

export function assertHarness(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}
