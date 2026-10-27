# Architecture

```
src/
  random/rng.ts            SFC32 PRNG + forkable streams (origin-derived, consumption-independent)
  generators/              Gen (value generators bound to one stream) + small vocabulary lists
  schema/
    node.ts                Internal schema IR (string, number, boolean, null, literal, enum, date, array, object, nullable, union) + limits
    builder.ts             `t` builders, Schema/OptionalSchema classes, type inference
    validate.ts            Collect-all validator over the IR (paths, constraints, no values)
    generate.ts            IR -> value; always verifies output against the IR
    jsonschema.ts          JSON Schema -> IR (rejects unsupported keywords explicitly)
    standard.ts            Structural Standard Schema type + sync runner
  factories/factory.ts     Factory definition, trait/override resolution, buildRecord (pure)
  datasets/dataset.ts      Relational engine: topo sort, FK resolution, distributions, uniqueness
  edge-cases/              Candidate generation -> embed -> classify with the validator
  streaming/stream.ts      iterate / batches / batchesAsync
  seed.ts                  Seed class: the public façade; owns counters, limits, reports
  errors.ts                Error hierarchy
```

Dependency direction (no cycles): `errors, random, version` ← `generators` ← `schema` ← `factories` ← `datasets`; `edge-cases` depends on `schema`; `seed.ts` depends on everything; nothing depends on `seed.ts`.

## Key decisions

**Forked streams, not one stream.** `Rng.fork(label)` derives a child from the parent's _origin_ words (not its current position) with a 32-bit finaliser (`fmix32`) and warms the child up. A record is `root.fork(factoryName).fork(index)`; a field is `record.fork(fieldName)`; array elements are `fork(i)`. Consequences: record _i_ is independent of count; adding/removing a field doesn't move the others; overriding a field doesn't change the rest; datasets can use the same factory for two tables because the _table name_ labels the stream. Cost: one small object allocation per field per record (measured: still faster than seeded Faker loops, see BENCHMARKS.md).

**PRNG choice.** SFC32: tiny, fast, passes common statistical batteries in the literature, 128-bit state, trivially serializable (`getState()` → four uint32). Integer draws use 53 random bits with rejection sampling to remove modulo bias. Not cryptographic.

**One IR for three jobs.** Generation, validation and edge cases all read the same node tree, so they cannot drift apart. JSON Schema and the `t` builder are just two front-ends. Generation ends with a validator pass; edge-case classification is done by the validator, not by the code that proposed the candidate — a wrong proposal is dropped instead of mislabelled.

**Pure functions + a few counters.** `generate`, `stream`, `dataset`, `edgeCases` are pure in (seed, definition). Only `build()`/`sample()` use per-instance `WeakMap` counters so that repeated calls return new records. No module-level mutable state.

**No Zod dependency.** Zod 4 exports JSON Schema; any Standard Schema validator can check output. Reading Zod's private internals would break between minor releases.

**Type tricks that matter.** `FieldInput` is a union that deliberately excludes bare `unknown` so TypeScript can contextually type `(g, ctx)`. Trait names use `NoInfer` so a wrong name is an error instead of widening the inferred union. `dataset()` returns `DatasetResult<D>` via one documented cast.

## Known limitations of the design

- Dataset rows are built in memory; very large datasets need `stream()` per table with your own key bookkeeping.
- Reference keys are typed `string | number`, not the parent's exact key type.
- `Object.hasOwn`, `AbortSignal.throwIfAborted` and `crypto.getRandomValues` require Node ≥ 20 / modern browsers (browsers untested).
