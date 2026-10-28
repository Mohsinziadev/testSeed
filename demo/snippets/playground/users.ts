import { t, type Seed } from "@mohsinzia/testseed";

/** Ten reproducible users. Change the seed and the whole set changes; keep it and nothing does. */
export function users(seed: Seed, count: number) {
  const userFactory = seed.factory(
    {
      id: (_g, ctx) => ctx.sequence,
      name: (g) => g.person.fullName(),
      email: (g) => g.internet.email(),
      age: t.int({ min: 18, max: 80 }),
      role: (g) => g.helpers.weighted([{ value: "member", weight: 8 }, { value: "admin", weight: 1 }]),
    },
    { name: "user" },
  );
  return seed.generate(userFactory, count);
}
