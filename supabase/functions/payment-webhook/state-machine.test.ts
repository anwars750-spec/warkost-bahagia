type Status = "pending" | "paid" | "failed" | "expired";

const allowed: Record<Status, Status[]> = {
  pending: ["paid", "failed", "expired"],
  paid: ["paid"],
  failed: ["failed"],
  expired: ["expired"],
};

function transition(from: Status, to: Status) {
  return allowed[from].includes(to);
}

const cases: Array<[Status, Status, boolean]> = [
  ["pending", "paid", true],
  ["pending", "failed", true],
  ["pending", "expired", true],
  ["paid", "paid", true],
  ["failed", "failed", true],
  ["expired", "expired", true],
  ["paid", "failed", false],
  ["paid", "expired", false],
  ["failed", "paid", false],
  ["expired", "paid", false],
];

for (const [from, to, expected] of cases) {
  Deno.test(`transition ${from} -> ${to}`, () => {
    if (transition(from, to) !== expected) {
      throw new Error(`unexpected transition result for ${from} -> ${to}`);
    }
  });
}
