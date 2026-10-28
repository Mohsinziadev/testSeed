import { createSeed, t } from "testseed";

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

const users = seed.generate(userFactory, 100); // same 100 users every run
const alex = seed.build(userFactory, { name: "Alex Morgan", age: 32 }); // typed overrides
