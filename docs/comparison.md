# Comparison

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

"Not found" and "no" reflect the docs reviewed on 2026-10-27, not exhaustive code audits. See [market research](../docs/MARKET-RESEARCH.md) for the evidence and gaps.

Competitors are better than TestSeed at what they target. Use them together where it makes sense, for example Faker values inside a TestSeed field.

## Performance

One machine, one session (Node 22, Apple M4): 100,000 flat users in about 231 ms against about 386 ms for an equivalent seeded Faker loop and about 434 ms for Fishery with Faker. 10,000 schema-generated objects took about 55 ms (including verification) against about 105 ms for json-schema-faker. Cold import was about 3 ms against about 54 ms for Faker.

TestSeed does less work per value because its vocabulary is small. Read the caveats in [Benchmarks](../docs/BENCHMARKS.md) before quoting these numbers.
