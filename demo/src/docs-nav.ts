/**
 * The documentation sidebar. Each slug is a file in ../../docs (docs/<slug>.md); the pages are
 * rendered from those files at build time by content-plugin.ts, so GitHub and the site never drift apart.
 */
export type DocLink = { slug: string; title: string; blurb: string };
export type DocGroup = { title: string; items: DocLink[] };

export const DOC_GROUPS: DocGroup[] = [
  {
    title: 'Introduction',
    items: [
      { slug: 'getting-started', title: 'Getting Started', blurb: 'Install Seedset and generate your first records.' },
      { slug: 'concepts', title: 'Core Concepts', blurb: 'Seeds, per-field streams and the prefix guarantee.' },
    ],
  },
  {
    title: 'Guide',
    items: [
      { slug: 'factories', title: 'Factories', blurb: 'Typed fields, traits, overrides and validators.' },
      { slug: 'schemas', title: 'Schemas', blurb: 'The t.* builders, Zod and JSON Schema.' },
      { slug: 'datasets', title: 'Relational Datasets', blurb: 'Foreign keys, cardinality and distributions.' },
      { slug: 'edge-cases', title: 'Edge Cases', blurb: 'Boundary and invalid inputs, verified.' },
      { slug: 'large-datasets', title: 'Large Datasets', blurb: 'stream, batches and batchesAsync.' },
      { slug: 'test-runners', title: 'Test Runners', blurb: 'Logging the seed and replaying failures.' },
    ],
  },
  {
    title: 'Reference',
    items: [
      { slug: 'errors', title: 'Errors', blurb: 'Error classes, reports and reproducing failures.' },
      { slug: 'api', title: 'API Reference', blurb: 'Every export, method and option.' },
      { slug: 'reproducibility', title: 'Reproducibility', blurb: 'What stays stable across versions.' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { slug: 'comparison', title: 'Comparison', blurb: 'Faker, Fishery, json-schema-faker and more.' },
      { slug: 'limitations', title: 'Limitations', blurb: 'What Seedset deliberately does not do.' },
    ],
  },
];

export const DOC_PAGES: DocLink[] = DOC_GROUPS.flatMap((g) => g.items);
export const DEFAULT_DOC = 'getting-started';
