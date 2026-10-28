import { useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, CheckIcon, CopyIcon, GitHubIcon, Logo } from './icons';
import {
  CHANGELOG_URL,
  docFile,
  installCommand,
  M2TOOLKIT,
  NPM_URL,
  PACKAGE_MANAGERS,
  PACKAGES_URL,
  PKG,
  RELATED,
  REPO,
  type PackageManager,
} from './meta';
import { DOC_GROUPS } from './docs-nav';
import { Playground } from './Playground';
import { docHref } from './router';
import { edgeSummary, sampleUsers } from './samples';
import { Snippet } from './Snippet';

function Install() {
  const [pm, setPm] = useState<PackageManager>('npm');
  const [copied, setCopied] = useState(false);
  const command = installCommand(pm);
  return (
    <div className="install">
      <div className="install-tabs" role="tablist" aria-label="Package manager">
        {PACKAGE_MANAGERS.map((p) => (
          <button key={p} type="button" role="tab" aria-selected={p === pm} onClick={() => setPm(p)}>
            {p}
          </button>
        ))}
      </div>
      <div className="install-cmd">
        <span className="install-prompt" aria-hidden="true">
          $
        </span>
        <code>{command}</code>
        <button
          type="button"
          className="install-copy"
          aria-label={copied ? 'Copied' : `Copy "${command}"`}
          onClick={() =>
            void navigator.clipboard?.writeText(command).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            })
          }
        >
          {copied ? <CheckIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  );
}

/** A terminal printing what Seedset really produces for seed 42 (computed at build time). */
function Terminal() {
  return (
    <div
      className="terminal"
      role="img"
      aria-label="Terminal output of Seedset with seed 42: three generated users, then labelled edge cases for a signup schema, each marked accept or reject."
    >
      <div className="terminal-bar" aria-hidden="true">
        <span />
        <span />
        <span />
        <em>seed-demo.ts</em>
      </div>
      <pre className="terminal-body" aria-hidden="true">
        <span className="t-dim">$ </span>SEED=42 node --run seed{'\n\n'}
        <span className="t-dim"> generate(userFactory, 3)</span>
        {'\n'}
        {sampleUsers.map((u) => (
          <span key={u.id} className="t-row">
            <span className="t-pass">✓</span> <span className="t-badge">user</span>{' '}
            <span className="t-key">#{u.id}</span> <span className="t-val">{u.name}</span>{' '}
            <span className="t-dim">{u.email}</span>
            {'\n'}
          </span>
        ))}
        {'\n'}
        <span className="t-dim"> edgeCases(signup)</span>
        {'\n'}
        {edgeSummary.examples.map((c) => (
          <span key={c.label} className="t-row">
            <span className={c.valid ? 't-pass' : 't-fail'}>{c.valid ? '✓' : '✗'}</span>{' '}
            <span className="t-key">{c.valid ? 'accept' : 'reject'}</span> <span className="t-val">{c.label}</span>{' '}
            <span className="t-dim">{c.path}</span>
            {'\n'}
          </span>
        ))}
        {'\n'}
        <span className="t-dim"> Cases </span>
        <span className="t-pass">{edgeSummary.valid} accept</span> <span className="t-fail">{edgeSummary.invalid} reject</span>{' '}
        <span className="t-dim">({edgeSummary.total})</span>
        {'\n'}
        <span className="t-dim"> Rerun </span>identical output, every time{'\n\n'}
        <span className="t-pass-badge">SEED 42</span> <span className="t-val">same data on every machine</span>
      </pre>
    </div>
  );
}

