// Reproducible benchmark. Run: npm run benchmark   (builds first, uses --expose-gc)
// Every scenario generates the same logical record shape with each library, seeded, in-memory.
// Reported: median of RUNS timed runs after warm-up. Competitor setups are the idiomatic, direct ones
// (no deliberately slow configuration); see docs/BENCHMARKS.md for caveats.
import { fakerEN as faker } from "@faker-js/faker";
import { Factory } from "fishery";
import { createGeneratorSync } from "json-schema-faker";
import os from "node:os";
import { createSeed } from "../dist/index.js";

const RUNS = Number(process.env.BENCH_RUNS ?? 7);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const gc = () => globalThis.gc?.();

function time(fn) {
  fn(); // warm-up
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    gc();
    const start = process.hrtime.bigint();
    fn();
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  return median(samples);
}

const rows = [];
function report(scenario, library, n, ms, note = "") {
  rows.push({ scenario, library, n, ms: Number(ms.toFixed(1)), perSec: Math.round(n / (ms / 1000)), note });
}

// ---- Scenario 1: flat user ------------------------------------------------------------
const seed = createSeed({ seed: 42 });
const tsUser = seed.factory({
  id: (_g, c) => c.sequence,
  name: (g) => g.person.fullName(),
  email: (g) => g.internet.email(),
  age: (g) => g.number.int({ min: 18, max: 80 }),
  createdAt: (g) => g.date.iso(),
});
const fishUser = Factory.define(({ sequence }) => ({
  id: sequence,
  name: faker.person.fullName(),
  email: faker.internet.email(),
  age: faker.number.int({ min: 18, max: 80 }),
  createdAt: faker.date.between({ from: "2000-01-01", to: "2030-01-01" }).toISOString(),
}));
for (const n of [1_000, 10_000, 100_000]) {
  report(
    "flat user",
    "testseed",
    n,
    time(() => seed.generate(tsUser, n)),
  );
  report(
    "flat user",
    "faker (seeded loop)",
    n,
    time(() => {
      faker.seed(42);
      const out = [];
      for (let i = 0; i < n; i++) {
        out.push({
          id: i + 1,
          name: faker.person.fullName(),
          email: faker.internet.email(),
          age: faker.number.int({ min: 18, max: 80 }),
          createdAt: faker.date.between({ from: "2000-01-01", to: "2030-01-01" }).toISOString(),
        });
      }
      return out;
    }),
  );
  report(
    "flat user",
    "fishery + faker",
    n,
    time(() => {
      faker.seed(42);
      fishUser.rewindSequence();
      return fishUser.buildList(n);
    }),
  );
}

// ---- Scenario 2: nested object ---------------------------------------------------------
const tsNested = seed.factory({
  id: (_g, c) => c.sequence,
  name: (g) => g.person.fullName(),
  address: (g) => g.location.address(),
  tags: (g) => g.helpers.arrayOf({ min: 1, max: 4 }, () => g.text.words(1)),
});
report(
  "nested user (address + tags)",
  "testseed",
  10_000,
  time(() => seed.generate(tsNested, 10_000)),
);
report(
  "nested user (address + tags)",
  "faker (seeded loop)",
  10_000,
  time(() => {
    faker.seed(42);
    const out = [];
    for (let i = 0; i < 10_000; i++) {
      out.push({
        id: i + 1,
        name: faker.person.fullName(),
        address: {
          street: faker.location.streetAddress(),
          city: faker.location.city(),
          region: faker.location.state(),
          postalCode: faker.location.zipCode(),
          country: faker.location.country(),
        },
        tags: Array.from({ length: faker.number.int({ min: 1, max: 4 }) }, () => faker.word.sample()),
      });
    }
    return out;
  }),
);

