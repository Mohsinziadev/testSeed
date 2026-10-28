import { TestSeedError, createSeed, t } from "@mohsinzia/testseed";

const seed = createSeed({ seed: 42 });
const userFactory = seed.factory({ age: t.int({ min: 18, max: 80 }) }, { name: "user" });

try {
  seed.build(userFactory, { age: 5 });
} catch (e) {
  if (e instanceof TestSeedError) console.error(e.message, e.path, e.constraint, e.seed, e.hint);
}
// OverrideError: Override for "age" violates the field's schema:
//   value is below minimum 18 (path: age, constraint: min, seed: 42)
