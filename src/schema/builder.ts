import { SchemaError } from "../errors.js";
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from "../generators/gen.js";
import type { LiteralValue, Node, Prop, StringFormat } from "./node.js";

/** A schema that describes values of type `T`, usable for generation, validation and edge cases. */
export class Schema<T> {
  /** Phantom field: carries `T` for inference. Never present at runtime. */
  declare readonly _type: T;
  readonly node: Node;

  constructor(node: Node) {
    this.node = node;
  }

  /** Also allow `null`. */
  nullable(): Schema<T | null> {
    return new Schema({ kind: "nullable", inner: this.node });
  }

  /** Mark an object property as optional (only meaningful inside `t.object`). */
  optional(): OptionalSchema<T> {
    return new OptionalSchema(this);
  }
}

/** A schema marked optional. Only `t.object` accepts it. */
export class OptionalSchema<T> {
  declare readonly _type: T;
  declare readonly _optional: true;
  readonly inner: Schema<T>;

  constructor(inner: Schema<T>) {
    this.inner = inner;
  }
}

export type Infer<S> = S extends Schema<infer U> ? U : never;

export type Shape = Record<string, Schema<unknown> | OptionalSchema<unknown>>;
type Simplify<T> = { [K in keyof T]: T[K] } & {};
type RequiredKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? never : K;
}[keyof S];
type OptionalKeys<S extends Shape> = {
  [K in keyof S]: S[K] extends OptionalSchema<unknown> ? K : never;
}[keyof S];

export type InferShape<S extends Shape> = Simplify<
  { [K in RequiredKeys<S>]: S[K] extends Schema<infer U> ? U : never } & {
    [K in OptionalKeys<S>]?: S[K] extends OptionalSchema<infer U> ? U : never;
  }
>;

export interface StringOptions {
  /** Minimum length in Unicode code points. Default 0. */
  readonly minLength?: number;
  readonly maxLength?: number;
  /** `email` and `url` use reserved example domains; `uuid` is v4-shaped. */
  readonly format?: StringFormat;
}
export interface NumberOptions {
  readonly min?: number;
  readonly max?: number;
}
export interface DateOptions {
  /** Inclusive lower bound. Default 2000-01-01T00:00:00Z. */
  readonly min?: Date | string | number;
  /** Inclusive upper bound. Default 2030-01-01T00:00:00Z. */
  readonly max?: Date | string | number;
}
export interface ArrayOptions {
  readonly min?: number;
  readonly max?: number;
  /** Require structurally distinct elements. */
  readonly unique?: boolean;
}
export interface ObjectOptions {
  /** Reject keys that are not declared. Default false. */
  readonly strict?: boolean;
}

function nonNegInt(name: string, value: number | undefined, fallback: number): number {
  const v = value ?? fallback;
  if (!Number.isSafeInteger(v) || v < 0) throw new SchemaError(`${name} must be a non-negative safe integer (got ${v})`);
  return v;
}

function dateMs(name: string, value: Date | string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new SchemaError(`${name} is not a valid date`);
  return ms;
}

const MIN_ISO = new Date("0000-01-01T00:00:00.000Z").getTime();
const MAX_ISO = new Date("9999-12-31T23:59:59.999Z").getTime();

function numberNode(integer: boolean, options: NumberOptions): Schema<number> {
  const { min, max } = options;
  for (const [name, v] of [
    ["min", min],
    ["max", max],
  ] as const) {
    if (v !== undefined && !Number.isFinite(v)) throw new SchemaError(`${name} must be a finite number`);
  }
  if (min !== undefined && max !== undefined && min > max) {
    throw new SchemaError(`min (${min}) must not exceed max (${max})`, { constraint: "min/max" });
  }
  if (integer) {
    const lo = min === undefined ? undefined : Math.ceil(min);
    const hi = max === undefined ? undefined : Math.floor(max);
    if (lo !== undefined && hi !== undefined && lo > hi) {
      throw new SchemaError(`no integer exists between min (${min}) and max (${max})`, { constraint: "min/max" });
    }
  }
  return new Schema({ kind: "number", integer, min, max });
}

