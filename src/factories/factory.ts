import { ConfigError, GenerationError, OverrideError, TestSeedError } from "../errors.js";
import type { Issue } from "../errors.js";
import { Gen } from "../generators/gen.js";
import type { Rng } from "../random/rng.js";
import { Schema } from "../schema/builder.js";
import { generateValue } from "../schema/generate.js";
import type { GenEnv } from "../schema/generate.js";
import { isStandardSchema, runStandardValidator } from "../schema/standard.js";
import type { StandardSchemaV1 } from "../schema/standard.js";
import { validateNode } from "../schema/validate.js";

/** Per-record information passed to field functions. */
export interface FieldContext {
  /** Zero-based position of the record within its factory (or table). */
  readonly index: number;
  /** `index + 1`. Use for guaranteed-unique ids. */
  readonly sequence: number;
  /** Name of the field being generated. */
  readonly field: string;
  readonly seed: string | number;
}

export type FieldFn<T> = (g: Gen, ctx: FieldContext) => T;
/** A field is a function of `(g, ctx)`, a schema, or a constant. */
export type FieldSpec<T> = FieldFn<T> | Schema<T> | T;
/**
 * Any non-`unknown` value. Using this union (instead of `unknown`) is what lets TypeScript
 * contextually type the `(g, ctx)` parameters of field functions.
 */
export type ConstantValue = string | number | boolean | bigint | symbol | null | undefined | object;
export type FieldInput = FieldFn<unknown> | Schema<unknown> | ConstantValue;
export type FieldMap = Record<string, FieldInput>;

export type FieldOut<S> = S extends Schema<infer U> ? U : S extends (g: Gen, ctx: FieldContext) => infer R ? R : S;
/** The object type a factory produces. */
export type Built<F> = { [K in keyof F]: FieldOut<F[K]> };
export type TraitSpec<F> = { [K in keyof F]?: FieldSpec<FieldOut<F[K]>> };

export interface FactoryOptions<F extends FieldMap, TR extends Record<string, TraitSpec<F>>> {
  /**
   * Stable name. It labels the random stream, so give distinct names to factories used in the
   * same seed if their data should be independent. Default `"factory"`.
   */
  readonly name?: string;
  /** Named variations; each overrides a subset of fields. Later traits win. */
  readonly traits?: TR;
  /** Any synchronous Standard Schema validator (Zod, Valibot, ArkType...) applied to every record. */
  readonly validator?: StandardSchemaV1;
  /** Attempts per record when `validator` rejects (each retry uses a new deterministic stream). Default 10. */
  readonly maxAttempts?: number;
}

export class Factory<F extends FieldMap, TN extends string = never> {
  declare readonly _traitNames: TN;
  readonly name: string;
  readonly fields: F;
  readonly traits: Readonly<Record<string, TraitSpec<F>>>;
  readonly validator: StandardSchemaV1 | undefined;
  readonly maxAttempts: number;

  constructor(
    fields: F,
    traits: Readonly<Record<string, TraitSpec<F>>>,
    name: string,
    validator: StandardSchemaV1 | undefined,
    maxAttempts: number,
  ) {
    this.fields = fields;
    this.traits = traits;
    this.name = name;
    this.validator = validator;
    this.maxAttempts = maxAttempts;
  }
}

export type AnyFactory = Factory<FieldMap, string>;

export function defineFactory<F extends FieldMap, const TR extends Record<string, TraitSpec<F>> = Record<never, never>>(
  fields: F,
  options: FactoryOptions<F, TR> = {},
): Factory<F, keyof TR & string> {
  const name = options.name ?? "factory";
  if (name === "") throw new ConfigError("Factory name must not be empty");
  const maxAttempts = options.maxAttempts ?? 10;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new ConfigError(`maxAttempts must be an integer >= 1 (got ${maxAttempts})`);
  if (options.validator !== undefined && !isStandardSchema(options.validator)) {
    throw new ConfigError("`validator` must implement the Standard Schema interface (e.g. a Zod 3.24+/4, Valibot or ArkType schema)");
  }
  const traits: Readonly<Record<string, TraitSpec<F>>> = options.traits ?? {};
  for (const [traitName, spec] of Object.entries(traits)) {
    for (const key of Object.keys(spec)) {
      if (!Object.hasOwn(fields, key)) {
        throw new ConfigError(`Trait "${traitName}" sets unknown field "${key}"`, {
          path: key,
          hint: `Known fields: ${Object.keys(fields).join(", ")}`,
        });
      }
    }
  }
  return new Factory<F, keyof TR & string>(fields, traits, name, options.validator, maxAttempts);
}

export interface BuildEnv extends GenEnv {
  readonly root: Rng;
}

