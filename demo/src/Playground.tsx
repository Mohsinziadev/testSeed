import { useMemo, useState } from 'react';
import { createSeed } from 'seedset';
import { shop } from '../snippets/playground/shop';
import { signup } from '../snippets/playground/signup';
import { users } from '../snippets/playground/users';
import { docHref } from './router';
import { Snippet } from './Snippet';

const json = (value: unknown) => JSON.stringify(value, null, 2);

type Preset = { id: 'users' | 'shop' | 'edge'; label: string; file: string; count: number; note: string; link: string };

const PRESETS: Preset[] = [
  {
    id: 'users',
    label: 'Seeded users',
    file: 'playground/users',
    count: 5,
    note: 'Change the seed and every user changes. Set it back and the same users return. Raise the count: the first five never move.',
    link: 'concepts',
  },
  {
    id: 'shop',
    label: 'Relational shop',
    file: 'playground/shop',
    count: 8,
    note: 'Orders reference real users (zipf: a few heavy buyers), items reference real orders. The check below runs on the generated data.',
    link: 'datasets',
  },
  {
    id: 'edge',
    label: 'Edge cases',
    file: 'playground/signup',
    count: 5,
    note: 'Every accept case passes the schema and every reject case fails it; mismatches are dropped, never relabelled. Count adds random valid values.',
    link: 'edge-cases',
  },
];

type Outcome = { ok: true; value: unknown; checks?: string[] } | { ok: false; message: string };

function run(preset: Preset, seedText: string, count: number): Outcome {
  try {
    const seed = createSeed({ seed: /^-?\d+$/.test(seedText) ? Number(seedText) : seedText });
    if (preset.id === 'users') return { ok: true, value: users(seed, count) };
    if (preset.id === 'shop') {
      const data = shop(seed, count);
      const userIds = new Set(data.users.map((u) => u.id));
      const orderIds = new Set(data.orders.map((o) => o.id));
      const badOrders = data.orders.filter((o) => !userIds.has(o.userId as number)).length;
      const badItems = data.items.filter((i) => !orderIds.has(i.orderId as number)).length;
      return {
        ok: true,
        value: { ...data, users: data.users.slice(0, 3), orders: data.orders.slice(0, 3), items: data.items.slice(0, 3) },
        checks: [
          `${data.users.length} users · ${data.orders.length} orders · ${data.items.length} items`,
          `${badOrders} orders point at a missing user`,
          `${badItems} items point at a missing order`,
        ],
      };
    }
    const cases = seed.edgeCases(signup, { random: count });
    return {
      ok: true,
      value: cases.map((c) => ({
        [c.valid ? 'accept' : 'reject']: c.label,
        path: c.path || '(root)',
        value: c.value,
      })),
      checks: [`${cases.filter((c) => c.valid).length} accept · ${cases.filter((c) => !c.valid).length} reject`],
    };
  } catch (error) {
    return { ok: false, message: `${(error as Error).name}: ${(error as Error).message}` };
  }
}

export function Playground() {
  const [presetId, setPresetId] = useState<Preset['id']>('users');
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [seedText, setSeedText] = useState('42');
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(PRESETS.map((p) => [p.id, p.count])));
  const count = counts[preset.id]!;
  const outcome = useMemo(() => run(preset, seedText.trim() || '0', count), [preset, seedText, count]);

  return (
    <section className="playground" id="playground" aria-labelledby="playground-title">
      <div className="section-head">
        <p className="eyebrow eyebrow-brand">Playground</p>
        <h2 id="playground-title" className="section-title">
          Try it live. Change the seed, watch the data.
        </h2>
        <p className="section-lead">
          Every result below is generated in your browser by the same Seedset source this page documents. Nothing is
          mocked.
        </p>
      </div>

      <div className="pg-tabs" role="tablist" aria-label="Example">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={p.id === preset.id} onClick={() => setPresetId(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="pg-grid">
        <div className="pg-panel">
          <div className="pg-head">
            <span>Code</span>
            <span className="pg-file">{preset.file.split('/')[1]}.ts</span>
          </div>
          <Snippet name={preset.file} className="pg-code" />
        </div>

        <div className="pg-panel">
          <div className="pg-head">
            <span>Options</span>
            <button
              type="button"
              className="pg-reset"
              onClick={() => {
                setSeedText('42');
                setCounts((all) => ({ ...all, [preset.id]: preset.count }));
              }}
            >
              Reset
            </button>
          </div>
          <div className="pg-fields">
            <label>
              <span>Seed</span>
              <input
                value={seedText}
                spellCheck={false}
                onChange={(e) => setSeedText(e.target.value)}
                aria-label="Seed (number or text)"
              />
            </label>
            <label>
              <span>{preset.id === 'shop' ? 'Orders' : preset.id === 'edge' ? 'Random valid cases' : 'Count'}</span>
              <input
                type="number"
                min={preset.id === 'edge' ? 0 : 1}
                max={200}
                value={count}
                onChange={(e) => {
                  const n = Math.max(preset.id === 'edge' ? 0 : 1, Math.min(200, Math.floor(Number(e.target.value)) || 0));
                  setCounts((all) => ({ ...all, [preset.id]: n }));
                }}
                aria-label="Count"
              />
            </label>
            <button type="button" className="btn" onClick={() => setSeedText(String(Math.floor(Math.random() * 1e6)))}>
              Random seed
            </button>
          </div>
        </div>

        <div className="pg-panel pg-result" aria-live="polite">
          <div className="pg-head">
            {outcome.ok ? (
              <span className="pg-status pg-pass">✓ Generated</span>
            ) : (
              <span className="pg-status pg-fail">✗ Error</span>
            )}
            {outcome.ok && outcome.checks && <span className="pg-file">{outcome.checks[0]}</span>}
          </div>
          <div className="pg-body">
            {outcome.ok ? (
              <>
                {outcome.checks && outcome.checks.length > 1 && (
                  <p className="pg-params">{outcome.checks.slice(1).join(' · ')}</p>
                )}
                <pre className="pg-pre">{json(outcome.value)}</pre>
              </>
            ) : (
              <p className="pg-error">{outcome.message}</p>
            )}
          </div>
        </div>
      </div>
      <p className="pg-note">
        {preset.note} <a href={docHref(preset.link)}>Read more →</a>
      </p>
    </section>
  );
}
