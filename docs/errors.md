# Errors

## Error classes

All extend `TestSeedError` and have `toJSON()`:

| Class                    | Raised when                                                 |
| ------------------------ | ----------------------------------------------------------- |
| `ConfigError`            | An option or definition is invalid.                         |
| `UnsupportedSchemaError` | A JSON Schema keyword is outside the supported subset.      |
| `SchemaError`            | A schema cannot be satisfied.                               |
| `GenerationError`        | A record cannot be generated or validated.                  |
| `OverrideError`          | An override violates the field's schema.                    |
| `RelationshipError`      | A dataset relationship is impossible.                       |
| `CyclicDependencyError`  | Tables depend on each other. `error.cycle` names the cycle. |
| `LimitError`             | A request exceeds `limits`.                                 |

Each carries `code`, `seed`, `path`, `constraint`, `hint` and `issues`. Messages **never include generated values**, and errors thrown by your own code are kept as `error.cause`.

```ts
try {
  seed.build(userFactory, { age: 5 });
} catch (e) {
  if (e instanceof TestSeedError) console.error(e.message, e.path, e.constraint, e.seed, e.hint);
}
// OverrideError: Override for "age" violates the field's schema: value is below minimum 18 (path: age, constraint: min, seed: 42)
```

## Reports

`generateWithReport` collects failures instead of throwing:

```ts
const report = seed.generateWithReport(userFactory, { count: 100, seed: 12345 });
report.ok;
report.failures;
report.reproduce; // seed, factory name, algorithm/package version, traits, override *names*, limits
```

Reports never include generated values either.
