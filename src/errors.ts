/** A single constraint violation. Never contains the offending value. */
export interface Issue {
  /** Property path such as `address.zip` or `items[2].id`. Empty string is the root. */
  readonly path: string;
  /** Short constraint identifier such as `minLength`, `enum`, `required`. */
  readonly constraint: string;
  readonly message: string;
}

export type ErrorCode = "CONFIG" | "SCHEMA_UNSUPPORTED" | "SCHEMA_INVALID" | "GENERATION" | "OVERRIDE" | "RELATIONSHIP" | "CYCLE" | "LIMIT";

export interface ErrorDetails {
  readonly seed?: string | number;
  readonly path?: string;
  readonly constraint?: string;
  readonly hint?: string;
  readonly issues?: readonly Issue[];
  readonly cause?: unknown;
}

function describe(message: string, d: ErrorDetails): string {
  const parts: string[] = [];
  if (d.path !== undefined && d.path !== "") parts.push(`path: ${d.path}`);
  if (d.constraint !== undefined) parts.push(`constraint: ${d.constraint}`);
  if (d.seed !== undefined) parts.push(`seed: ${JSON.stringify(d.seed)}`);
  let out = parts.length > 0 ? `${message} (${parts.join(", ")})` : message;
  if (d.hint !== undefined) out += `\nHint: ${d.hint}`;
  return out;
}

/** Base class of every error thrown by Seedset. */
export class SeedsetError extends Error {
  readonly code: ErrorCode;
  readonly seed: string | number | undefined;
  readonly path: string | undefined;
  readonly constraint: string | undefined;
  readonly hint: string | undefined;
  readonly issues: readonly Issue[];

  constructor(code: ErrorCode, message: string, details: ErrorDetails = {}) {
    super(describe(message, details), details.cause === undefined ? undefined : { cause: details.cause });
    this.name = new.target.name;
    this.code = code;
    this.seed = details.seed;
    this.path = details.path;
    this.constraint = details.constraint;
    this.hint = details.hint;
    this.issues = details.issues ?? [];
  }

  /** Safe to log: contains no generated values. */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      seed: this.seed,
      path: this.path,
      constraint: this.constraint,
      hint: this.hint,
      issues: this.issues,
    };
  }
}

/** Invalid options passed to the public API (bad count, bad range, ...). */
export class ConfigError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("CONFIG", message, details);
  }
}

/** The schema uses a feature Seedset deliberately does not support. */
export class UnsupportedSchemaError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("SCHEMA_UNSUPPORTED", message, details);
  }
}

/** The schema is self-contradictory (e.g. min > max). */
export class SchemaError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("SCHEMA_INVALID", message, details);
  }
}

/** A factory or schema could not produce a valid value. */
export class GenerationError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("GENERATION", message, details);
  }
}

/** A caller-provided override is unknown or violates the field's schema. */
export class OverrideError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("OVERRIDE", message, details);
  }
}

/** Impossible relational constraint (e.g. one-to-one with more children than parents). */
export class RelationshipError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("RELATIONSHIP", message, details);
  }
}

/** Tables depend on each other in a cycle. */
export class CyclicDependencyError extends SeedsetError {
  readonly cycle: readonly string[];
  constructor(cycle: readonly string[], details: ErrorDetails = {}) {
    super("CYCLE", `Cyclic dependency between tables: ${cycle.join(" -> ")}`, {
      hint: "Break the cycle by making one side not reference the other, or model it with a join table.",
      ...details,
    });
    this.cycle = cycle;
  }
}

/** A configured safety limit was exceeded. */
export class LimitError extends SeedsetError {
  constructor(message: string, details: ErrorDetails = {}) {
    super("LIMIT", message, details);
  }
}

export function joinPath(base: string, key: string): string {
  return base === "" ? key : `${base}.${key}`;
}

export function indexPath(base: string, index: number): string {
  return `${base}[${index}]`;
}
