# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com). Versioning: see "Versioning policy" in the README — **while 0.x, seeded output is stable within a minor version; output-affecting changes bump the minor and are listed under "Reproducibility".**

## [0.1.0] — 2026-10-28

Initial release (`ALGORITHM_VERSION` 1).

### Added

- Seeded, forkable PRNG (SFC32) with state save/restore.
- Generators: strings, numbers, booleans, dates/ISO strings, person, internet (reserved example domains), address, phone (555-01XX), UUID-shaped ids, weighted/pick/shuffle/nullable/optional/arrayOf.
- Factories with typed overrides, traits, sequences, schema-backed fields (validated overrides) and Standard Schema validators with deterministic retry.
- Schema builder `t` with type inference; `fromJsonSchema` (documented subset); `validate`.
- Relational `dataset()`: topological ordering, one-to-many, one-to-one, array refs, `uniqueTogether`, `perParent`, nullable, uniform/zipf/custom distributions, cycle and impossible-constraint errors.
- `edgeCases()`: verified boundary, invalid and random cases.
- `stream()`, `batches()`, `batchesAsync()` (AbortSignal).
- `generateWithReport()` and an error hierarchy with path, constraint, seed and hints.
