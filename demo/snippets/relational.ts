import { createSeed } from "seedset";

const seed = createSeed({ seed: "shop" });
const id = (_g: unknown, c: { sequence: number }) => c.sequence;
const user = seed.factory({ id, name: (g) => g.person.fullName() }, { name: "user" });
const order = seed.factory({ id, status: (g) => g.helpers.pick(["new", "paid", "shipped"] as const) }, { name: "order" });

const data = seed.dataset({
  users: { factory: user, count: 10 },
  orders: {
    factory: order,
    count: 40,
    refs: { userId: { to: "users", distribution: "zipf" } },
  },
});
// every data.orders[i].userId is a real data.users[].id
