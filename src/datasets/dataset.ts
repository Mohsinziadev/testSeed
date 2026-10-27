import { ConfigError, CyclicDependencyError, RelationshipError } from "../errors.js";
import { Gen } from "../generators/gen.js";
import type { Rng } from "../random/rng.js";
import type { AnyFactory, BuildEnv, Built } from "../factories/factory.js";
import { buildRecord } from "../factories/factory.js";

export type Key = string | number;

/** How a child picks its parent: uniformly, Zipf-skewed (a few parents get most children), or custom. */
export type Distribution = "uniform" | "zipf" | ((parentCount: number, g: Gen) => number);

export interface RefSpec {
  /** Name of the parent table (a key of the dataset spec). */
  readonly to: string;
  /** Parent field holding the identifier. Default `"id"`. */
  readonly key?: string;
  /** Each parent is referenced at most once (one-to-one). Requires child count <= parent count. */
  readonly unique?: boolean;
  /** Probability (0-1) that the reference is `null`. */
  readonly nullable?: number;
  /** The field is an array of distinct parent keys with a length in this range (many-to-many via array). */
  readonly many?: { readonly min: number; readonly max: number };
  readonly distribution?: Distribution;
}

export interface TableSpec {
  readonly factory: AnyFactory;
  /** Number of rows. Omit when using `perParent`. */
  readonly count?: number;
  /** Foreign-key fields: field name -> reference. */
  readonly refs?: Readonly<Record<string, RefSpec>>;
  /** Derive the row count from a parent: every parent gets `min`..`max` children via `ref`. */
  readonly perParent?: { readonly ref: string; readonly min: number; readonly max: number };
  /** Reference fields whose combined values must be distinct (join tables). */
  readonly uniqueTogether?: readonly string[];
  readonly traits?: readonly string[];
}

export type DatasetSpec = Readonly<Record<string, TableSpec>>;

type RefValue<R> = R extends { readonly many: unknown } ? Key[] : R extends { readonly nullable: number } ? Key | null : Key;

type Row<T extends TableSpec> = Built<T["factory"]["fields"]> &
  (T extends { readonly refs: infer R } ? { [P in keyof R]: RefValue<R[P]> } : unknown);

/** Result of `dataset()`: one array per table, in declaration order. */
export type DatasetResult<D extends DatasetSpec> = { [K in keyof D]: Row<D[K]>[] };

function checkCount(table: string, count: number, env: BuildEnv): void {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new ConfigError(`Table "${table}": count must be a non-negative integer (got ${count})`, { path: table, constraint: "count" });
  }
  if (count > env.limits.maxCount) {
    throw new ConfigError(`Table "${table}": count ${count} exceeds limits.maxCount (${env.limits.maxCount})`, {
      path: table,
      constraint: "count",
      hint: "Raise `limits.maxCount` in createSeed(), or use stream() for very large data.",
    });
  }
}

function validateSpec(spec: DatasetSpec): string[] {
  const names = Object.keys(spec);
  if (names.length === 0) throw new ConfigError("dataset() needs at least one table");
  for (const [table, def] of Object.entries(spec)) {
    const refs = def.refs ?? {};
    if (def.perParent !== undefined && def.count !== undefined) {
      throw new ConfigError(`Table "${table}": specify either count or perParent, not both`, { path: table });
    }
    if (def.perParent === undefined && def.count === undefined) {
      throw new ConfigError(`Table "${table}": specify count or perParent`, { path: table });
    }
    for (const [field, ref] of Object.entries(refs)) {
      if (!names.includes(ref.to)) {
        throw new RelationshipError(`Table "${table}": ref "${field}" points to unknown table "${ref.to}"`, {
          path: `${table}.${field}`,
          constraint: "ref.to",
          hint: `Known tables: ${names.join(", ")}`,
        });
      }
      if (ref.nullable !== undefined && !(ref.nullable >= 0 && ref.nullable <= 1)) {
        throw new ConfigError(`Table "${table}": ref "${field}" nullable must be within [0, 1]`, { path: `${table}.${field}` });
      }
      if (ref.many !== undefined) {
        const { min, max } = ref.many;
        if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || min > max) {
          throw new ConfigError(`Table "${table}": ref "${field}" many needs integers 0 <= min <= max`, { path: `${table}.${field}` });
        }
        if (ref.unique === true)
          throw new ConfigError(`Table "${table}": ref "${field}" cannot combine many and unique`, { path: `${table}.${field}` });
      }
    }
    if (def.perParent !== undefined) {
      const { ref, min, max } = def.perParent;
      if (refs[ref] === undefined)
        throw new RelationshipError(`Table "${table}": perParent.ref "${ref}" is not declared in refs`, { path: table });
      if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min < 0 || min > max) {
        throw new ConfigError(`Table "${table}": perParent needs integers 0 <= min <= max`, { path: table });
      }
      if (refs[ref]?.many !== undefined) throw new ConfigError(`Table "${table}": perParent cannot use a many ref`, { path: table });
    }
    for (const field of def.uniqueTogether ?? []) {
      if (refs[field] === undefined)
        throw new ConfigError(`Table "${table}": uniqueTogether field "${field}" must be a declared ref`, { path: table });
    }
  }
  return topoSort(spec, names);
}

