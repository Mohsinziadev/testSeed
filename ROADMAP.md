# Roadmap

Nothing below is promised; items move up only with evidence of demand (issues, real usage).

**Validate first**: does determinism-by-construction + relational + labelled edge fixtures matter to anyone? Signals: issues, unsolicited usage, requests for the items below.

- Self-referencing tables (trees) in `dataset()`.
- Exact parent-key typing for dataset references.
- `oneOf`, `pattern` (bounded regex subset) and tuples in `fromJsonSchema`.
- Vocabulary packs for other locales as separate optional entry points (tree-shakeable).
- Fixture snapshot/diff helpers.
- A CLI — only if users ask for file output.
- Tested recipes for Jest and Playwright (currently untested, so not documented as supported).
