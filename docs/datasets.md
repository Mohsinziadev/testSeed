# Relational Datasets

`seed.dataset()` generates related tables in memory, in dependency order, with foreign keys that always resolve. No database is involved.

```ts
const data = seed.dataset({
  users: { factory: user, count: 10 },
  products: { factory: product, count: 20 },
  orders: { factory: order, count: 40, refs: { userId: { to: "users", distribution: "zipf" } } },
  items: {
    factory: item,
    perParent: { ref: "orderId", min: 1, max: 4 },
    refs: { orderId: { to: "orders" }, productId: { to: "products" } },
  },
});
// data.orders[0].userId is a real users[].id; data.items[*].orderId/productId exist.
```

## Reference options

| Option         | Meaning                                                           |
| -------------- | ----------------------------------------------------------------- |
| `to`           | The parent table.                                                 |
| `key`          | The parent field to reference. Default `id`.                      |
| `unique`       | One-to-one: each parent is referenced at most once.               |
| `nullable`     | Probability that the reference is `null`.                         |
| `many`         | `{ min, max }`: an array of distinct parent keys.                 |
| `distribution` | `"uniform"`, `"zipf"` (a few heavy parents) or `(n, g) => index`. |

Other table options: `perParent` (generate children per parent row) and `uniqueTogether` (a join table where a combination of references must be unique).

```ts
likes: { factory, count: 30, refs: { userId: { to: "users" }, postId: { to: "posts" } }, uniqueTogether: ["userId", "postId"] },
```

Parents must expose a unique string or number key. Duplicate keys throw.

## Errors

- `CyclicDependencyError` names the cycle. Self-referencing tables are not supported.
- `RelationshipError` covers an unknown table, one-to-one with more children than parents, `uniqueTogether` capacity exceeded, referencing an empty table, and duplicate or non-primitive parent keys.

Result rows are typed `Built<F> & { [ref]: string | number }` (with `null` or arrays where you asked for them). The exact parent key type is not tracked.

Runnable: [`examples/relational`](../examples/relational/index.ts).
