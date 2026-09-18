type PaymentStatus = "pending" | "paid" | "failed" | "expired";

type Fixture = {
  payment: PaymentStatus;
  stock: "reserved" | "committed" | "released";
  fulfillments: number;
  sales: number;
  loyaltyEarns: number;
};

function applyVerifiedEvent(f: Fixture, next: PaymentStatus) {
  if (f.payment === "paid" || f.payment === "failed" || f.payment === "expired") {
    return f; // terminal state: duplicate/repeated event has no side effects
  }

  if (next === "paid") {
    return { ...f, payment: "paid" as const, stock: "committed" as const, fulfillments: 2 };
  }

  if (next === "failed" || next === "expired") {
    return { ...f, payment: next, stock: "released" as const };
  }

  return f;
}

function completeOrder(f: Fixture) {
  if (f.payment !== "paid") throw new Error("cannot complete unpaid order");
  if (f.sales === 0) return { ...f, sales: 1, loyaltyEarns: f.loyaltyEarns + 1 };
  return f;
}

Deno.test("paid event creates fulfillment and commits stock exactly once", () => {
  const initial: Fixture = { payment: "pending", stock: "reserved", fulfillments: 0, sales: 0, loyaltyEarns: 0 };
  const once = applyVerifiedEvent(initial, "paid");
  const twice = applyVerifiedEvent(once, "paid");

  if (once.payment !== "paid") throw new Error("payment was not paid");
  if (once.stock !== "committed") throw new Error("stock was not committed");
  if (once.fulfillments !== 2) throw new Error("fulfillment streams were not created");
  if (twice.fulfillments !== 2) throw new Error("duplicate paid event created fulfillment again");
});

Deno.test("failed event releases stock exactly once", () => {
  const initial: Fixture = { payment: "pending", stock: "reserved", fulfillments: 0, sales: 0, loyaltyEarns: 0 };
  const once = applyVerifiedEvent(initial, "failed");
  const twice = applyVerifiedEvent(once, "failed");

  if (once.stock !== "released") throw new Error("stock was not released");
  if (twice.stock !== "released") throw new Error("duplicate failed event changed stock again");
  if (twice.fulfillments !== 0) throw new Error("failed payment created fulfillment");
});

Deno.test("completion creates exactly one sale and one loyalty earn", () => {
  const paid: Fixture = { payment: "paid", stock: "committed", fulfillments: 2, sales: 0, loyaltyEarns: 0 };
  const once = completeOrder(paid);
  const twice = completeOrder(once);

  if (once.sales !== 1) throw new Error("sale was not created");
  if (once.loyaltyEarns !== 1) throw new Error("loyalty was not earned");
  if (twice.sales !== 1) throw new Error("duplicate completion created another sale");
  if (twice.loyaltyEarns !== 1) throw new Error("duplicate completion earned loyalty twice");
});
