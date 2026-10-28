# Schemas

Schemas describe a value so TestSeed can generate it, check it and derive edge cases from it.

```ts
import { createSeed, t, validate, type Infer } from "@mohsinzia/testseed";

const signup = t.object({
  username: t.string({ minLength: 3, maxLength: 12 }),
  age: t.int({ min: 13, max: 120 }),
  referrer: t.string({ format: "email" }).optional(),
});

type Signup = Infer<typeof signup>; // { username: string; age: number; referrer?: string | undefined }

const seed = createSeed({ seed: 1 });
seed.sample(signup); // one value
seed.generate(signup, 50); // fifty
validate(signup, input); // [{ path, constraint, message }], never echoes the value
```

## Builders

`t.string`, `t.number`, `t.int`, `t.boolean`, `t.null`, `t.literal`, `t.enum`, `t.date`, `t.dateString`, `t.array`, `t.object` and `t.union`, plus `.nullable()` and `.optional()` (optional only inside `t.object`). `Infer` gives the TypeScript type.

## Zod and JSON Schema

```ts
import { z } from "zod";
import { fromJsonSchema } from "@mohsinzia/testseed";

const User = z.object({ id: z.string().uuid(), age: z.number().int().min(18).max(80) });

// io: "input" matters, see the Zod caveat below.
const schema = fromJsonSchema(z.toJSONSchema(User, { io: "input" }));
seed.generate(schema, 100).every((v) => User.safeParse(v).success); // true
```

Tested with **Zod 4.6** only. Other validators work if they implement the synchronous Standard Schema interface (pass them as a factory `validator`) or export JSON Schema within the supported subset; those are untested here.

### Supported JSON Schema

`type` (including `["x","null"]` and multi-type arrays), `properties`, `required`, `additionalProperties: boolean`, `items`, `minItems`, `maxItems`, `uniqueItems`, `minLength`, `maxLength`, `minimum`, `maximum` (and `exclusiveMinimum` and `exclusiveMaximum` for integers), `enum`, `const` (primitive), `anyOf`, local non-recursive `$ref` and `$defs`, and the formats `email`, `uuid`, `uri` and `date-time`. Annotations (`title`, `description`, `default`, `examples`) and `x-*` keys are ignored.

### Rejected keywords

These throw `UnsupportedSchemaError`, naming the path and keyword: `pattern` (unless attached to a recognised format, as Zod emits), `multipleOf`, `allOf`, `oneOf`, `not`, `if/then/else`, `patternProperties`, `propertyNames`, `dependent*`, `contains`, tuples, recursive or remote `$ref`, other formats, float exclusive bounds and boolean schemas.

### Zod caveat

Zod's default JSON Schema export says `additionalProperties: false` although Zod strips (rather than rejects) unknown keys, so an "unknown property" invalid case would be accepted by Zod. Use `{ io: "input" }`, or `.strict()`. This is pinned by a test.

Formatted strings (`email`, `uuid`, `url`, `date-time`) come from TestSeed's fixed shapes. If the original validator's pattern is stricter, pass it as the factory `validator` to confirm.
