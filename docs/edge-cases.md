# Edge Cases

`seed.edgeCases(schema)` returns labelled boundary and invalid inputs for any schema.

```ts
const cases = seed.edgeCases(signup, { random: 5 });
for (const c of cases) {
  // c.valid, c.category: "boundary" | "invalid" | "random", c.label, c.path, c.constraint, c.value
  expect(isValidSignup(c.value)).toBe(c.valid);
}
```

## Options

| Option    | Meaning                                                                 |
| --------- | ----------------------------------------------------------------------- |
| `include` | `["valid"]`, `["invalid"]` or both (default).                           |
| `random`  | Extra random valid values appended after the boundary cases. Default 0. |
| `limit`   | Cap on boundary and invalid cases, in generation order. Default 1000.   |

## What is generated

- **Strings:** at min and max length and one beyond, empty, Unicode (astral, accented, CJK), whitespace-only, very long.
- **Numbers:** integers and floats at both bounds and the adjacent representable value outside, plus `NaN` and `Infinity`.
- **Arrays:** empty, min, max, plus or minus one, and duplicates (valid or invalid depending on `unique`).
- **Objects:** missing or undefined required properties, omitted optional ones, `null`, and unknown properties for strict objects.
- **Enums:** every member, and one non-member.
- **Dates:** bounds, plus or minus 1 ms, the epoch, a leap day, 32-bit rollover and impossible dates.
- **Wrong types** for every position.

## Guarantees

Every `valid: true` case passes the schema and every `valid: false` case fails it. Cases are re-checked before they are returned, and a case whose verdict differs from the intended one (possible in unions) is **dropped, never relabelled**. Cases larger than your `limits` are omitted.

Edge cases are **boundary-focused, not an exhaustive search**, and there is no shrinking.

Runnable: [`examples/api`](../examples/api/index.ts).
