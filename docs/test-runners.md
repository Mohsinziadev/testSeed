# Test Runners

TestSeed is plain functions, so no adapter is needed. Log the seed so failures can be replayed:

```js
// node:test (tested in examples/node-test) and Vitest (this repo's own tests) work the same way
const seed = createSeed(process.env.SEED ? { seed: Number(process.env.SEED) } : {});
console.log(`seed: ${seed.seed}`); // SEED=2008428232 npm test
```

An unseeded run picks a random seed and exposes it as `seed.seed`. When a test fails, rerun with `SEED=<that number>` to get exactly the same data.

## Jest and Playwright

Nothing in the library is runner-specific, but **no Jest or Playwright integration has been tested**, so none is claimed. See the [roadmap](../ROADMAP.md).

## JavaScript

Everything works from plain JS, with ESM `import` or CommonJS `require("testseed")`. The packed artifact is tested both ways. Runtime checks (counts, ranges, overrides, schemas) do not rely on TypeScript.
