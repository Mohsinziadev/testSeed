import { createSeed, t, validate } from "testseed";

// The function under test: a hand-written request validator.
export function isValidSignup(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const { username, age } = body as { username?: unknown; age?: unknown };
  return (
    typeof username === "string" &&
    username.length >= 3 &&
    username.length <= 12 &&
    typeof age === "number" &&
    Number.isInteger(age) &&
    age >= 13 &&
    age <= 120
  );
}

export const signupSchema = t.object({ username: t.string({ minLength: 3, maxLength: 12 }), age: t.int({ min: 13, max: 120 }) });

/** Drives the validator with every boundary and invalid case; returns the cases where it disagrees with the schema. */
export function run() {
  const seed = createSeed({ seed: 1 });
  const cases = seed.edgeCases(signupSchema);
  const disagreements = cases.filter((c) => isValidSignup(c.value) !== c.valid);
  return {
    total: cases.length,
    disagreements: disagreements.map((c) => `${c.label} @ ${c.path || "(root)"}`),
    schemaAgrees: cases.every((c) => (validate(signupSchema, c.value).length === 0) === c.valid),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(run());
