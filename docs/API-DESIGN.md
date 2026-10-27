# API design

## Principles

1. **Everything is a pure function of (seed, definition, index).** Record _i_ of a factory never depends on how many records were generated or on other fields. This is what makes failures reproducible and fixtures stable under edits.
2. **No silent constraint violations.** Anything that cannot be satisfied throws a `TestSeedError` subclass with the path, constraint, seed and a hint. Generated values are re-validated against their schema before being returned.
3. **Compile-time and runtime checking agree.** Overrides are typed (`Partial<Built<F>>`) and, where a field has a schema, validated at runtime.
4. **Zero dependencies.** Validators are consumed through the structural [Standard Schema](https://standardschema.dev) interface; Zod/Valibot/ArkType schemas can also be exported to JSON Schema and imported.

## Deviations from the brief's illustrative examples (and why)

| Brief                                         | Final                                                | Reason                                                                                                                                                                                                                     |
| --------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name: () => seed.person.fullName()`          | `name: (g) => g.person.fullName()`                   | A callback that uses the shared `seed` consumes one global stream, so adding or reordering a field would shift every later value. `g` is a stream private to _(record, field)_. `seed.person` still exists for ad-hoc use. |
| `seed.edgeCases({ schema, count })`           | `seed.edgeCases(schema, { include, random, limit })` | Boundary and invalid cases are a finite, ordered set; `count` was ambiguous (cap? random count?). `limit` caps deterministic cases, `random` appends random valid values.                                                  |
| `generateWithReport(f, { count, seed })`      | same                                                 | Implemented as shown. `seed` runs on a fresh isolated instance with the same limits.                                                                                                                                       |
| `seed.dataset({ users: { factory, count } })` | same, plus `refs`, `perParent`, `uniqueTogether`     | Relationships are explicit in the spec; order is inferred by topological sort.                                                                                                                                             |

## Public surface

```ts
createSeed({ seed?, limits? }): Seed
```

`seed` is a finite number or a string. If omitted, a random 32-bit seed is drawn from `crypto.getRandomValues` and exposed as `seed.seed` (and included in every error), so even unseeded runs are replayable.

### Seed methods

| Method                                                                                                          | Behaviour                                                                                                                                       |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `factory(fields, { name?, traits?, validator?, maxAttempts? })`                                                 | Define a factory. A field is `(g, ctx) => value`, a `Schema`, or a constant. `name` labels the random stream.                                   |
| `build(factory, overrides?, { traits? })`                                                                       | Next record (per-factory counter on this instance). The n-th `build` equals `generate(f, n+1)[n]`.                                              |
| `generate(factoryOrSchema, count, { overrides?, traits?, start? })`                                             | In-memory, **pure** (same result every call). Throws above `limits.maxCount`.                                                                   |
| `sample(schema)`                                                                                                | One value from a schema (counter-based like `build`).                                                                                           |
| `stream` / `batches` / `batchesAsync`                                                                           | Lazy, bounded-memory, same records as `generate`. `batchesAsync` yields to the event loop and honours `AbortSignal`. Not limited by `maxCount`. |
| `dataset(spec)`                                                                                                 | Related tables in memory, pure.                                                                                                                 |
| `edgeCases(schema, options)`                                                                                    | Verified boundary / invalid / random cases.                                                                                                     |
| `generateWithReport(factory, { count, seed?, traits?, overrides? })`                                            | Collects failures instead of throwing; returns seed, config, failures, reproduce snippet.                                                       |
| `person`, `internet`, `number`, `string`, `text`, `date`, `location`, `phone`, `helpers`, `boolean()`, `uuid()` | Ad-hoc generators on one shared stream.                                                                                                         |

### Schemas

`t.string|number|int|boolean|null|literal|enum|date|dateString|array|object|union`, `.nullable()`, `.optional()` (only inside `t.object`). `Infer<typeof schema>` gives the TS type. `fromJsonSchema(json)` imports JSON Schema (returns `Schema<unknown>`). `validate(schema, value)` returns issues (path, constraint, message — never the value).

### Factory field semantics

- Function field → called with `(g, ctx)`; `ctx = { index, sequence, field, seed }`; `sequence = index + 1`.
- `Schema` field → generated from the schema; **overrides for this field are validated against it**.
- Constant → passed through by reference (not cloned).
- Traits replace field specs; later traits win; overrides win over traits.
- `validator` (any sync Standard Schema) checks every finished record. Failures retry up to `maxAttempts` on new deterministic sub-streams, then throw `GenerationError` with the validator's issues. If the failing paths are all caller-overridden fields it throws `OverrideError` immediately.

### Dataset specification

```ts
seed.dataset({
  users: { factory, count: 10 },
  orders: { factory, count: 40, refs: { userId: { to: "users", distribution: "zipf", nullable: 0.1 } } },
  items: { factory, perParent: { ref: "orderId", min: 1, max: 4 }, refs: { orderId: { to: "orders" }, productId: { to: "products" } } },
  likes: { factory, count: 30, refs: { userId: { to: "users" }, postId: { to: "posts" } }, uniqueTogether: ["userId", "postId"] },
  posts: { factory, count: 5, refs: { tagIds: { to: "tags", many: { min: 1, max: 3 } } } },
});
```

Reference options: `key` (parent field, default `id`), `unique` (one-to-one), `nullable` (probability), `many` (array of distinct keys), `distribution` (`"uniform" | "zipf" | (n, g) => index`).
Parents must expose a unique string/number key (checked; duplicate keys throw). Cycles and self-references throw `CyclicDependencyError` naming the cycle. Impossible constraints (one-to-one with more children than parents, `uniqueTogether` capacity, referencing an empty table) throw `RelationshipError`.
Result rows are typed `Built<F> & { [ref]: string | number (| null | array) }`; the exact parent key type is not tracked.

### Edge cases

Categories (`category`, `valid`): `boundary` (valid), `invalid`, `random` (valid). Every case has `label`, `path`, `constraint`. Valid cases were re-validated; invalid cases were verified to fail. Candidates whose verdict differs from the intended one (possible in unions) are **dropped, not relabelled**. Boundary cases larger than `limits` are omitted. Not exhaustive.

## Reproducibility guarantee

- `ALGORITHM_VERSION` (currently **1**) names the seeded algorithm. It is exported, included in reports, and pinned by golden tests (`tests/determinism/golden.test.ts`).
- **Within a release line the same (seed, factory, schema, options) yields identical output.** While the package is 0.x, the line is the **minor** version (`0.1.x` is stable; `0.2.0` may change output). From 1.0, the line is the **major** version.
- Any change to seeded output of a documented API (including the vocabulary lists, distribution constants such as the 0.8 optional-presence and 0.15 null probabilities, or the PRNG) is a breaking change: bump `ALGORITHM_VERSION` and the line.
- New generators and new options never alter existing output. Bug fixes that alter output are still breaking and are listed in the changelog.
- Output also depends on the JavaScript engine only through `Date` / `toISOString`, which is standardised; floating point arithmetic is IEEE-754 on all supported runtimes. Cross-engine equality is tested only on Node.

## Error types

All extend `TestSeedError` (`code`, `seed`, `path`, `constraint`, `hint`, `issues`, `toJSON()`): `ConfigError`, `UnsupportedSchemaError`, `SchemaError`, `GenerationError`, `OverrideError`, `RelationshipError`, `CyclicDependencyError` (`cycle`), `LimitError`. Messages never include generated values; user-code errors are kept as `error.cause`.

## Not built (and why)

- **CLI** — nothing a CLI does isn't a 3-line script, and it would add filesystem-overwrite risk. Revisit if users ask for it.
- **OpenAPI input** — JSON Schema import already covers the schema fragments; OpenAPI adds `$ref` resolution across documents and `oneOf` discriminators, which are out of scope.
- **Self-referencing / recursive schemas and tree datasets** — rejected explicitly.
- **Regex `pattern` generation, `multipleOf`, `allOf/oneOf/not/if`, tuples** — rejected explicitly by `fromJsonSchema`.
- **CSV/JSON export, fixture diffing** — trivial with `stream()` and `JSON.stringify`; not worth API surface.
- **React/Vue adapters** — none needed; the core is framework-independent.
