# Limitations

- **Not for secrets, tokens, passwords or keys.** It is an ordinary seeded PRNG, and `uuid()` is reproducible.
- **Synthetic is not anonymous or compliant.** The data is invented, and contact data uses reserved or fictional ranges.
- **Small vocabulary.** Names and addresses are plausible-looking only.
- **JSON Schema support is a documented subset.** `pattern`, `oneOf`, `allOf`, recursion and tuples are rejected.
- **Datasets:** no self-referencing tables, reference keys are typed `string | number`, and everything is in memory.
- **Edge cases** are boundary-focused, not an exhaustive search, and there is no shrinking.
- **Async validators are unsupported.** Generation is synchronous.
- **Runtimes:** developed and tested on Node 22 (macOS arm64), `engines` is `>=20`. Browsers, Deno and Bun are untested.
- **Demand for the differentiators is unvalidated.** See the [roadmap](../ROADMAP.md).

## Security and privacy

No network, telemetry, file writes or code evaluation. Errors and reports never include generated values. See the [security policy](../SECURITY.md).
