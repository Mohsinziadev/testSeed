import { ConfigError } from "../errors.js";
import type { Issue } from "../errors.js";

/**
 * Minimal structural type of the Standard Schema interface (https://standardschema.dev),
 * implemented by Zod, Valibot, ArkType and others. Declared locally so TestSeed has no dependency on it.
 */
export interface StandardSchemaV1 {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (value: unknown) => StandardResult | Promise<StandardResult>;
  };
}
export type StandardResult = { readonly value: unknown; readonly issues?: undefined } | { readonly issues: readonly StandardIssue[] };
export interface StandardIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined;
}

export function isStandardSchema(value: unknown): value is StandardSchemaV1 {
  if (typeof value !== "object" && typeof value !== "function") return false;
  if (value === null) return false;
  const std = (value as { "~standard"?: unknown })["~standard"];
  return typeof std === "object" && std !== null && typeof (std as { validate?: unknown }).validate === "function";
}

function formatPath(path: StandardIssue["path"]): string {
  if (path === undefined) return "";
  let out = "";
  for (const segment of path) {
    const key = typeof segment === "object" ? segment.key : segment;
    out += typeof key === "number" ? `[${key}]` : out === "" ? String(key) : `.${String(key)}`;
  }
  return out;
}

/** Validate synchronously with any Standard Schema validator. Async validators are rejected. */
export function runStandardValidator(validator: StandardSchemaV1, value: unknown): Issue[] {
  const result = validator["~standard"].validate(value);
  if (result instanceof Promise) {
    result.catch(() => undefined);
    throw new ConfigError("Async validators are not supported: TestSeed generation is synchronous.", {
      hint: "Use a synchronous schema, or validate the generated data yourself after generation.",
    });
  }
  if (result.issues === undefined) return [];
  return result.issues.map((i) => ({
    path: formatPath(i.path),
    constraint: `validator:${validator["~standard"].vendor}`,
    message: i.message,
  }));
}
