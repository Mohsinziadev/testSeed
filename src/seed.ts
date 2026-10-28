import { generateDataset } from "./datasets/dataset.js";
import type { DatasetResult, DatasetSpec } from "./datasets/dataset.js";
import { generateEdgeCases } from "./edge-cases/edge-cases.js";
import type { EdgeCase, EdgeCaseOptions } from "./edge-cases/edge-cases.js";
import { ConfigError, SeedsetError } from "./errors.js";
import type { Issue } from "./errors.js";
import { buildRecord, defineFactory, Factory } from "./factories/factory.js";
import type { AnyFactory, BuildEnv, Built, FactoryOptions, FieldMap, TraitSpec } from "./factories/factory.js";
import { Gen } from "./generators/gen.js";
import { Rng } from "./random/rng.js";
import type { Schema } from "./schema/builder.js";
import { generateValue } from "./schema/generate.js";
import { DEFAULT_LIMITS } from "./schema/node.js";
import type { Limits } from "./schema/node.js";
import { batches, batchesAsync, iterate } from "./streaming/stream.js";
import type { AsyncBatchOptions, BatchOptions, StreamOptions } from "./streaming/stream.js";
import { ALGORITHM_VERSION, VERSION } from "./version.js";

export interface SeedOptions {
  /**
   * A finite number or a string. When omitted a random 32-bit seed is chosen and exposed as
   * `seed.seed`, so even an unseeded run can be reproduced from its error message or report.
   */
  readonly seed?: number | string;
  /** Safety limits; unspecified fields keep their defaults. */
  readonly limits?: Partial<Limits>;
}

export interface GenerateOptions<F extends FieldMap, TN extends string> {
  /** Values forced onto every record. Validated against field schemas where the factory has them. */
  readonly overrides?: Partial<Built<F>>;
  readonly traits?: readonly NoInfer<TN>[];
  /** Index of the first record. Default 0. */
  readonly start?: number;
}

export interface ReportFailure {
  readonly index: number;
  readonly code: string;
  readonly message: string;
  readonly path: string | undefined;
  readonly constraint: string | undefined;
  readonly hint: string | undefined;
  readonly issues: readonly Issue[];
}

/** Outcome of `generateWithReport`. Contains no generated values besides `records`. */
export interface GenerationReport<T> {
  readonly ok: boolean;
  readonly seed: number | string;
  readonly algorithmVersion: number;
  readonly packageVersion: string;
  readonly factory: string;
  readonly count: number;
  readonly traits: readonly string[];
  /** Names (never values) of overridden fields. */
  readonly overriddenFields: readonly string[];
  readonly limits: Limits;
  readonly records: T[];
  readonly failures: ReportFailure[];
  /** True when more than 100 failures occurred and the list was cut. */
  readonly failuresTruncated: boolean;
  /** Code snippet that reproduces this run. */
  readonly reproduce: string;
}

export interface ReportOptions<F extends FieldMap, TN extends string> {
  readonly count: number;
  /** Run with this seed instead of the instance's seed (same limits). */
  readonly seed?: number | string;
  readonly traits?: readonly NoInfer<TN>[];
  readonly overrides?: Partial<Built<F>>;
}

const MAX_REPORTED_FAILURES = 100;

function resolveLimits(partial: Partial<Limits> | undefined): Limits {
  const limits: Limits = { ...DEFAULT_LIMITS, ...partial };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1)
      throw new ConfigError(`limits.${name} must be a positive integer (got ${value})`, { constraint: `limits.${name}` });
  }
  return limits;
}

function randomSeed(): number {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new ConfigError("No seed was given and crypto.getRandomValues is unavailable", { hint: "Pass { seed } to createSeed()." });
  }
  const buffer = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buffer);
  return buffer[0] as number;
}

function checkCount(count: number, limits: Limits): void {
  if (!Number.isSafeInteger(count) || count < 0)
    throw new ConfigError(`count must be a non-negative integer (got ${count})`, { constraint: "count" });
  if (count > limits.maxCount) {
    throw new ConfigError(`count ${count} exceeds limits.maxCount (${limits.maxCount})`, {
      constraint: "count",
      hint: "Raise `limits.maxCount` in createSeed(), or use stream()/batches() which do not hold the data in memory.",
    });
  }
}

