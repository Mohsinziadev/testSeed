# Core Concepts

## Everything is a function of the seed

Every value is a pure function of `(seed, definition, index)`. Record _i_ of a factory never depends on how many records were generated before it, or on any other field.

- Same `(seed, factory or schema, options)` gives the same output within a release line. See [Reproducibility](#/docs/reproducibility).
- Instances are isolated. Nothing touches `Math.random` or global state.
- `seed` is a finite number or a string. If you omit it, a random seed is drawn and exposed as `seed.seed`, and it is included in every error, so even unseeded runs can be replayed.

## Per-field streams

Each `(record, field)` pair has its own random stream. Adding, removing or reordering a field does not change the values of the other fields, so your existing snapshots do not churn.

This is why field functions receive `g`, a generator private to that field:

```ts
name: (g) => g.person.fullName(), // stable when other fields change
```

A callback that used a shared `seed` object would consume one global stream, and adding a field would shift every later value. `seed.person` and friends still exist for ad-hoc use.

## generate, build and sample

| Method                       | Behaviour                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------- |
| `generate(factory, n)`       | Pure. `generate(f, 10)` is a prefix of `generate(f, 100)`.                         |
| `build(factory, overrides?)` | Advances a per-factory counter. The _n_-th `build` equals `generate(f, n + 1)[n]`. |
| `sample(schema)`             | One value from a schema, counter-based like `build`.                               |

Use `{ start }` with `generate` to read a different window of the same sequence.

## Name your factories

The factory `name` labels its random stream. Two factories with the same name and seed produce correlated data, so give each factory a distinct name.

## A fixture engine, not a Faker replacement

TestSeed ships 173 small synthetic vocabulary entries, not a locale database. Use Faker inside a field function when you need richer values, and let TestSeed handle structure: relations, edge cases, streams and reproducibility.