function resolveSpecs(factory: AnyFactory, traitNames: readonly string[]): Map<string, unknown> {
  const specs = new Map<string, unknown>(Object.entries(factory.fields));
  for (const traitName of traitNames) {
    const trait = factory.traits[traitName];
    if (trait === undefined) {
      throw new OverrideError(`Unknown trait "${traitName}" on factory "${factory.name}"`, {
        constraint: "trait",
        hint: `Available traits: ${Object.keys(factory.traits).join(", ") || "(none)"}`,
      });
    }
    for (const [key, spec] of Object.entries(trait)) specs.set(key, spec);
  }
  return specs;
}

function checkOverrides(
  factory: AnyFactory,
  specs: ReadonlyMap<string, unknown>,
  overrides: Readonly<Record<string, unknown>>,
  env: BuildEnv,
): void {
  for (const key of Object.keys(overrides)) {
    if (!specs.has(key)) {
      throw new OverrideError(`Unknown override "${key}" for factory "${factory.name}"`, {
        path: key,
        constraint: "unknown-field",
        seed: env.seed,
        hint: `Known fields: ${[...specs.keys()].join(", ")}`,
      });
    }
    const spec = specs.get(key);
    if (spec instanceof Schema) {
      const issues = validateNode(spec.node, overrides[key], key);
      if (issues.length > 0) {
        const first = issues[0] as Issue;
        throw new OverrideError(`Override for "${key}" violates the field's schema: ${first.message}`, {
          path: first.path,
          constraint: first.constraint,
          seed: env.seed,
          issues,
          hint: "Pass a value that satisfies the schema, or use a trait/new factory for intentionally invalid data.",
        });
      }
    }
  }
}

function evalField(key: string, spec: unknown, rng: Rng, index: number, env: BuildEnv): unknown {
  if (spec instanceof Schema) return generateValue(spec.node, rng, env, key);
  if (typeof spec !== "function") return spec;
  try {
    return (spec as FieldFn<unknown>)(new Gen(rng), { index, sequence: index + 1, field: key, seed: env.seed });
  } catch (error) {
    if (error instanceof TestSeedError) {
      throw new GenerationError(`Field "${key}" failed: ${error.message}`, {
        path: key,
        constraint: error.constraint,
        seed: env.seed,
        cause: error,
        issues: error.issues,
      });
    }
    const name = error instanceof Error ? error.name : typeof error;
    throw new GenerationError(`Field function for "${key}" threw ${name}`, {
      path: key,
      seed: env.seed,
      cause: error,
      hint: "See `error.cause` for the original error.",
    });
  }
}

/**
 * Build record `index` of `factory`. Pure function of (seed, label, index, specs, overrides): the same
 * inputs always return an equal record, and the record does not depend on any other record.
 *
 * @param forced values injected by the dataset layer (foreign keys); not validated against field schemas.
 */
export function buildRecord(
  factory: AnyFactory,
  index: number,
  env: BuildEnv,
  overrides: Readonly<Record<string, unknown>> = {},
  traitNames: readonly string[] = [],
  forced: Readonly<Record<string, unknown>> = {},
  label: string = factory.name,
): Record<string, unknown> {
  const specs = resolveSpecs(factory, traitNames);
  checkOverrides(factory, specs, overrides, env);
  const recordRng = env.root.fork(label).fork(index);
  const attempts = factory.validator === undefined ? 1 : factory.maxAttempts;
  let lastIssues: readonly Issue[] = [];

  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = attempt === 0 ? recordRng : recordRng.fork(`retry:${attempt}`);
    const record: Record<string, unknown> = {};
    for (const [key, spec] of specs) {
      if (Object.hasOwn(forced, key)) record[key] = forced[key];
      else if (Object.hasOwn(overrides, key)) record[key] = overrides[key];
      else record[key] = evalField(key, spec, rng.fork(key), index, env);
    }
    for (const key of Object.keys(forced)) if (!(key in record)) record[key] = forced[key];
    if (factory.validator === undefined) return record;
    lastIssues = runStandardValidator(factory.validator, record);
    if (lastIssues.length === 0) return record;
    if (Object.keys(overrides).length > 0 && attempt === 0 && attempts > 1) {
      // Retrying cannot change caller-supplied overrides; fail fast with the cause.
      const overridden = lastIssues.filter((i) => Object.hasOwn(overrides, i.path.split(/[.[]/)[0] ?? ""));
      if (overridden.length === lastIssues.length) {
        throw new OverrideError(`Overrides make the record fail the factory validator: ${overridden[0]?.message ?? ""}`, {
          path: overridden[0]?.path,
          constraint: overridden[0]?.constraint,
          seed: env.seed,
          issues: overridden,
        });
      }
    }
  }
  const first = lastIssues[0] as Issue;
  throw new GenerationError(
    `Factory "${factory.name}" could not produce a record accepted by its validator after ${attempts} attempts: ${first.message}`,
    {
      path: first.path,
      constraint: first.constraint,
      seed: env.seed,
      issues: lastIssues,
      hint: "Loosen the field generators or add a schema/constraint to the offending field so generated values satisfy the validator.",
    },
  );
}
