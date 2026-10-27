import { describe, expect, it } from "vitest";
import { ConfigError, createSeed, CyclicDependencyError, RelationshipError } from "../../src/index.js";

function world(seedValue: number | string = 1) {
  const seed = createSeed({ seed: seedValue });
  const user = seed.factory({ id: (_g, c) => `u${c.sequence}`, name: (g) => g.person.fullName() }, { name: "user" });
  const product = seed.factory({ id: (_g, c) => c.sequence, price: (g) => g.number.int({ min: 1, max: 100 }) }, { name: "product" });
  const order = seed.factory({ id: (_g, c) => c.sequence, status: (g) => g.helpers.pick(["new", "paid"] as const) }, { name: "order" });
  const item = seed.factory({ id: (_g, c) => c.sequence, qty: (g) => g.number.int({ min: 1, max: 5 }) }, { name: "item" });
  return { seed, user, product, order, item };
}

describe("dataset: referential integrity and cardinality", () => {
  it("every foreign key points at an existing parent (users -> orders -> items <- products)", () => {
    const { seed, user, product, order, item } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 10 },
      products: { factory: product, count: 15 },
      orders: { factory: order, count: 40, refs: { userId: { to: "users" } } },
      items: { factory: item, count: 120, refs: { orderId: { to: "orders" }, productId: { to: "products" } } },
    });
    const userIds = new Set(ds.users.map((u) => u.id));
    const orderIds = new Set(ds.orders.map((o) => o.id));
    const productIds = new Set(ds.products.map((p) => p.id));
    expect(ds.orders.every((o) => userIds.has(o.userId as string))).toBe(true);
    expect(ds.items.every((i) => orderIds.has(i.orderId as number) && productIds.has(i.productId as number))).toBe(true);
    expect(ds.items).toHaveLength(120);
  });

  it("generates children even when the child table is declared before its parent", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      orders: { factory: order, count: 5, refs: { userId: { to: "users" } } },
      users: { factory: user, count: 3 },
    });
    expect(Object.keys(ds)).toEqual(["orders", "users"]);
    expect(ds.orders.every((o) => ds.users.some((u) => u.id === o.userId))).toBe(true);
  });

  it("is deterministic and pure", () => {
    const spec = (w: ReturnType<typeof world>) => ({
      users: { factory: w.user, count: 8 },
      orders: { factory: w.order, count: 20, refs: { userId: { to: "users" } } },
    });
    const a = world(9);
    expect(a.seed.dataset(spec(a))).toEqual(a.seed.dataset(spec(a)));
    const b = world(9);
    expect(b.seed.dataset(spec(b))).toEqual(a.seed.dataset(spec(a)));
    const c = world(10);
    expect(c.seed.dataset(spec(c))).not.toEqual(a.seed.dataset(spec(a)));
  });

  it("one-to-one: unique refs use each parent at most once", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 10 },
      profiles: { factory: order, count: 10, refs: { userId: { to: "users", unique: true } } },
    });
    expect(new Set(ds.profiles.map((p) => p.userId)).size).toBe(10);
  });

  it("one-to-one with more children than parents is an impossible constraint", () => {
    const { seed, user, order } = world();
    expect(() =>
      seed.dataset({
        users: { factory: user, count: 3 },
        profiles: { factory: order, count: 4, refs: { userId: { to: "users", unique: true } } },
      }),
    ).toThrowError(RelationshipError);
  });

  it("many-to-many through a join table with uniqueTogether never repeats a pair", () => {
    const { seed, user, product, item } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 6 },
      products: { factory: product, count: 5 },
      likes: {
        factory: item,
        count: 30,
        refs: { userId: { to: "users" }, productId: { to: "products" } },
        uniqueTogether: ["userId", "productId"],
      },
    });
    const pairs = ds.likes.map((l) => `${l.userId}|${l.productId}`);
    expect(new Set(pairs).size).toBe(30);
  });

  it("uniqueTogether capacity is checked up front", () => {
    const { seed, user, product, item } = world();
    expect(() =>
      seed.dataset({
        users: { factory: user, count: 2 },
        products: { factory: product, count: 2 },
        likes: {
          factory: item,
          count: 5,
          refs: { userId: { to: "users" }, productId: { to: "products" } },
          uniqueTogether: ["userId", "productId"],
        },
      }),
    ).toThrowError(/at most 4 distinct combinations/);
  });

  it("array refs ('many') hold distinct existing keys within the requested size", () => {
    const { seed, product, order } = world();
    const ds = seed.dataset({
      categories: { factory: product, count: 6 },
      posts: { factory: order, count: 50, refs: { categoryIds: { to: "categories", many: { min: 1, max: 3 } } } },
    });
    const ids = new Set(ds.categories.map((c) => c.id));
    for (const p of ds.posts) {
      expect(p.categoryIds.length).toBeGreaterThanOrEqual(1);
      expect(p.categoryIds.length).toBeLessThanOrEqual(3);
      expect(new Set(p.categoryIds).size).toBe(p.categoryIds.length);
      expect(p.categoryIds.every((c) => ids.has(c as number))).toBe(true);
    }
  });

  it("perParent: each parent gets min..max children and count is derived", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 20 },
      orders: { factory: order, perParent: { ref: "userId", min: 0, max: 3 }, refs: { userId: { to: "users" } } },
    });
    const per = new Map<string, number>();
    for (const o of ds.orders) per.set(o.userId as string, (per.get(o.userId as string) ?? 0) + 1);
    for (const u of ds.users) expect(per.get(u.id) ?? 0).toBeLessThanOrEqual(3);
    expect(ds.orders.length).toBeLessThanOrEqual(60);
    expect(ds.orders.length).toBeGreaterThan(0);
  });

  it("nullable refs produce both null and valid keys; nullable: 1 allows empty parents", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 5 },
      orders: { factory: order, count: 200, refs: { userId: { to: "users", nullable: 0.5 } } },
    });
    expect(ds.orders.some((o) => o.userId === null)).toBe(true);
    expect(ds.orders.some((o) => o.userId !== null)).toBe(true);
    const empty = seed.dataset({
      users: { factory: user, count: 0 },
      orders: { factory: order, count: 3, refs: { userId: { to: "users", nullable: 1 } } },
    });
    expect(empty.orders.every((o) => o.userId === null)).toBe(true);
  });

  it("empty parent collection with a required reference is a clear error", () => {
    const { seed, user, order } = world();
    expect(() =>
      seed.dataset({ users: { factory: user, count: 0 }, orders: { factory: order, count: 3, refs: { userId: { to: "users" } } } }),
    ).toThrowError(/no rows/);
  });

  it("empty children and empty everything are fine", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 0 },
      orders: { factory: order, count: 0, refs: { userId: { to: "users" } } },
    });
    expect(ds).toEqual({ users: [], orders: [] });
  });

  it("zipf distribution concentrates children on early parents; custom distribution is honoured and validated", () => {
    const { seed, user, order } = world();
    const ds = seed.dataset({
      users: { factory: user, count: 20 },
      orders: { factory: order, count: 5000, refs: { userId: { to: "users", distribution: "zipf" } } },
    });
    const first = ds.orders.filter((o) => o.userId === "u1").length;
    const last = ds.orders.filter((o) => o.userId === "u20").length;
    expect(first).toBeGreaterThan(last * 5);
    const fixed = seed.dataset({
      users: { factory: user, count: 4 },
      orders: { factory: order, count: 10, refs: { userId: { to: "users", distribution: () => 2 } } },
    });
    expect(fixed.orders.every((o) => o.userId === "u3")).toBe(true);
    expect(() =>
      seed.dataset({
        users: { factory: user, count: 4 },
        orders: { factory: order, count: 2, refs: { userId: { to: "users", distribution: () => 9 } } },
      }),
    ).toThrow(RelationshipError);
  });

  it("detects cycles and names them; rejects self references", () => {
    const { seed, user, order } = world();
    try {
      seed.dataset({
        a: { factory: user, count: 1, refs: { bId: { to: "b" } } },
        b: { factory: order, count: 1, refs: { aId: { to: "a" } } },
      });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(CyclicDependencyError);
      expect((e as CyclicDependencyError).cycle).toEqual(["a", "b", "a"]);
    }
    expect(() => seed.dataset({ a: { factory: user, count: 1, refs: { parent: { to: "a" } } } })).toThrow(CyclicDependencyError);
  });

  it("rejects unknown tables, non-referenceable keys and duplicate keys", () => {
    const { seed, user, order } = world();
    expect(() => seed.dataset({ o: { factory: order, count: 1, refs: { u: { to: "nope" } } } })).toThrowError(/unknown table "nope"/);
    const noId = seed.factory({ name: "x" });
    expect(() => seed.dataset({ u: { factory: noId, count: 2 }, o: { factory: order, count: 1, refs: { u: { to: "u" } } } })).toThrowError(
      /must be a string or number/,
    );
    const dup = seed.factory({ id: 1 });
    expect(() => seed.dataset({ u: { factory: dup, count: 2 }, o: { factory: order, count: 1, refs: { u: { to: "u" } } } })).toThrowError(
      /not unique/,
    );
    void user;
  });

  it("validates counts, count/perParent exclusivity and limits", () => {
    const { seed, user, order } = world();
    expect(() => seed.dataset({ u: { factory: user, count: -1 } })).toThrow(ConfigError);
    expect(() => seed.dataset({ u: { factory: user } })).toThrow(ConfigError);
    expect(() => seed.dataset({})).toThrow(ConfigError);
    expect(() =>
      seed.dataset({
        u: { factory: user, count: 1 },
        o: { factory: order, count: 1, perParent: { ref: "u", min: 0, max: 1 }, refs: { u: { to: "u" } } },
      }),
    ).toThrow(ConfigError);
    const limited = createSeed({ seed: 1, limits: { maxCount: 5 } });
    expect(() => limited.dataset({ u: { factory: user, count: 6 } })).toThrow(ConfigError);
  });

  it("the same factory used for two tables yields independent data", () => {
    const { seed, user } = world();
    const ds = seed.dataset({ a: { factory: user, count: 5 }, b: { factory: user, count: 5 } });
    expect(ds.a.map((x) => x.name)).not.toEqual(ds.b.map((x) => x.name));
  });
});
