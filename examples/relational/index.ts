import { createSeed } from "testseed";

export function run() {
  const seed = createSeed({ seed: "shop" });
  const user = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName() }, { name: "user" });
  const product = seed.factory({ id: (_g, c) => c.sequence, price: (g) => g.number.int({ min: 5, max: 500 }) }, { name: "product" });
  const order = seed.factory(
    { id: (_g, c) => c.sequence, status: (g) => g.helpers.pick(["new", "paid", "shipped"] as const) },
    { name: "order" },
  );
  const item = seed.factory({ id: (_g, c) => c.sequence, qty: (g) => g.number.int({ min: 1, max: 5 }) }, { name: "item" });

  return seed.dataset({
    users: { factory: user, count: 10 },
    products: { factory: product, count: 20 },
    // Most orders come from a few heavy users:
    orders: { factory: order, count: 40, refs: { userId: { to: "users", distribution: "zipf" } } },
    // Every order has 1-4 items; each item points at a product.
    items: {
      factory: item,
      perParent: { ref: "orderId", min: 1, max: 4 },
      refs: { orderId: { to: "orders" }, productId: { to: "products" } },
    },
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = run();
  console.log(Object.fromEntries(Object.entries(data).map(([k, v]) => [k, v.length])));
}
