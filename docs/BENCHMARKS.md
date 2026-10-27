# Benchmarks

Reproduce: `npm run benchmark` (builds, then runs `benchmarks/run.mjs` with `--expose-gc`; `BENCH_RUNS=15` for more samples).

**Environment of the numbers below:** Node v22.23.1, Apple M4 (10 cores), macOS arm64, 7 timed runs after one warm-up, median reported, one machine, one session. Library versions: `@faker-js/faker` 10.6.0 (`fakerEN`), `fishery` 2.4.0, `json-schema-faker` 0.6.3, `testseed` 0.1.0. Absolute numbers will differ on other machines; ratios are the useful part, and even they are from a single run.

## Results (milliseconds, lower is better)

| Scenario                                     |           n |                           TestSeed | Faker (seeded loop) | Fishery + Faker | json-schema-faker |
| -------------------------------------------- | ----------: | ---------------------------------: | ------------------: | --------------: | ----------------: |
| Flat user (id, name, email, age, ISO date)   |       1,000 |                                3.1 |                 5.8 |             5.5 |                 – |
| Flat user                                    |      10,000 |                               24.9 |                38.9 |            44.2 |                 – |
| Flat user                                    |     100,000 |                                231 |                 386 |             434 |                 – |
| Nested user (address object + 1–4 tags)      |      10,000 |                               25.0 |                60.7 |               – |                 – |
| Same JSON Schema, 5 properties               |      10,000 | 54.7 (incl. verifying every value) |                   – |               – |             105.1 |
| Relational: 1k users / 5k orders / 20k items | 26,000 rows |                               29.6 |       no equivalent |   no equivalent |     no equivalent |

Peak extra heap while producing 500,000 flat users (`heapUsed` delta, includes not-yet-collected garbage, so treat as indicative):

| Mode                          |                                       Peak extra heap |
| ----------------------------- | ----------------------------------------------------: |
| `generate()` → array          |                                              130.6 MB |
| `stream()` (record at a time) |                                               15.8 MB |
| `batches(5000)`               | 67.1 MB (garbage from batch arrays between GC cycles) |

Cold import in a fresh process (median of 7): TestSeed 3.0 ms, Faker `fakerEN` 54.1 ms, Fishery 3.4 ms, json-schema-faker 1.9 ms.
Size: TestSeed bundle minified 52.5 KB / **17.7 KB gzipped** (whole library, no tree-shaking), tarball 173 KB packed (includes source maps). Faker 10.6.0 unpacked: 2.9 MB.

## How to read this — caveats

- **The comparison is not like-for-like in data richness.** Faker draws from large locale datasets and handles many more cases; TestSeed uses 173 vocabulary entries. TestSeed is faster _partly because it does less per value_. The nested scenario in particular uses Faker's `streetAddress/city/state/zipCode/country`, which do more work than TestSeed's address.
- Faker was seeded with `faker.seed(42)` per run and called directly in a loop (the cheapest idiomatic form); Fishery used `buildList` with Faker calls inside the generator.
- TestSeed pays for per-field stream derivation (the feature that makes records independent). It still measured faster here, but this was **not** tested on other engines or Node versions.
- json-schema-faker supports far more keywords than TestSeed; the scenario uses only keywords both support.
- Memory numbers come from `process.memoryUsage().heapUsed` with a forced GC before the run; they include uncollected garbage.
- Relational generation has no competitor measured because none of the evaluated libraries generate FK-consistent tables; the figure is only for tracking regressions.
- Not benchmarked: 100,000-row relational datasets, `batchesAsync` overhead (it yields with `setTimeout(0)` between batches), Bun/Deno/browsers.
