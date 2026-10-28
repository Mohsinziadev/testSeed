import { createSeed } from "@mohsinzia/testseed";

const a = createSeed({ seed: "checkout" });
const b = createSeed({ seed: "checkout" });
const person = (s: typeof a) => s.factory({ name: (g) => g.person.fullName() }, { name: "person" });

// Same seed, same data. A prefix of a bigger run, too:
a.generate(person(a), 10); // identical to the first ten of
b.generate(person(b), 100);

// Unseeded runs pick a random seed and tell you what it was:
const run = createSeed();
console.log(`seed: ${run.seed}`); // SEED=2008428232 npm test
