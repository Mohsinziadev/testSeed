import { t } from "@mohsinzia/testseed";

/** Boundary and invalid inputs for this schema, each one verified valid or invalid. */
export const signup = t.object({
  username: t.string({ minLength: 3, maxLength: 12 }),
  age: t.int({ min: 13, max: 120 }),
  referrer: t.string({ format: "email" }).optional(),
});
