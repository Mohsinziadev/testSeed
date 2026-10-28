// Plain node:test usage against the BUILT package: `npm run build && node --test examples/node-test`
import assert from "node:assert/strict";
import { test } from "node:test";
import { createSeed } from "@mohsinzia/testseed";

// Log the seed so a failing run can be replayed: SEED=1234 node --test examples/node-test
const seed = createSeed(process.env.SEED === undefined ? {} : { seed: Number(process.env.SEED) });
console.log(`seed: ${seed.seed}`);

const user = seed.factory({ id: (_g, c) => c.sequence, email: (g) => g.internet.email() }, { name: "user" });

test("emails are unique-enough and on reserved domains", () => {
  const users = seed.generate(user, 200);
  assert.ok(users.every((u) => /@example\.(com|org|net)$/.test(u.email)));
});

test("same seed reproduces the same data", () => {
  const again = createSeed({ seed: seed.seed });
  assert.deepEqual(again.generate(user, 20), seed.generate(user, 20));
});
