import pkg from '../../package.json' with { type: 'json' };

/** Real package facts, read from package.json at build time. */
export const PKG = {
  name: pkg.name,
  version: pkg.version,
  license: pkg.license,
  description: pkg.description,
  node: pkg.engines.node,
} as const;

export const REPO = pkg.repository.url.replace(/^git\+/, '').replace(/\.git$/, '');
export const NPM_URL = `https://www.npmjs.com/package/${pkg.name}`;
export const CHANGELOG_URL = `${REPO}/blob/main/CHANGELOG.md`;
export const editUrl = (slug: string) => `${REPO}/edit/main/docs/${slug}.md`;
/** Deep links into the README on GitHub. */
export const readme = (anchor = '') => `${REPO}#${anchor}`;
export const docFile = (file: string) => `${REPO}/blob/main/${file}`;

export const PACKAGE_MANAGERS = ['npm', 'pnpm', 'yarn', 'bun'] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export const installCommand = (pm: PackageManager) =>
  pm === 'npm' ? `npm install --save-dev ${PKG.name}` : `${pm} add -D ${PKG.name}`;

/** M2Toolkit hosts this page at /npm-packages/seedset; links use absolute URLs like the other package pages. */
export const M2TOOLKIT = 'https://www.m2toolkit.com';
export const PACKAGES_URL = `${M2TOOLKIT}/npm-packages`;

/** Other packages in the M2Toolkit registry (titles and taglines from their own site.config.json). */
export const RELATED = [
  {
    slug: 'valiq-js',
    title: 'valiq-js',
    tagline: 'TypeScript-first schema validation with precise, structured errors.',
    accent: '#008039',
  },
  {
    slug: 'chronexa',
    title: 'chronexa',
    tagline: 'A modern date and time toolkit for JavaScript and TypeScript, with explicit time zones.',
    accent: '#c2410c',
  },
  {
    slug: 'm2api-client',
    title: 'API Client',
    tagline: 'A Postman-style API testing workspace you can drop into any React app.',
    accent: '#2a1eff',
  },
].map((p) => ({ ...p, url: `${PACKAGES_URL}/${p.slug}` }));
