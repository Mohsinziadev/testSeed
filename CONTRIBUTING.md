# Contributing

```bash
git clone <repo> && cd testseed
npm ci
npm run check        # typecheck + lint + format:check + tests + build + packed-artifact test
```

Individual scripts: `npm test`, `npm run typecheck`, `npm run lint`, `npm run format` (writes), `npm run benchmark`, `npm run test:package`, `npm run test:examples`.

## Ground rules

- **Seeded output is an API.** If `tests/determinism/golden.test.ts` fails, you changed seeded output. That is a breaking change: bump `ALGORITHM_VERSION`, update the snapshots deliberately, and add a "Reproducibility" entry to the changelog. Do not just run `vitest -u`.
- No `Math.random()` (lint-enforced), no runtime dependencies, no network, no module-level mutable state.
- No silent fallbacks: if a constraint can't be met, throw a `SeedsetError` with path/constraint/hint.
- New schema features must be handled by generation, validation **and** edge cases, with tests that check behaviour (not just "doesn't throw").
- Public type changes need a test in `tests/types/`.
- Don't claim integrations or compatibility that aren't tested.

## Pull requests

Describe the problem, add tests, update docs/CHANGELOG. CI must be green.
