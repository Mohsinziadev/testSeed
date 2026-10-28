import { createSeed } from "@mohsinzia/testseed";

const seed = createSeed({ seed: "load-test" });
const userFactory = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName() }, { name: "user" });

for (const batch of seed.batches(userFactory, { count: 1_000_000, batchSize: 5000 })) {
  insertMany(batch); // memory stays flat: one batch at a time
}
declare function insertMany(rows: unknown[]): void;
