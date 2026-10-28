import { z } from "zod";
import { createSeed, fromJsonSchema } from "@mohsinzia/testseed";

const User = z.object({ id: z.string().uuid(), age: z.number().int().min(18).max(80) });
const schema = fromJsonSchema(z.toJSONSchema(User, { io: "input" }));

const seed = createSeed({ seed: 1 });
const users = seed.generate(schema, 100);
users.every((u) => User.safeParse(u).success); // true
