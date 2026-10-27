# Release checklist (human-approved; nothing here runs automatically)

1. Re-check the name: `npm view testseed` (expect 404). Run a USPTO/WIPO/EUIPO search for "TestSeed". Decide on a scoped name (`@you/testseed`) if there is any doubt.
2. Set the real copyright holder in `LICENSE` and `author`/`repository`/`bugs`/`homepage` in `package.json`; enable GitHub private vulnerability reporting.
3. Update `CHANGELOG.md` (replace "unreleased"), bump `version` in `package.json` **and** `src/version.ts`.
4. `npm ci && npm run check && npm run check:package && npm run test:examples`
5. `npm pack --dry-run` — confirm only `dist/`, `README.md`, `LICENSE`, `CHANGELOG.md`, `package.json`.
6. Commit, tag `v0.1.0`, push.
7. Publish (you run this):
   ```bash
   npm login
   npm publish --access public            # add --provenance when run from GitHub Actions
   ```
   Or trigger the _Release_ workflow (dry run first), approving the `npm-publish` environment.
8. Verify from a clean directory: `npm i testseed && node -e "import('testseed').then(m=>console.log(m.VERSION))"`.
