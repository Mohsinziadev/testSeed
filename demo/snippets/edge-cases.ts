import { createSeed, t } from "testseed";

const seed = createSeed({ seed: 7 });
const signup = t.object({
  username: t.string({ minLength: 3, maxLength: 12 }),
  age: t.int({ min: 13, max: 120 }),
});

for (const c of seed.edgeCases(signup)) {
  // c.valid, c.category, c.label, c.path, c.constraint, c.value
  console.log(c.valid ? "accept" : "reject", c.label);
}
// accept string at maxLength   reject string above maxLength   reject integer below minimum ...
