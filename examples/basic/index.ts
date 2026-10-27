import { createSeed, t } from "testseed";

export function run() {
  const seed = createSeed({ seed: 42 });

  const userFactory = seed.factory(
    {
      id: (_g, ctx) => ctx.sequence, // guaranteed unique
      name: (g) => g.person.fullName(),
      email: (g) => g.internet.email(), // always on a reserved example.* domain
      age: t.int({ min: 18, max: 80 }),
      role: "member" as string,
    },
    { name: "user", traits: { admin: { role: "admin" } } },
  );

  const users = seed.generate(userFactory, 3); // same seed => same users, every run
  const alex = seed.build(userFactory, { name: "Alex Morgan", age: 32 }); // typed overrides
  const admin = seed.build(userFactory, {}, { traits: ["admin"] });
  return { users, alex, admin };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(run(), null, 2));
