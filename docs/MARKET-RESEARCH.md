# Market research

Research date: **2026-10-27**. Method: npm registry metadata (`npm view`), the packages' README/docs pages fetched on that date,
and one web search for name conflicts. Anything marked **(not verified)** was not confirmed from a primary source and should be
re-checked before being relied on. Issue trackers and changelogs were **not** systematically reviewed, so "known limitations" below are
limited to what each project documents about itself, not user-reported bugs.

## Name check

| Check | Result |
| --- | --- |
| npm `testseed` | `404 Not Found` on 2026-10-27 → name appears available. Availability can change before publish; re-run `npm view testseed`. |
| npm `test-seed` | Exists as a `0.0.1-security` placeholder (npm security holding package). npm's similarity rule could reject `testseed` for being too close to `test-seed`. **Unknown until you try to publish** (`npm publish --dry-run` does not check this). |
| Trademark | A web search found one listing, "TestSeed", described as a web-based deterministic dataset generator for API/CI use (PeerPush, dated 2026-02-08, marked "site offline"). No trademark registrations were found, but **no USPTO/WIPO/EUIPO search was run** — that needs a human with database access. Treat the name as provisional. |

## Competitors

| Project | Repo | Version / last publish (npm) | Primary use |
| --- | --- | --- | --- |
| Faker | github.com/faker-js/faker | 10.6.0 / 2026-09-06 | Large library of fake values (names, addresses, finance, …) in many locales |
| Fishery | github.com/thoughtbot/fishery | 2.4.0 / 2025-12-08 | Typed factories (Factory-Bot style) |
| Rosie | github.com/rosiejs/rosie | 2.1.1 / 2023-11-11 | Factories (Factory-Bot style) |
| test-data-bot | github.com/jackfranklin/test-data-bot | 2.1.0 / 2023-03-01 (`@jackfranklin/test-data-bot`); legacy `test-data-bot` 0.8.0 / 2022-05-19 | Factories |
| fast-check | github.com/dubzzz/fast-check | 4.10.2 / 2026-09-19 | Property-based testing with shrinking |
| Zod | github.com/colinhacks/zod | 4.6.7 / 2026-10-12 | Validation; emits JSON Schema (`z.toJSONSchema`) |
| json-schema-faker | github.com/json-schema-faker/json-schema-faker | 0.6.3 / 2026-08-01 | Generate data from JSON Schema |
| @anatine/zod-mock | github.com/anatine/zod-plugins | 3.14.0 / 2025-04-04 | Generate mocks from Zod via Faker |
| @mswjs/data | github.com/mswjs/data | 0.16.2 / 2025-10-14 | In-memory data model with relations for API mocking |

### What each documents (verified from READMEs/docs on the research date)

- **Fishery** — `Factory.define<T>()` is generic; build/params/transient params are typed. Sequences via a `sequence` argument
  (`rewindSequence()`). Traits are not first-class: you subclass and chain methods. `build()` is sync, `create()` async with `onCreate`.
  The README describes **no random/seed mechanism**; randomness comes from whatever you call inside (typically Faker). Documented caveats:
  circular factory imports may need explicit type annotations; default `DeepPartial` params don't suit class instances; only one `onCreate`.
- **Faker** — seeding is per instance (`faker.seed(n)`); docs warn of "issues regarding reproducibility when seeding only one" of several
  instances. Default randomizer changed from Mersenne-32 to Mersenne-53 in v9. **The randomizer page makes no promise that a given seed yields the
  same values across releases** (absence of a statement; not a statement that it changes). Faker is not a factory, schema, relation or
  edge-case tool; it is a value source. 2.9 MB unpacked (all locales).
- **json-schema-faker** — zero production dependencies, deterministic via seeded Mulberry32 (default seed `1`), supports 2019-09/2020-12
  keywords including `allOf/anyOf/oneOf/not/if-then-else`, `pattern` (regex AST generator) and `$ref` with cycle handling. Faker/Chance are optional extensions.
  It is a strong, **mature competitor for JSON-Schema-only generation** and supports more keywords than TestSeed does. No relational support, no edge-case/invalid-input mode **(not verified: absence not confirmed in code)**.
- **@anatine/zod-mock** — generates from Zod via Faker; key-name matching heuristics; supports `seed`. README lists unsupported types: `ZodAny, ZodDefault,
  ZodFunction, ZodIntersection, ZodMap, ZodPromise, ZodSet, ZodTuple, ZodUnion, ZodUnknown`. Faker is a peer dependency; supported Zod versions are not stated on the README **(Zod 4 compatibility not verified)**.
