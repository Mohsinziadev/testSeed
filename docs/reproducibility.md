# Reproducibility

Seeded output is stable within a release line: the **minor** version while the package is 0.x, and the **major** version from 1.0.

- `ALGORITHM_VERSION` (currently **1**) names the seeded algorithm. It is exported, included in reports, and pinned by golden tests.
- Changing any seeded output of a documented API (the algorithm, the vocabulary, or probabilities such as the 0.8 optional-presence and 0.15 null chances) is a breaking change. It bumps `ALGORITHM_VERSION` and the line.
- New generators and new options never alter existing output. Bug fixes that alter output still count as breaking and are listed in the changelog.
- `report.algorithmVersion` and `report.packageVersion` record what produced a run.

## Platform notes

Output depends on the JavaScript engine only through `Date` and `toISOString`, which are standardised, and floating point is IEEE-754 on all supported runtimes. Cross-engine equality is tested only on Node.

## Upgrading

Seedset follows [SemVer](https://semver.org). While it is 0.x, breaking API changes may land in minor releases. To upgrade, read the [changelog](../CHANGELOG.md), re-run your tests, and refresh any committed snapshots when the changelog lists a "Reproducibility" change. To stay stable, pin an exact version or a `~` range.