/** Schema builders. */
export const t = {
  string(options: StringOptions = {}): Schema<string> {
    const minLength = nonNegInt("minLength", options.minLength, 0);
    const maxLength = options.maxLength === undefined ? undefined : nonNegInt("maxLength", options.maxLength, 0);
    if (maxLength !== undefined && minLength > maxLength) {
      throw new SchemaError(`minLength (${minLength}) must not exceed maxLength (${maxLength})`, { constraint: "minLength/maxLength" });
    }
    return new Schema({ kind: "string", minLength, maxLength, format: options.format });
  },
  number(options: NumberOptions = {}): Schema<number> {
    return numberNode(false, options);
  },
  int(options: NumberOptions = {}): Schema<number> {
    return numberNode(true, options);
  },
  boolean(): Schema<boolean> {
    return new Schema({ kind: "boolean" });
  },
  null(): Schema<null> {
    return new Schema({ kind: "null" });
  },
  literal<const V extends LiteralValue>(value: V): Schema<V> {
    return new Schema({ kind: "literal", value });
  },
  enum<const V extends string | number>(values: readonly [V, ...V[]]): Schema<V> {
    if (values.length === 0) throw new SchemaError("enum needs at least one value");
    if (new Set(values).size !== values.length) throw new SchemaError("enum values must be distinct");
    return new Schema({ kind: "enum", values });
  },
  /** A `Date` instance. */
  date(options: DateOptions = {}): Schema<Date> {
    const min = dateMs("min", options.min, DEFAULT_DATE_FROM);
    const max = dateMs("max", options.max, DEFAULT_DATE_TO);
    if (min > max) throw new SchemaError("date min must not be after max", { constraint: "min/max" });
    return new Schema({ kind: "date", min, max, iso: false });
  },
  /** An ISO-8601 UTC string such as `2024-02-29T12:00:00.000Z` (years 0000-9999). */
  dateString(options: DateOptions = {}): Schema<string> {
    const min = dateMs("min", options.min, DEFAULT_DATE_FROM);
    const max = dateMs("max", options.max, DEFAULT_DATE_TO);
    if (min > max) throw new SchemaError("date min must not be after max", { constraint: "min/max" });
    if (min < MIN_ISO || max > MAX_ISO) throw new SchemaError("dateString supports years 0000-9999 only");
    return new Schema({ kind: "date", min, max, iso: true });
  },
  array<T>(item: Schema<T>, options: ArrayOptions = {}): Schema<T[]> {
    const minItems = nonNegInt("min", options.min, 0);
    const maxItems = options.max === undefined ? undefined : nonNegInt("max", options.max, 0);
    if (maxItems !== undefined && minItems > maxItems) {
      throw new SchemaError(`array min (${minItems}) must not exceed max (${maxItems})`, { constraint: "min/max" });
    }
    return new Schema({ kind: "array", item: item.node, minItems, maxItems, unique: options.unique ?? false });
  },
  object<const S extends Shape>(shape: S, options: ObjectOptions = {}): Schema<InferShape<S>> {
    const props: Prop[] = Object.keys(shape).map((key) => {
      const entry = shape[key];
      if (entry instanceof OptionalSchema) return { key, node: entry.inner.node, optional: true };
      if (entry instanceof Schema) return { key, node: entry.node, optional: false };
      throw new SchemaError(`Property "${key}" is not a TestSeed schema`, { path: key });
    });
    return new Schema({ kind: "object", props, strict: options.strict ?? false });
  },
  union<const O extends readonly [Schema<unknown>, ...Schema<unknown>[]]>(options: O): Schema<Infer<O[number]>> {
    if (options.length === 0) throw new SchemaError("union needs at least one option");
    return new Schema({ kind: "union", options: options.map((o) => o.node) });
  },
};
