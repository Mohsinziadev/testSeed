# Factories

```ts
seed.factory(fields, { name?, traits?, validator?, maxAttempts? })
```

## Field types

A field is one of three things:

| Field           | Meaning                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------- |
| `(g, ctx) => v` | A function. `g` is the field's private generator, `ctx` is `{ index, sequence, field, seed }`. |
| A `Schema`      | Generated from the schema. Overrides for this field are validated against it.                  |
| A constant      | Passed through by reference (not cloned).                                                      |

`ctx.sequence` is `index + 1`, so `id: (_g, ctx) => ctx.sequence` is unique by construction.

## Generators

Inside a field, `g` offers `g.number.int/float`, `g.string.alpha/alphanumeric/numeric/hex`, `g.text.words/sentence`, `g.date.between/iso`, `g.person.*`, `g.internet.username/email/url/ipv4`, `g.location.address`, `g.phone.number`, `g.boolean`, `g.uuid` and `g.helpers.pick/pickMany/shuffle/weighted/arrayOf/nullable/optional`.

Generated contact data uses reserved or fictional ranges: emails end in example.com, example.org or example.net.

## Traits and overrides

```ts
const userFactory = seed.factory(
  { id: (_g, c) => c.sequence, role: "member" as string },
  { name: "user", traits: { admin: { role: "admin" } } },
);

seed.build(userFactory, { name: "Alex Morgan" }); // override
seed.build(userFactory, {}, { traits: ["admin"] }); // trait
```

Traits replace field specs, and later traits win. Overrides win over traits. Overrides are typed as `Partial<Built<F>>`, so a misspelled key or a wrong type is a compile error. Where a field has a schema, an invalid override throws `OverrideError` at runtime.

## Validating whole records

Pass any synchronous [Standard Schema](https://standardschema.dev) validator (Zod, for instance) as `validator` to check every finished record:

```ts
seed.factory({ id: (g) => g.uuid(), age: (g) => g.number.int({ min: 0, max: 99 }) }, { validator: User, maxAttempts: 50 });
```

A failing record is retried on new deterministic sub-streams up to `maxAttempts`, then throws `GenerationError` with the validator's issues. If every failing path is an overridden field, it throws `OverrideError` immediately.
