import { fromJsonSchema, createSeed } from "testseed";
import { z } from "zod";

const User = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  age: z.number().int().min(18).max(80),
  tags: z.array(z.string().min(1).max(8)).max(3),
});

export function run() {
  // `io: "input"` matters: Zod's default export says additionalProperties:false even though Zod strips unknown keys.
  const schema = fromJsonSchema(z.toJSONSchema(User, { io: "input" }));
  const seed = createSeed({ seed: 2026 });

  const valid = seed.generate(schema, 100);
  const allPassZod = valid.every((v) => User.safeParse(v).success);

  const cases = seed.edgeCases(schema);
  const zodAgrees = cases.every((c) => User.safeParse(c.value).success === c.valid);
  return { allPassZod, zodAgrees, caseCount: cases.length, firstInvalid: cases.find((c) => !c.valid)?.label };
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(run());
