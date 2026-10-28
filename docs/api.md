# API Reference

Full semantics are in [API design](../docs/API-DESIGN.md). This page is the summary.

## createSeed

```ts
createSeed({ seed?, limits? }): Seed
```

`limits` is `{ maxCount = 1e6, maxArrayLength = 1e4, maxStringLength = 1e5 }`.

## Seed methods

| Method                                                                                                          | Behaviour                                                                                  |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `factory(fields, { name?, traits?, validator?, maxAttempts? })`                                                 | Define a factory. A field is `(g, ctx) => v`, a `Schema` or a constant.                    |
| `build(factory, overrides?, { traits? })`                                                                       | Next record from a per-factory counter. The _n_-th `build` equals `generate(f, n + 1)[n]`. |
| `generate(factoryOrSchema, count, { overrides?, traits?, start? })`                                             | In-memory and pure. Throws above `limits.maxCount`.                                        |
| `sample(schema)`                                                                                                | One value from a schema.                                                                   |
| `stream` / `batches` / `batchesAsync`                                                                           | Lazy, bounded memory, the same records as `generate`.                                      |
| `dataset(spec)`                                                                                                 | Related tables in memory.                                                                  |
| `edgeCases(schema, { include?, random?, limit? })`                                                              | Verified boundary, invalid and random cases.                                               |
| `generateWithReport(factory, { count, seed?, traits?, overrides? })`                                            | Collects failures instead of throwing.                                                     |
| `person`, `internet`, `number`, `string`, `text`, `date`, `location`, `phone`, `helpers`, `boolean()`, `uuid()` | Ad-hoc generators on one shared stream.                                                    |

## Generators

Available on `seed` and as `g` inside fields: `g.number.int/float`, `g.string.alpha/alphanumeric/numeric/hex`, `g.text.words/sentence`, `g.date.between/iso`, `g.person.firstName/lastName/fullName/person`, `g.internet.username/email/url/ipv4`, `g.location.address`, `g.phone.number`, `g.helpers.pick/pickMany/shuffle/weighted/arrayOf/nullable/optional`, `g.boolean`, `g.uuid`.

## Schemas

`t.*`, `Infer`, `fromJsonSchema(json)` and `validate(schema, value)`. See [Schemas](#/docs/schemas).

## Low level

`Rng`, `VERSION` and `ALGORITHM_VERSION`. Save and restore a raw generator position with `Rng.getState()` and `Rng.fromState()` (four uint32, JSON-safe).