const FEATURES: { title: string; body: ReactNode; visual: ReactNode; art?: boolean }[] = [
  {
    title: 'Reproduce a failure exactly',
    body: (
      <>
        Same seed, same factory, same output. Every error and report carries the seed, and unseeded runs pick one and
        expose it as <code>seed.seed</code>. <code>generate(f, 10)</code> is always a prefix of <code>generate(f, 100)</code>.
      </>
    ),
    visual: <Snippet name="reproducible" />,
  },
  {
    title: 'Relations that resolve',
    body: (
      <>
        <code>dataset()</code> generates users, orders and items with real foreign keys: cardinality, uniqueness,
        distributions like <code>zipf</code>, and cycle detection that names the cycle.
      </>
    ),
    visual: <Snippet name="relational" />,
  },
  {
    title: 'Boundary and invalid inputs',
    body: (
      <>
        <code>edgeCases(schema)</code> returns labelled cases at every bound, one beyond, plus wrong types and missing
        keys. Each case is re-checked and verified valid or invalid before it is returned.
      </>
    ),
    visual: <Snippet name="edge-cases" className="snippet-floating" />,
    art: true,
  },
  {
    title: 'From Zod or JSON Schema',
    body: (
      <>
        Zod → <code>z.toJSONSchema</code> → <code>fromJsonSchema</code>, and the outputs can be checked by the original
        validator. Unsupported keywords are rejected with a path, never silently ignored.
      </>
    ),
    visual: (
      <>
        <Snippet name="schema" />
        <ul className="chips" aria-label="Schema sources">
          {['Zod 4', 'JSON Schema', 'Standard Schema'].map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </>
    ),
  },
  {
    title: 'Millions of rows, flat memory',
    body: (
      <>
        <code>stream()</code>, <code>batches()</code> and <code>batchesAsync()</code> yield exactly the records{' '}
        <code>generate()</code> would, one batch at a time, with abort between batches.
      </>
    ),
    visual: <Snippet name="stream" />,
  },
  {
    title: 'Errors that explain themselves',
    body: (
      <>
        Failures give the path, constraint, seed and a hint, and never print the generated value. Typed overrides are
        compile errors, and schema-backed fields reject bad overrides at runtime.
      </>
    ),
    visual: <Snippet name="errors" />,
  },
];

const STATS = [
  { value: '0', label: 'Runtime dependencies' },
  { value: '~18 kB', label: 'min+gzip, the whole library' },
  { value: '173', label: 'small synthetic vocabulary entries' },
  { value: 'ESM + CJS', label: 'Node.js 20+, types included' },
];

const COMPARE: { row: string; cells: string[] }[] = [
  { row: 'Large multi-locale value library', cells: ['no (173 entries)', 'yes', 'no', 'optional via Faker'] },
  { row: 'Typed factories', cells: ['yes', 'no', 'yes', 'no'] },
  { row: 'Per-field stream isolation', cells: ['yes', 'not documented', 'n/a', 'not documented'] },
  { row: 'Relational datasets with FK checks', cells: ['yes', 'no', 'associations only', 'no'] },
  { row: 'Labelled boundary / invalid fixtures', cells: ['yes', 'no', 'no', 'not found'] },
  { row: 'Streaming generation', cells: ['yes', 'no', 'no', 'no'] },
  { row: 'JSON Schema coverage', cells: ['small subset', '–', '–', 'broad'] },
  { row: 'Runtime dependencies', cells: ['0', '0', '0', '0'] },
];

export function Home() {
  return (
    <main id="main" tabIndex={-1} className="home-view">
      <div className="frame">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              by <a href={PACKAGES_URL}>M2Toolkit</a> <span className="eyebrow-sep">·</span> v{PKG.version}{' '}
              <span className="eyebrow-sep">·</span> early release
            </p>
            <h1 className="hero-title">
              Test data you can
              <br />
              replay exactly.
            </h1>
            <p className="hero-tagline">
              Deterministic, schema-aware, relational fixtures and edge cases for TypeScript and JavaScript. Zero
              runtime dependencies.
            </p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref('getting-started')}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Try the playground
              </a>
              <a className="btn" href={REPO} target="_blank" rel="noreferrer">
                View on GitHub
              </a>
            </div>
            <Install />
          </div>
          <div className="hero-art art">
            <Terminal />
          </div>
        </section>

        <section className="why" aria-labelledby="why-title">
          <div>
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Why Seedset
            </p>
            <h2 id="why-title" className="section-title">
              A fixture engine,
              <br />
              not another Faker.
            </h2>
            <a className="btn" href={docHref('concepts')}>
              Learn more
            </a>
          </div>
          <div className="why-copy">
            <p>
              Describe your records once and get the same data on every machine: typed factories, relational datasets
              whose foreign keys resolve, and labelled boundary and invalid cases for any schema.
            </p>
            <p>
              Each (record, field) has its own random stream, so adding a field never churns your existing snapshots.
              Use Faker inside a field function when you need a richer vocabulary; Seedset handles the structure. Framework-agnostic: plain functions with no adapter, and zero dependencies.
            </p>
            <Snippet name="hero" />
          </div>
        </section>

        <section className="statement">
          <h2 className="statement-title">Seeded. Relational. Verified.</h2>
        </section>

        <section className="features" id="features" aria-label="Features">
          {FEATURES.map((f) => (
            <article key={f.title} className="feature">
              <h3>{f.title}</h3>
              <p>{f.body}</p>
              <div className={f.art ? 'feature-visual art' : 'feature-visual'}>{f.visual}</div>
            </article>
          ))}
        </section>
        <div className="features-more">
          <a className="btn" href={docHref('factories')}>
            Read the guide
          </a>
        </div>

        <Playground />

        <section className="stats" aria-label="Seedset in numbers">
          {STATS.map((s) => (
            <div key={s.label} className="stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <section className="compare" id="compare" aria-labelledby="compare-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Comparison
            </p>
            <h2 id="compare-title" className="section-title">
              Where it fits next to the tools you already use.
            </h2>
            <p className="section-lead">
              Competitors are better at what they target. Use them together, for example Faker values inside a Seedset
              field. Based on the docs reviewed on 2026-10-27; see the{' '}
              <a href={docFile('docs/MARKET-RESEARCH.md')} target="_blank" rel="noreferrer">
                evidence and gaps
              </a>
              .
            </p>
          </div>
          <div className="compare-wrap">
            <table className="compare-table">
              <thead>
                <tr>
                  <th scope="col">Capability</th>
                  <th scope="col" className="compare-us">
                    Seedset
                  </th>
                  <th scope="col">Faker</th>
                  <th scope="col">Fishery</th>
                  <th scope="col">json-schema-faker</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((r) => (
                  <tr key={r.row}>
                    <th scope="row">{r.row}</th>
                    {r.cells.map((c, i) => (
                      <td key={i} className={i === 0 ? 'compare-us' : undefined}>
                        {c}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="docs-index" id="documentation" aria-labelledby="docs-index-title">
          <div className="section-head">
            <p className="eyebrow eyebrow-brand">
              <CheckIcon /> Documentation
            </p>
            <h2 id="docs-index-title" className="section-title">
              From your first factory to million-row streams.
            </h2>
          </div>
          <div className="docs-index-groups">
            {DOC_GROUPS.map((g) => (
              <div key={g.title} className="docs-index-group">
                <h3>{g.title}</h3>
                <ul>
                  {g.items.map((d) => (
                    <li key={d.slug}>
                      <a href={docHref(d.slug)}>
                        <span className="docs-index-title">
                          {d.title} <ArrowRight width={14} height={14} />
                        </span>
                        <span className="docs-index-blurb">{d.blurb}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="related" aria-labelledby="related-title">
          <div className="section-head">
            <p className="eyebrow">m2toolkit</p>
            <h2 id="related-title" className="section-title">
              More open-source packages from M2Toolkit.
            </h2>
          </div>
          <ul className="related-list">
            {RELATED.map((p) => (
              <li key={p.slug}>
                <a href={p.url} style={{ '--accent': p.accent } as CSSProperties}>
                  <span className="related-dot" aria-hidden="true" />
                  <span className="related-title">{p.title}</span>
                  <span className="related-tag">{p.tagline}</span>
                  <span className="related-go">
                    /npm-packages/{p.slug} <ArrowRight width={14} height={14} />
                  </span>
                </a>
              </li>
            ))}
            <li>
              <a href={PACKAGES_URL} className="related-all">
                <span className="related-title">All npm packages</span>
                <span className="related-tag">Every package we publish, with live previews.</span>
                <span className="related-go">
                  browse all <ArrowRight width={14} height={14} />
                </span>
              </a>
            </li>
          </ul>
        </section>

        <section className="cta art">
          <div className="cta-card">
            <h2>Make your tests repeatable with Seedset</h2>
            <p>One seed in, the same data out. Every failure comes with the seed that reproduces it.</p>
            <div className="hero-actions">
              <a className="btn btn-brand" href={docHref('getting-started')}>
                Get Started
              </a>
              <a className="btn" href="#playground">
                Open the playground
              </a>
            </div>
          </div>
        </section>
      </div>

      <footer className="footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <Logo />
            <p>{PKG.description}</p>
          </div>
          <div>
            <h3>Docs</h3>
            <a href={docHref('getting-started')}>Getting Started</a>
            <a href={docHref('factories')}>Factories</a>
            <a href={docHref('datasets')}>Relational datasets</a>
            <a href={docHref('edge-cases')}>Edge cases</a>
            <a href={docHref('api')}>API Reference</a>
          </div>
          <div>
            <h3>Resources</h3>
            <a href={REPO} target="_blank" rel="noreferrer">
              <GitHubIcon width={14} height={14} /> GitHub
            </a>
            <a href={NPM_URL} target="_blank" rel="noreferrer">
              npm
            </a>
            <a href={CHANGELOG_URL} target="_blank" rel="noreferrer">
              Changelog
            </a>
            <a href={docFile('SECURITY.md')} target="_blank" rel="noreferrer">
              Security policy
            </a>
          </div>
          <div>
            <h3>M2Toolkit</h3>
            <a href={M2TOOLKIT}>Home</a>
            <a href={`${M2TOOLKIT}/tools`}>Free tools</a>
            <a href={PACKAGES_URL}>npm packages</a>
            <a href={`${M2TOOLKIT}/about`}>About</a>
          </div>
        </div>
        <p className="footer-bottom">
          Released under the {PKG.license} License. © 2026 Mohsin Zia. Hosted on{' '}
          <a href={PACKAGES_URL}>m2toolkit.com/npm-packages</a>.
        </p>
      </footer>
    </main>
  );
}