- **@mswjs/data** — "schema-based fixtures" with relations (Drizzle-inspired) and Standard Schema support per its README. Docs page fetched did not detail
  relation types, seeding or limits **(not verified)**. Aimed at API mocking (an in-memory queryable DB), not at generating test fixtures with distributions.
- **fast-check** — arbitraries pair a generator with a shrinker; includes "fake data" arbitraries (uuid, email, url). Built for property tests: its
  value is shrinking and replaying failing runs. Seed/replay details were not on the page I fetched **(known from general knowledge, not verified here)**.
- **Rosie, test-data-bot** — only npm metadata checked (last publishes 2023 and 2022). Maintenance activity beyond that **(not verified)**.

## Assessment against the questions in the brief

| Topic | Evidence-based finding |
| --- | --- |
| API complexity | Factories (Fishery/Rosie) are small and clear. Faker's surface is huge. Schema tools need only a schema. |
| TypeScript inference | Fishery has it. JSON-Schema tools return `unknown`/`any`-like types. |
| Schema integration | json-schema-faker (JSON Schema), zod-mock (Zod, with gaps). Nobody found that validates *overrides* against the schema. **(not exhaustively verified)** |
| Reproducibility | Seed support exists in Faker, JSF, zod-mock. No cross-version guarantee found documented in Faker. Per-field/per-record isolation (adding a field does not shift others) not found in any. |
| Relational data | @mswjs/data (relations for mocking). Fishery supports associations between factories, but not FK distributions, cardinality checks or cycle detection. |
| Constraint handling | JSF handles many JSON Schema keywords. Factory libraries leave constraints to you. |
| Edge-case generation | fast-check biases toward edge values and shrinks; it is not a fixture tool. JSF/zod-mock: not found. **Boundary + labelled-invalid *fixtures* from a schema appears under-served.** |
| Large datasets | None found documenting streaming/bounded-memory generation. **(not verified)** |
| Runtime compatibility, size | Faker 2.9 MB unpacked, 54 ms cold import (measured here). Fishery/JSF are small. |
| Error reporting | Not examined in depth for competitors. |
| Documentation quality | Faker and Zod: extensive. Smaller packages: sparse. Not scored. |

## Features that should NOT be built (already solved well)

- A huge multi-locale vocabulary (Faker). TestSeed ships 173 short synthetic vocabulary entries on purpose and documents how to plug in Faker values inside a field function.
- Property-based testing with shrinking (fast-check). TestSeed's edge cases are fixed, labelled fixtures, not a property-testing engine.
- Full JSON Schema coverage including `pattern`, `allOf`, `oneOf`, `if/then/else` (json-schema-faker). TestSeed rejects these with a precise error instead.
- Validation (Zod and friends). TestSeed *consumes* validators through Standard Schema and Zod → JSON Schema.
- In-memory queryable mock database / MSW handlers (@mswjs/data).

## TestSeed's proposed differentiation (hypotheses, not proven demand)

1. **Stability by construction.** Every record and every field has its own derived stream, so `generate(10)` is a prefix of `generate(100)` and adding a field does not change the other fields' values. A written, tested reproducibility policy (golden tests).
2. **Relational generation with checks** — referential integrity, one-to-one / many-to-many / array refs, Zipf skew, cycle detection, impossible-constraint errors.
3. **Labelled boundary and invalid fixtures** from one schema (TestSeed builder or JSON Schema/Zod), each verified valid/invalid.
4. **Bounded-memory streaming** with the same records as in-memory generation.
5. **Zero dependencies, ~18 KB gzipped**, no network, no telemetry.

## Adoption barriers (realistic)

- Faker + Fishery is the incumbent combination; teams already have fixtures written for it. TestSeed must be adopted *alongside* Faker, not as a replacement.
- JSON-Schema-only users already have json-schema-faker, which supports more keywords. TestSeed wins only if edge cases / determinism guarantees / relations matter.
- A new 0.x package with no track record, one maintainer and a name that may collide with another project.
- The smaller vocabulary yields less "realistic" data than Faker; this is a deliberate trade-off that some users will reject.
- The edge-case feature is boundary-focused, not exhaustive; users expecting fast-check-style search will be disappointed.
- Demand for each differentiator is **unvalidated** — nobody has been interviewed or surveyed.

## Sources

- https://github.com/thoughtbot/fishery
- https://fakerjs.dev/guide/randomizer
- https://github.com/mswjs/data
- https://github.com/json-schema-faker/json-schema-faker
- https://github.com/anatine/zod-plugins/tree/main/packages/zod-mock
- https://fast-check.dev/docs/core-blocks/arbitraries/
- https://peerpush.com/p/testseed (name conflict listing)
- npm registry (`npm view <pkg>`) on 2026-10-27