/** A seeded test-data engine. All state is local to the instance. */
export class Seed {
  /** The seed in use (generated if none was given). Log it to reproduce a run. */
  readonly seed: number | string;
  readonly limits: Limits;
  private readonly root: Rng;
  private readonly adhoc: Gen;
  private readonly counters = new WeakMap<AnyFactory | Schema<unknown>, number>();

  constructor(options: SeedOptions = {}) {
    this.seed = options.seed ?? randomSeed();
    this.root = Rng.fromSeed(this.seed);
    this.limits = resolveLimits(options.limits);
    this.adhoc = new Gen(this.root.fork("adhoc"));
  }

  private get env(): BuildEnv {
    return { root: this.root, seed: this.seed, limits: this.limits };
  }

  // Ad-hoc generators (a single stream shared by all calls on this instance).
  get number(): Gen["number"] {
    return this.adhoc.number;
  }
  get string(): Gen["string"] {
    return this.adhoc.string;
  }
  get text(): Gen["text"] {
    return this.adhoc.text;
  }
  get date(): Gen["date"] {
    return this.adhoc.date;
  }
  get person(): Gen["person"] {
    return this.adhoc.person;
  }
  get internet(): Gen["internet"] {
    return this.adhoc.internet;
  }
  get location(): Gen["location"] {
    return this.adhoc.location;
  }
  get phone(): Gen["phone"] {
    return this.adhoc.phone;
  }
  get helpers(): Gen["helpers"] {
    return this.adhoc.helpers;
  }
  boolean(probability?: number): boolean {
    return this.adhoc.boolean(probability);
  }
  uuid(): string {
    return this.adhoc.uuid();
  }

  /** Define a reusable factory. See {@link defineFactory}. */
  factory<F extends FieldMap, const TR extends Record<string, TraitSpec<F>> = Record<never, never>>(
    fields: F,
    options: FactoryOptions<F, TR> = {},
  ): Factory<F, keyof TR & string> {
    return defineFactory(fields, options);
  }

  private nextIndex(key: AnyFactory | Schema<unknown>): number {
    const index = this.counters.get(key) ?? 0;
    this.counters.set(key, index + 1);
    return index;
  }

  /**
   * Build the next record. The n-th call for a factory returns the same record as
   * `generate(factory, n + 1)[n]`. Overrides are checked at compile time and, where the field has a schema, at runtime.
   */
  build<F extends FieldMap, TN extends string>(
    factory: Factory<F, TN>,
    overrides: Partial<Built<F>> = {},
    options: { readonly traits?: readonly NoInfer<TN>[] } = {},
  ): Built<F> {
    const index = this.nextIndex(factory);
    return buildRecord(factory, index, this.env, overrides, options.traits ?? []) as Built<F>;
  }

  /** Generate one value from a schema (advances this schema's counter like `build`). */
  sample<T>(schema: Schema<T>): T {
    const index = this.nextIndex(schema);
    return generateValue(schema.node, this.root.fork("schema").fork(index), this.env) as T;
  }

  /**
   * Generate `count` records or schema values in memory. Pure: the same seed gives the same array every time
   * (use `start` to get a different window). Throws if `count` exceeds `limits.maxCount`.
   */
  generate<F extends FieldMap, TN extends string>(factory: Factory<F, TN>, count: number, options?: GenerateOptions<F, TN>): Built<F>[];
  generate<T>(schema: Schema<T>, count: number): T[];
  generate(source: AnyFactory | Schema<unknown>, count: number, options: GenerateOptions<FieldMap, string> = {}): unknown[] {
    checkCount(count, this.limits);
    return Array.from(this.records(source, { count, start: options.start ?? 0 }, options));
  }

  private *records(
    source: AnyFactory | Schema<unknown>,
    range: StreamOptions,
    options: GenerateOptions<FieldMap, string>,
  ): Generator<unknown, void, undefined> {
    const env = this.env;
    if (source instanceof Factory) {
      yield* iterate(range, (i) => buildRecord(source, i, env, options.overrides ?? {}, options.traits ?? []));
    } else {
      const schemaRoot = this.root.fork("schema");
      yield* iterate(range, (i) => generateValue((source as Schema<unknown>).node, schemaRoot.fork(i), env));
    }
  }

  /** Lazily yield records one by one. Memory stays flat; `break` stops generation. Not limited by `maxCount`. */
  stream<F extends FieldMap, TN extends string>(
    factory: Factory<F, TN>,
    options: StreamOptions & Omit<GenerateOptions<F, TN>, "start">,
  ): Generator<Built<F>, void, undefined> {
    const env = this.env;
    return iterate(options, (i) => buildRecord(factory, i, env, options.overrides ?? {}, options.traits ?? []) as Built<F>);
  }

