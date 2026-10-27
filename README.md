# TestSeed

Deterministic, schema-aware, relational test data and edge-case fixtures for TypeScript and JavaScript. Zero runtime dependencies (~18 KB gzipped).

> **Status: 0.1.0, pre-release, not yet published.** The API may change before 1.0. See [Versioning policy](#versioning-policy).

TestSeed is a _fixture engine_, not a replacement for [Faker](https://fakerjs.dev): it ships 173 small synthetic vocabulary entries, not a locale database. Use Faker inside a field function when you need richer values.

## Problems it targets

| You need to…                                                      | TestSeed                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Reproduce a failing test exactly                                  | Every error and report carries the seed; unseeded runs pick a random seed and expose it (`seed.seed`). |
| Add a field to a factory without churning every existing snapshot | Each (record, field) has its own random stream, so other fields keep their values.                     |
| Generate 10,000 users reproducibly                                | `generate(factory, n)` is pure; `generate(f, 10)` is a prefix of `generate(f, 100)`.                   |
| Generate users → orders → items with valid foreign keys           | `dataset()` with cardinality, distributions, uniqueness and cycle detection.                           |
| Get boundary and invalid inputs for a schema                      | `edgeCases(schema)` returns labelled cases, each verified valid or invalid.                            |
| Generate from Zod / JSON Schema                                   | Zod → `z.toJSONSchema` → `fromJsonSchema`; outputs can also be checked by the original validator.      |
| Generate lots of data without holding it                          | `stream()` / `batches()` / `batchesAsync()`.                                                           |
| Understand a generation failure                                   | Errors give path, constraint, seed and a hint, and never print the generated value.                    |

## Install

```bash
npm install --save-dev testseed     # not yet published — see RELEASING.md
```

Node ≥ 20. ESM and CommonJS. Types included.

## 60-second example

```ts
import { createSeed, t } from "testseed";

const seed = createSeed({ seed: 42 });

const userFactory = seed.factory(
  {
    id: (_g, ctx) => ctx.sequence, // unique by construction
    name: (g) => g.person.fullName(),
    email: (g) => g.internet.email(), // always on example.com/.org/.net
    age: t.int({ min: 18, max: 80 }), // schema-backed field
    role: "member" as string,
  },
  { name: "user", traits: { admin: { role: "admin" } } },
);

const users = seed.generate(userFactory, 100); // same every run
const alex = seed.build(userFactory, { name: "Alex Morgan", age: 32 }); // typed overrides
const admin = seed.build(userFactory, {}, { traits: ["admin"] });
```

`alex` is inferred as `{ id: number; name: string; email: string; age: number; role: string }`; `seed.build(userFactory, { nme: "x" })` and `{ age: "32" }` are compile errors, and `{ age: 5 }` is a runtime `OverrideError` because the `age` field has a schema.

(Runnable: [`examples/basic`](examples/basic/index.ts).)

## Deterministic generation

- Same `(seed, factory/schema, options)` → same output within a release line (see [Reproducibility](#reproducibility-guarantee)).
- Instances are isolated; nothing touches `Math.random` or global state.
- `seed` is a finite number or a string. Save/restore a raw generator position with `Rng.getState()` / `Rng.fromState()` (four uint32, JSON-safe).
- `generate()` is pure. `build()` advances a per-factory counter; the _n_-th `build` equals `generate(f, n + 1)[n]`. Use `{ start }` to get a different window.
- Give factories distinct `name`s: the name labels the random stream (two factories with the same name and seed produce correlated data).

## Schemas

```ts
const signup = t.object({
  username: t.string({ minLength: 3, maxLength: 12 }),
  age: t.int({ min: 13, max: 120 }),
  referrer: t.string({ format: "email" }).optional(),
});
type Signup = Infer<typeof signup>; // { username: string; age: number; referrer?: string | undefined }
seed.sample(signup); // one value
seed.generate(signup, 50); // fifty
validate(signup, input); // [{ path, constraint, message }]  — never echoes the value
```

### Zod, Valibot, ArkType, JSON Schema

```ts
import { z } from "zod";
const User = z.object({ id: z.string().uuid(), age: z.number().int().min(18).max(80) });

// io: "input" matters — see "Zod caveat" below.
const schema = fromJsonSchema(z.toJSONSchema(User, { io: "input" }));
seed.generate(schema, 100).every((v) => User.safeParse(v).success); // true (tested)

// Or check every record of a factory against any Standard Schema validator:
seed.factory({ id: (g) => g.uuid(), age: (g) => g.number.int({ min: 0, max: 99 }) }, { validator: User, maxAttempts: 50 });
```

Tested with **Zod 4.6** only. Other validators work if they implement the synchronous Standard Schema interface (`validator`) or export JSON Schema within the supported subset; those are untested here.

**Supported JSON Schema:** `type` (including `["x","null"]` and multi-type arrays), `properties`, `required`, `additionalProperties: boolean`, `items`, `minItems/maxItems/uniqueItems`, `minLength/maxLength`, `minimum/maximum` (and `exclusiveMinimum/Maximum` for **integers**), `enum`, `const` (primitive), `anyOf`, local non-recursive `$ref`/`$defs`, formats `email`, `uuid`, `uri`, `date-time`. Annotations (`title`, `description`, `default`, `examples`, …) and `x-*` are ignored.
**Rejected with `UnsupportedSchemaError` (naming path and keyword):** `pattern` (unless attached to a recognised format, as Zod emits), `multipleOf`, `allOf`, `oneOf`, `not`, `if/then/else`, `patternProperties`, `propertyNames`, `dependent*`, `contains`, tuples, recursive or remote `$ref`, other formats, float exclusive bounds, boolean schemas.

**Zod caveat:** Zod's default JSON Schema export says `additionalProperties: false` although Zod strips (not rejects) unknown keys, so an "unknown property" invalid case would be accepted by Zod. Use `{ io: "input" }` (or `.strict()`). This is pinned by a test.

Formatted strings (`email`, `uuid`, `url`, `date-time`) come from TestSeed's fixed shapes. If the original validator's pattern is stricter, pass it as the factory `validator` to confirm.

## Relational datasets

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

One-to-many (default), one-to-one (`unique: true`), many-to-many (join table + `uniqueTogether`, or array refs with `many: {min,max}`), `nullable`, `perParent`, distributions `"uniform" | "zipf" | (n, g) => index`. Tables are ordered by dependency automatically. No database is involved. Details and limits: [docs/API-DESIGN.md](docs/API-DESIGN.md). Runnable: [`examples/relational`](examples/relational/index.ts).

Errors you can get: `CyclicDependencyError` (names the cycle), `RelationshipError` (unknown table, one-to-one with too many children, `uniqueTogether` capacity exceeded, referencing an empty table, duplicate or non-primitive parent keys).

## Edge cases

```ts
const cases = seed.edgeCases(signup, { random: 5 });
for (const c of cases) {
  // c.valid, c.category: "boundary" | "invalid" | "random", c.label, c.path, c.constraint, c.value
  expect(isValidSignup(c.value)).toBe(c.valid);
}
```

Generated: strings at min/max length and one beyond, empty, Unicode (astral, accented, CJK), whitespace-only, very long; integers/floats at both bounds and the adjacent representable value outside; `NaN`/`Infinity`; array empty/min/max/±1 and duplicates (valid or invalid depending on `unique`); missing/undefined required properties, omitted optional ones, `null`; enum members and a non-member; dates at bounds, ±1 ms, epoch, leap day, 32-bit rollover, impossible dates; unknown properties for strict objects; wrong types.
Guarantees: every `valid: true` case passes the schema and every `valid: false` case fails it (re-checked before returning; mismatches are dropped, never relabelled). **Boundary-focused, not exhaustive**; cases larger than your `limits` are omitted. Runnable: [`examples/api`](examples/api/index.ts).

## Large datasets

```ts
for (const user of seed.stream(userFactory, { count: 10_000_000 })) {
  /* one record at a time; break to stop */
}
for (const batch of seed.batches(userFactory, { count: 1e6, batchSize: 5000 })) insertMany(batch);

const controller = new AbortController();
for await (const batch of seed.batchesAsync(userFactory, { count: 1e6, signal: controller.signal })) {
  /* yields to the event loop between batches */
}
```

Streams produce exactly the records `generate()` would. Memory stays flat (500k records: ~16 MB heap delta streaming vs ~131 MB as an array on one machine — [docs/BENCHMARKS.md](docs/BENCHMARKS.md)). Abort is checked between batches. Streams are not capped by `limits.maxCount`; in-memory `generate`/`dataset` are.

## Error handling and reproducing failures

```ts
try {
  seed.build(userFactory, { age: 5 });
} catch (e) {
  if (e instanceof TestSeedError) console.error(e.message, e.path, e.constraint, e.seed, e.hint);
}
// OverrideError: Override for "age" violates the field's schema: value is below minimum 18 (path: age, constraint: min, seed: 42)
```

```ts
const report = seed.generateWithReport(userFactory, { count: 100, seed: 12345 });
report.ok;
report.failures;
report.reproduce; // seed, factory name, algorithm/package version, traits, override *names*, limits
```

Error classes: `ConfigError`, `UnsupportedSchemaError`, `SchemaError`, `GenerationError`, `OverrideError`, `RelationshipError`, `CyclicDependencyError`, `LimitError`; all extend `TestSeedError` and have `toJSON()`.

## Using it in test runners

Plain functions; no adapter needed. Log the seed so failures can be replayed:

```js
// node:test (tested: examples/node-test) and Vitest (the repo's own tests) work the same way
const seed = createSeed(process.env.SEED ? { seed: Number(process.env.SEED) } : {});
console.log(`seed: ${seed.seed}`); // SEED=2008428232 npm test
```

Jest and Playwright fixtures: nothing in the library is runner-specific, but **no Jest/Playwright integration has been tested**, so none is claimed.

## JavaScript

Everything works from plain JS (ESM `import` or CommonJS `require("testseed")`); the packed artifact is tested both ways. Runtime checks (counts, ranges, overrides, schemas) do not rely on TypeScript.

## API reference (summary)

|                                                                                                                                                                                                                                                                                                                                          |                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `createSeed({ seed?, limits? })`                                                                                                                                                                                                                                                                                                         | `limits: { maxCount = 1e6, maxArrayLength = 1e4, maxStringLength = 1e5 }` |
| `seed.factory(fields, { name?, traits?, validator?, maxAttempts? })`                                                                                                                                                                                                                                                                     | field = `(g, ctx) => v` \| `Schema` \| constant                           |
| `seed.build / generate / sample / stream / batches / batchesAsync`                                                                                                                                                                                                                                                                       | see above                                                                 |
| `seed.dataset(spec)`                                                                                                                                                                                                                                                                                                                     | relational tables                                                         |
| `seed.edgeCases(schema, { include?, random?, limit? })`                                                                                                                                                                                                                                                                                  | verified cases                                                            |
| `seed.generateWithReport(factory, { count, seed?, traits?, overrides? })`                                                                                                                                                                                                                                                                | failure report                                                            |
| `g.number.int/float`, `g.string.alpha/alphanumeric/numeric/hex`, `g.text.words/sentence`, `g.date.between/iso`, `g.person.firstName/lastName/fullName/person`, `g.internet.username/email/url/ipv4`, `g.location.address`, `g.phone.number`, `g.helpers.pick/pickMany/shuffle/weighted/arrayOf/nullable/optional`, `g.boolean`, `g.uuid` | available on `seed` and as `g` inside fields                              |
| `t.*`, `Infer`, `fromJsonSchema`, `validate`                                                                                                                                                                                                                                                                                             | schemas                                                                   |
| `Rng`, `VERSION`, `ALGORITHM_VERSION`                                                                                                                                                                                                                                                                                                    | low level / versioning                                                    |

Full semantics: [docs/API-DESIGN.md](docs/API-DESIGN.md).

## Performance

One machine, one session (Node 22, Apple M4): 100,000 flat users in ~231 ms vs ~386 ms for an equivalent seeded Faker loop and ~434 ms for Fishery + Faker; 10,000 schema-generated objects in ~55 ms (including verification) vs ~105 ms for json-schema-faker; cold import ~3 ms vs ~54 ms for Faker. TestSeed does less work per value (small vocabulary) — see the caveats in [docs/BENCHMARKS.md](docs/BENCHMARKS.md) before quoting these numbers.

## Comparison with alternatives

|                                                         | TestSeed                     | Faker                | Fishery           | json-schema-faker    | @anatine/zod-mock               |
| ------------------------------------------------------- | ---------------------------- | -------------------- | ----------------- | -------------------- | ------------------------------- |
| Large multi-locale value library                        | no (173 entries)             | **yes**              | no                | optional via Faker   | via Faker                       |
| Typed factories                                         | yes                          | no                   | **yes**           | no                   | no                              |
| Seeded                                                  | yes                          | yes                  | no (use Faker's)  | yes                  | yes                             |
| Per-field stream isolation; written stability policy    | **yes**                      | not found documented | n/a               | not found documented | not found documented            |
| Validates overrides against field schemas               | yes                          | no                   | no                | n/a                  | n/a                             |
| Relational datasets with FK checks, cycles, cardinality | **yes**                      | no                   | associations only | no                   | no                              |
| Labelled boundary / invalid fixtures from a schema      | **yes**                      | no                   | no                | not found            | not found                       |
| Streaming generation                                    | yes                          | no                   | no                | no                   | no                              |
| JSON Schema coverage                                    | **small subset**             | –                    | –                 | **broad**            | –                               |
| Zod                                                     | via JSON Schema (4.x tested) | –                    | –                 | via JSON Schema      | direct (some types unsupported) |
| Runtime dependencies                                    | 0                            | 0                    | 0                 | 0                    | Faker (peer)                    |

"not found" / "no" reflect the docs reviewed on 2026-10-27, not exhaustive code audits; see [docs/MARKET-RESEARCH.md](docs/MARKET-RESEARCH.md) for evidence and gaps. Competitors are better than TestSeed at what they target — use them together where it makes sense (e.g. Faker values inside a TestSeed field).

## Supported runtimes

Developed and tested locally on **Node 22.23 (macOS arm64)**. `engines` is `>=20`; the GitHub Actions workflow runs Node 20/22/24 on Linux/macOS/Windows but **has not been executed yet** (no remote repository). Browsers, Deno and Bun: untested.

## Limitations

- Not for secrets, tokens, passwords or keys (ordinary seeded PRNG; `uuid()` is reproducible).
- Synthetic ≠ anonymous or compliant; it is invented data.
- Small vocabulary; names/addresses are plausible-looking only.
- JSON Schema support is a documented subset; `pattern`, `oneOf`, `allOf`, recursion, tuples are rejected.
- Dataset: no self-referencing tables; reference keys typed `string | number`; in-memory only.
- Edge cases are boundary-focused, not exhaustive search; no shrinking.
- Async validators are unsupported (generation is synchronous).
- Demand for the differentiators is unvalidated.

## Security and privacy

No network, telemetry, file writes or code evaluation; contact data uses reserved/fictional ranges; errors and reports never include generated values. See [SECURITY.md](SECURITY.md).

## Reproducibility guarantee

Seeded output is stable within a release line — the **minor** version while 0.x, the **major** version from 1.0. Changing any seeded output (algorithm, vocabulary, probabilities) bumps `ALGORITHM_VERSION` and the line, and is pinned by golden tests. `report.algorithmVersion` and `report.packageVersion` record what produced a run.

## Versioning policy

[SemVer](https://semver.org). 0.x: breaking API changes may land in minor releases. Upgrade by reading [CHANGELOG.md](CHANGELOG.md), re-running your tests, and refreshing any committed snapshots when the changelog lists a "Reproducibility" change. To stay stable, pin an exact version or a `~` range (0.x).

## Contributing, roadmap, license

[CONTRIBUTING.md](CONTRIBUTING.md) · [ROADMAP.md](ROADMAP.md) · [RELEASING.md](RELEASING.md) · MIT ([LICENSE](LICENSE)).