// ---- Scenario 3: schema-driven (same JSON Schema fed to both) --------------------------
const jsonSchema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    email: { type: "string", format: "email" },
    age: { type: "integer", minimum: 18, maximum: 80 },
    tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 8 }, minItems: 1, maxItems: 4 },
    active: { type: "boolean" },
  },
  required: ["id", "email", "age", "tags", "active"],
};
const { fromJsonSchema } = await import("../dist/index.js");
const tsSchema = fromJsonSchema(jsonSchema);
report(
  "JSON Schema (5 props)",
  "testseed (generate + self-verify)",
  10_000,
  time(() => seed.generate(tsSchema, 10_000)),
);
report(
  "JSON Schema (5 props)",
  "json-schema-faker",
  10_000,
  time(() => {
    const { generate } = createGeneratorSync({ seed: 42 });
    const out = [];
    for (let i = 0; i < 10_000; i++) out.push(generate(jsonSchema));
    return out;
  }),
);

// ---- Scenario 4: relational dataset (testseed only; competitors have no equivalent) -----
const u = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName() }, { name: "u" });
const o = seed.factory({ id: (_g, c) => c.sequence, total: (g) => g.number.int({ min: 1, max: 500 }) }, { name: "o" });
const it = seed.factory({ id: (_g, c) => c.sequence, qty: (g) => g.number.int({ min: 1, max: 5 }) }, { name: "i" });
report(
  "relational 1k users / 5k orders / 20k items",
  "testseed dataset()",
  26_000,
  time(() =>
    seed.dataset({
      users: { factory: u, count: 1_000 },
      orders: { factory: o, count: 5_000, refs: { userId: { to: "users" } } },
      items: { factory: it, count: 20_000, refs: { orderId: { to: "orders" } } },
    }),
  ),
  "rows incl. FK resolution + key-uniqueness checks",
);

// ---- Memory: streaming vs in-memory ----------------------------------------------------
function peakHeap(run) {
  gc();
  const base = process.memoryUsage().heapUsed;
  let peak = base;
  const sample = () => {
    const h = process.memoryUsage().heapUsed;
    if (h > peak) peak = h;
  };
  run(sample);
  return (peak - base) / 1024 / 1024;
}
const N = 500_000;
const memArray = peakHeap((sample) => {
  const a = seed.generate(tsUser, N);
  sample();
  return a.length;
});
const memStream = peakHeap((sample) => {
  let i = 0,
    sum = 0;
  for (const r of seed.stream(tsUser, { count: N })) {
    sum += r.age;
    if (++i % 10_000 === 0) sample();
  }
  return sum;
});
const memBatch = peakHeap((sample) => {
  let sum = 0;
  for (const b of seed.batches(tsUser, { count: N, batchSize: 5_000 })) {
    sum += b.length;
    sample();
  }
  return sum;
});

console.log(
  `\nEnvironment: node ${process.version}, ${os.cpus()[0]?.model}, ${os.cpus().length} cores, ${os.platform()} ${os.arch()}, ${RUNS} runs (median)\n`,
);
console.table(rows);
console.log(`Peak extra heap while producing ${N.toLocaleString()} flat users:`);
console.table([
  { mode: "generate() -> array", peakHeapMB: Number(memArray.toFixed(1)) },
  { mode: "stream() (record at a time)", peakHeapMB: Number(memStream.toFixed(1)) },
  { mode: "batches(5000)", peakHeapMB: Number(memBatch.toFixed(1)) },
]);

// ---- Cold start (fresh process, import only) -------------------------------------------
import { execFileSync } from "node:child_process";
function coldStart(spec, expr) {
  const code = `const s=process.hrtime.bigint();${expr};console.log(Number(process.hrtime.bigint()-s)/1e6)`;
  const samples = [];
  for (let i = 0; i < 7; i++)
    samples.push(Number(execFileSync("node", ["--input-type=module", "-e", code], { encoding: "utf8", cwd: process.cwd() }).trim()));
  return { import: spec, medianMs: Number(median(samples).toFixed(1)) };
}
console.log("Cold import time (fresh process, median of 7):");
console.table([
  coldStart("testseed", `await import("./dist/index.js")`),
  coldStart("@faker-js/faker (fakerEN)", `await import("@faker-js/faker").then(m=>m.fakerEN)`),
  coldStart("fishery", `await import("fishery")`),
  coldStart("json-schema-faker", `await import("json-schema-faker")`),
]);