  /** Yield arrays of `batchSize` records (default 1000). Memory is bounded by one batch. */
  batches<F extends FieldMap, TN extends string>(
    factory: Factory<F, TN>,
    options: BatchOptions & Omit<GenerateOptions<F, TN>, "start">,
  ): Generator<Built<F>[], void, undefined> {
    const env = this.env;
    return batches(options, (i) => buildRecord(factory, i, env, options.overrides ?? {}, options.traits ?? []) as Built<F>);
  }

  /** Async batches that yield to the event loop between batches and stop on `signal` abort. */
  batchesAsync<F extends FieldMap, TN extends string>(
    factory: Factory<F, TN>,
    options: AsyncBatchOptions & Omit<GenerateOptions<F, TN>, "start">,
  ): AsyncGenerator<Built<F>[], void, undefined> {
    const env = this.env;
    return batchesAsync(options, (i) => buildRecord(factory, i, env, options.overrides ?? {}, options.traits ?? []) as Built<F>);
  }

  /**
   * Generate related tables in memory. Pure function of (seed, spec). See {@link DatasetSpec}.
   * The result type adds each declared reference as `string | number` (`| null` if nullable, array if `many`).
   */
  dataset<const D extends DatasetSpec>(spec: D): DatasetResult<D> {
    // The engine returns untyped rows; DatasetResult<D> is derived from the same spec, so this is the one place the two meet.
    return generateDataset(spec, this.env) as unknown as DatasetResult<D>;
  }

  /**
   * Boundary, invalid and (optionally) random cases for a schema. Every `valid: true` value is verified
   * against the schema; every `valid: false` value is verified to fail it. Not exhaustive.
   */
  edgeCases<T>(schema: Schema<T>, options?: EdgeCaseOptions): EdgeCase<T>[] {
    // Valid values were validated against `schema` inside generateEdgeCases, which is what makes this narrowing sound.
    return generateEdgeCases(schema.node, this.root, this.env, options) as EdgeCase<T>[];
  }

  /**
   * Generate `count` records, collecting failures instead of throwing, with everything needed to reproduce the run.
   * Errors that are not Seedset errors (bugs) are rethrown.
   */
  generateWithReport<F extends FieldMap, TN extends string>(
    factory: Factory<F, TN>,
    options: ReportOptions<F, TN>,
  ): GenerationReport<Built<F>> {
    const run = options.seed === undefined ? this : new Seed({ seed: options.seed, limits: this.limits });
    checkCount(options.count, run.limits);
    const traits = options.traits ?? [];
    const overrides = options.overrides ?? {};
    const env = run.env;
    const records: Built<F>[] = [];
    const failures: ReportFailure[] = [];
    let truncated = false;
    for (let i = 0; i < options.count; i++) {
      try {
        records.push(buildRecord(factory, i, env, overrides, traits) as Built<F>);
      } catch (error) {
        if (!(error instanceof SeedsetError)) throw error;
        if (failures.length >= MAX_REPORTED_FAILURES) {
          truncated = true;
          break;
        }
        failures.push({
          index: i,
          code: error.code,
          message: error.message,
          path: error.path,
          constraint: error.constraint,
          hint: error.hint,
          issues: error.issues,
        });
      }
    }
    const seedLiteral = JSON.stringify(run.seed);
    const traitPart = traits.length > 0 ? `, { traits: ${JSON.stringify(traits)} }` : "";
    return {
      ok: failures.length === 0,
      seed: run.seed,
      algorithmVersion: ALGORITHM_VERSION,
      packageVersion: VERSION,
      factory: factory.name,
      count: options.count,
      traits,
      overriddenFields: Object.keys(overrides),
      limits: run.limits,
      records,
      failures,
      failuresTruncated: truncated,
      reproduce: `createSeed({ seed: ${seedLiteral} }).generate(<factory "${factory.name}">, ${options.count}${traitPart}) // seedset@${VERSION}, algorithm v${ALGORITHM_VERSION}`,
    };
  }
}

/** Create an isolated, seeded engine. Instances never share state or touch `Math.random`. */
export function createSeed(options: SeedOptions = {}): Seed {
  return new Seed(options);
}
