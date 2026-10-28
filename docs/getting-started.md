# Getting Started

TestSeed generates deterministic, schema-aware, relational test data for TypeScript and JavaScript. The same seed gives the same data on every machine, and it has zero runtime dependencies.

> **Status: 0.1.0, pre-release, not yet published to npm.** The API may change before 1.0.

## Install

```bash
npm install --save-dev @mohsinzia/testseed
```

Node.js 20 or newer. ESM and CommonJS builds are included, with types.

## Your first factory

```ts
import { createSeed, t } from "@mohsinzia/testseed";

const seed = createSeed({ seed: 42 });

const userFactory = seed.factory(
  {
    id: (_g, ctx) => ctx.sequence,
    name: (g) => g.person.fullName(),
    email: (g) => g.internet.email(),
    age: t.int({ min: 18, max: 80 }),
    role: "member" as string,
  },
  { name: "user", traits: { admin: { role: "admin" } } },
);

const users = seed.generate(userFactory, 100); // the same 100 users every run
const alex = seed.build(userFactory, { name: "Alex Morgan", age: 32 });
const admin = seed.build(userFactory, {}, { traits: ["admin"] });
```

`alex` is inferred as `{ id: number; name: string; email: string; age: number; role: string }`. `seed.build(userFactory, { nme: "x" })` and `{ age: "32" }` are compile errors, and `{ age: 5 }` is a runtime `OverrideError` because the `age` field has a schema.

## What to read next

- [Core Concepts](#/docs/concepts): how seeds and per-field streams make output stable.
- [Factories](#/docs/factories): field types, traits and overrides.
- [Relational Datasets](#/docs/datasets): users, orders and items with valid foreign keys.
- [Edge Cases](#/docs/edge-cases): labelled boundary and invalid inputs for any schema.

Runnable versions of these examples live in [`examples/`](../examples/basic/index.ts).
