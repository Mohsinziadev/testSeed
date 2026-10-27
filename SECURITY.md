# Security policy

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting ("Security" tab → "Report a vulnerability") on this repository. Expect an acknowledgement within 7 days. _(Maintainer: enable private vulnerability reporting and confirm this contact path before the first release.)_

## What TestSeed is not

TestSeed uses an ordinary seeded PRNG (SFC32). **It must not be used to generate passwords, tokens, API keys, session ids or any security-sensitive value.** `uuid()` is reproducible by design.
Synthetic data is not automatically anonymous, compliant or suitable for every privacy-sensitive workflow; it is invented data, not a de-identification tool.

## Built-in safeguards

- No network access, no telemetry, no file writes, no `eval`/`Function`. Schemas are data; regular expressions from schemas are never compiled (`pattern` is rejected).
- Emails use RFC 2606 reserved domains (`example.com/.org/.net`); phone numbers use the fictional `555-01XX` range; URLs use `*.example.*` — generated contact data cannot reach real people.
- Errors and reports contain paths, constraints, seeds and hints, never generated values. Reports list overridden field _names_ only. User-code exceptions are kept as `error.cause` and are not copied into messages.
- Limits: `maxCount` (1,000,000), `maxArrayLength` (10,000), `maxStringLength` (100,000) bound in-memory allocations; invalid counts throw `ConfigError`.
- The package has zero runtime dependencies; the published tarball is checked for secrets and unexpected files by `npm run test:package`.

## Caveats

- `error.cause` and Standard Schema validator messages may contain whatever the user's code or validator put there.
- Streaming is not capped by `maxCount` (it is lazy); callers bound it with `count`.
