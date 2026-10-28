import type { Seed } from "@mohsinzia/testseed";

/** Users, orders and items with foreign keys that always resolve. */
export function shop(seed: Seed, orders: number) {
  const id = (_g: unknown, c: { sequence: number }) => c.sequence;
  const user = seed.factory({ id, name: (g) => g.person.fullName() }, { name: "user" });
  const order = seed.factory({ id, status: (g) => g.helpers.pick(["new", "paid", "shipped"] as const) }, { name: "order" });
  const item = seed.factory({ id, qty: (g) => g.number.int({ min: 1, max: 5 }) }, { name: "item" });
  return seed.dataset({
    users: { factory: user, count: 5 },
    orders: { factory: order, count: orders, refs: { userId: { to: "users", distribution: "zipf" } } },
    items: { factory: item, perParent: { ref: "orderId", min: 1, max: 3 }, refs: { orderId: { to: "orders" } } },
  });
}