/** Kahn's algorithm, ties broken by declaration order so the order is stable. */
function topoSort(spec: DatasetSpec, names: readonly string[]): string[] {
  const deps = new Map<string, Set<string>>();
  for (const name of names) {
    const set = new Set<string>();
    for (const ref of Object.values(spec[name]?.refs ?? {})) set.add(ref.to);
    deps.set(name, set);
    if (set.has(name))
      throw new CyclicDependencyError([name, name], {
        hint: "Self-references (trees) are not supported; generate the hierarchy with a custom factory field instead.",
      });
  }
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < names.length) {
    const next = names.find((n) => !done.has(n) && [...(deps.get(n) ?? [])].every((d) => done.has(d)));
    if (next === undefined)
      throw new CyclicDependencyError(
        findCycle(
          deps,
          names.filter((n) => !done.has(n)),
        ),
      );
    done.add(next);
    order.push(next);
  }
  return order;
}

function findCycle(deps: ReadonlyMap<string, ReadonlySet<string>>, remaining: readonly string[]): string[] {
  const rem = new Set(remaining);
  const path: string[] = [];
  const onPath = new Set<string>();
  const visit = (n: string): string[] | undefined => {
    if (onPath.has(n)) return [...path.slice(path.indexOf(n)), n];
    path.push(n);
    onPath.add(n);
    for (const d of deps.get(n) ?? []) {
      if (!rem.has(d)) continue;
      const found = visit(d);
      if (found !== undefined) return found;
    }
    path.pop();
    onPath.delete(n);
    return undefined;
  };
  for (const n of remaining) {
    const found = visit(n);
    if (found !== undefined) return found;
  }
  return [...remaining];
}

interface ParentIndex {
  readonly keys: readonly Key[];
}

function buildParentIndex(table: string, field: string, rows: readonly Record<string, unknown>[], seed: Key): ParentIndex {
  const keys: Key[] = [];
  const seen = new Set<Key>();
  for (let i = 0; i < rows.length; i++) {
    const value = (rows[i] as Record<string, unknown>)[field];
    if (typeof value !== "string" && typeof value !== "number") {
      throw new RelationshipError(`Table "${table}" row ${i}: key field "${field}" must be a string or number to be referenced`, {
        path: `${table}.${field}`,
        constraint: "ref.key",
        seed,
        hint: `Add a "${field}" field to the "${table}" factory (e.g. id: (g, ctx) => ctx.sequence).`,
      });
    }
    if (seen.has(value)) {
      throw new RelationshipError(`Table "${table}": key field "${field}" is not unique (duplicate at row ${i})`, {
        path: `${table}.${field}`,
        constraint: "unique",
        seed,
        hint: "Use ctx.sequence for guaranteed-unique ids; random UUIDs are unique only with overwhelming probability.",
      });
    }
    seen.add(value);
    keys.push(value);
  }
  return { keys };
}

