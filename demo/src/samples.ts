import { createSeed, t } from 'testseed';

/** What the hero's terminal prints. Computed by testseed while the page is built, never typed by hand. */
const seed = createSeed({ seed: 42 });

const userFactory = seed.factory(
  {
    id: (_g, ctx) => ctx.sequence,
    name: (g) => g.person.fullName(),
    email: (g) => g.internet.email(),
    age: t.int({ min: 18, max: 80 }),
  },
  { name: 'user' },
);

export const signup = t.object({
  username: t.string({ minLength: 3, maxLength: 12 }),
  age: t.int({ min: 13, max: 120 }),
});

export const sampleUsers = seed.generate(userFactory, 3);

const cases = seed.edgeCases(signup);
export const edgeSummary = {
  total: cases.length,
  valid: cases.filter((c) => c.valid).length,
  invalid: cases.filter((c) => !c.valid).length,
  examples: cases.slice(0, 4).map((c) => ({ valid: c.valid, label: c.label, path: c.path || '(root)' })),
};