function zipfCumulative(n: number): number[] {
  const cumulative: number[] = [];
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += 1 / i;
    cumulative.push(total);
  }
  return cumulative;
}

function pickIndex(distribution: Distribution, n: number, rng: Rng, cumulative: readonly number[] | undefined, path: string): number {
  if (typeof distribution === "function") {
    const idx = distribution(n, new Gen(rng));
    if (!Number.isInteger(idx) || idx < 0 || idx >= n) {
      throw new RelationshipError(`Custom distribution returned ${idx}; expected an integer in [0, ${n - 1}]`, {
        path,
        constraint: "distribution",
      });
    }
    return idx;
  }
  if (distribution === "zipf" && cumulative !== undefined) {
    const target = rng.float() * (cumulative[cumulative.length - 1] as number);
    let lo = 0;
    let hi = cumulative.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((cumulative[mid] as number) > target) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  }
  return rng.int(0, n - 1);
}

/**
 * Generate related tables in memory. Pure function of (seed, spec): calling it twice returns equal data.
 * Tables are generated parents-first; the result keeps declaration order.
 */
export function generateDataset(spec: DatasetSpec, env: BuildEnv): Record<string, Record<string, unknown>[]> {
  const order = validateSpec(spec);
  const data = new Map<string, Record<string, unknown>[]>();
  const indexes = new Map<string, ParentIndex>();
  const dsRng = env.root.fork("dataset");

  for (const table of order) {
    const def = spec[table] as TableSpec;
    const refs = Object.entries(def.refs ?? {});

    const parentOf = (ref: RefSpec): ParentIndex => {
      const key = ref.key ?? "id";
      const cacheKey = `${ref.to}\u0000${key}`;
      let index = indexes.get(cacheKey);
      if (index === undefined) {
        index = buildParentIndex(ref.to, key, data.get(ref.to) ?? [], env.seed);
        indexes.set(cacheKey, index);
      }
      return index;
    };

    // Row count (and, for perParent, the parent assigned to each row).
    let count: number;
    let assigned: number[] | undefined;
    if (def.perParent !== undefined) {
      const ref = def.refs?.[def.perParent.ref] as RefSpec;
      const parents = parentOf(ref).keys;
      const perRng = dsRng.fork(table).fork("perParent");
      assigned = [];
      for (let p = 0; p < parents.length; p++) {
        const n = perRng.fork(p).int(def.perParent.min, def.perParent.max);
        for (let c = 0; c < n; c++) assigned.push(p);
        if (assigned.length > env.limits.maxCount) checkCount(table, assigned.length, env);
      }
      count = assigned.length;
    } else {
      count = def.count as number;
    }
    checkCount(table, count, env);

    // Resolve foreign keys for every row.
    const fks: Record<string, unknown>[] = Array.from({ length: count }, () => ({}));
    const usedTuples = def.uniqueTogether !== undefined ? new Set<string>() : undefined;
    const uniquePools = new Map<string, number[]>();
    const zipfCache = new Map<string, number[]>();

    for (const [field, ref] of refs) {
      const path = `${table}.${field}`;
      const parents = parentOf(ref).keys;
      const n = parents.length;
      const refRng = dsRng.fork(table).fork(`ref:${field}`);
      const distribution = ref.distribution ?? "uniform";
      const isPerParentField = def.perParent?.ref === field;

      if (ref.many !== undefined) {
        if (ref.many.min > n) {
          throw new RelationshipError(`${path}: needs at least ${ref.many.min} distinct "${ref.to}" parents but only ${n} exist`, {
            path,
            constraint: "many.min",
            seed: env.seed,
            hint: `Increase the "${ref.to}" count or lower many.min.`,
          });
        }
        for (let i = 0; i < count; i++) {
          const rowRng = refRng.fork(i);
          const size = rowRng.int(ref.many.min, Math.min(ref.many.max, n));
          const chosen = new Set<number>();
          while (chosen.size < size) chosen.add(pickIndex(distribution, n, rowRng, undefined, path));
          (fks[i] as Record<string, unknown>)[field] = [...chosen].map((idx) => parents[idx] as Key);
        }
        continue;
      }

      if (ref.unique === true && count > n && !(ref.nullable === 1)) {
        throw new RelationshipError(`${path}: one-to-one needs at most ${n} rows but ${count} were requested`, {
          path,
          constraint: "unique",
          seed: env.seed,
          hint: `Lower the "${table}" count to <= ${n}, increase "${ref.to}", or make the reference nullable.`,
        });
      }
      if (n === 0 && count > 0 && ref.nullable !== 1) {
        throw new RelationshipError(`${path}: cannot reference "${ref.to}" because it has no rows`, {
          path,
          constraint: "empty-parent",
          seed: env.seed,
          hint: `Give "${ref.to}" a positive count, or set nullable: 1 on this reference.`,
        });
      }
      if (distribution === "zipf" && n > 0 && !zipfCache.has(field)) zipfCache.set(field, zipfCumulative(n));
      if (ref.unique === true) {
        const permutation = Array.from({ length: n }, (_, i) => i);
        const shuffleRng = refRng.fork("perm");
        for (let i = n - 1; i > 0; i--) {
          const j = shuffleRng.int(0, i);
          const tmp = permutation[i] as number;
          permutation[i] = permutation[j] as number;
          permutation[j] = tmp;
        }
        uniquePools.set(field, permutation);
      }

      let uniqueCursor = 0;
      for (let i = 0; i < count; i++) {
        const rowRng = refRng.fork(i);
        if (ref.nullable !== undefined && rowRng.chance(ref.nullable)) {
          (fks[i] as Record<string, unknown>)[field] = null;
          continue;
        }
        let idx: number;
        if (isPerParentField && assigned !== undefined) idx = assigned[i] as number;
        else if (ref.unique === true) idx = (uniquePools.get(field) as number[])[uniqueCursor++] as number;
        else idx = pickIndex(distribution, n, rowRng, zipfCache.get(field), path);
        (fks[i] as Record<string, unknown>)[field] = parents[idx] as Key;
      }
    }

    // Composite uniqueness: re-draw colliding rows deterministically.
    if (usedTuples !== undefined && def.uniqueTogether !== undefined) {
      const fields = def.uniqueTogether;
      const sizes = fields.map((f) => parentOf((def.refs as Record<string, RefSpec>)[f] as RefSpec).keys.length);
      const capacity = sizes.reduce((a, b) => a * b, 1);
      if (count > capacity) {
        throw new RelationshipError(
          `${table}: uniqueTogether (${fields.join(", ")}) allows at most ${capacity} distinct combinations but ${count} rows were requested`,
          {
            path: table,
            constraint: "uniqueTogether",
            seed: env.seed,
            hint: "Lower the row count or increase the parent table sizes.",
          },
        );
      }
      for (let i = 0; i < count; i++) {
        const row = fks[i] as Record<string, unknown>;
        let tuple = JSON.stringify(fields.map((f) => row[f]));
        for (let attempt = 0; usedTuples.has(tuple); attempt++) {
          if (attempt >= 200) {
            throw new RelationshipError(`${table}: could not find a distinct (${fields.join(", ")}) combination for row ${i}`, {
              path: table,
              constraint: "uniqueTogether",
              seed: env.seed,
              hint: "The requested row count is close to the number of possible combinations; reduce it.",
            });
          }
          for (const f of fields) {
            const ref = (def.refs as Record<string, RefSpec>)[f] as RefSpec;
            const parents = parentOf(ref).keys;
            const r = dsRng.fork(table).fork(`retry:${f}`).fork(i).fork(attempt);
            row[f] = parents[r.int(0, parents.length - 1)] as Key;
          }
          tuple = JSON.stringify(fields.map((f) => row[f]));
        }
        usedTuples.add(tuple);
      }
    }

    const rows: Record<string, unknown>[] = [];
    for (let i = 0; i < count; i++) {
      rows.push(buildRecord(def.factory, i, env, {}, def.traits ?? [], fks[i] as Record<string, unknown>, table));
    }
    data.set(table, rows);
  }

  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of Object.keys(spec)) out[table] = data.get(table) as Record<string, unknown>[];
  return out;
}
