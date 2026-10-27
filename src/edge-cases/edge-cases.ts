import { ConfigError, GenerationError, indexPath, joinPath } from "../errors.js";
import type { Rng } from "../random/rng.js";
import type { GenEnv } from "../schema/generate.js";
import { generateValue } from "../schema/generate.js";
import type { ArrayNode, Node, ObjectNode } from "../schema/node.js";
import { canonicalKey, nextDown, nextUp } from "../schema/util.js";
import { validateNode } from "../schema/validate.js";

interface EdgeCaseBase {
  /** Human-readable description, e.g. `string at maxLength`. */
  readonly label: string;
  /** Property path the case targets (empty string: the root value). */
  readonly path: string;
  /** Constraint exercised, e.g. `maxLength`, `required`, `min`. */
  readonly constraint: string;
}
/** A value that satisfies the schema and sits on or near a constraint boundary (or is random). */
export interface ValidEdgeCase<T> extends EdgeCaseBase {
  readonly valid: true;
  readonly category: "boundary" | "random";
  readonly value: T;
}
/** A value verified NOT to satisfy the schema. */
export interface InvalidEdgeCase extends EdgeCaseBase {
  readonly valid: false;
  readonly category: "invalid";
  readonly value: unknown;
}
export type EdgeCase<T> = ValidEdgeCase<T> | InvalidEdgeCase;

export interface EdgeCaseOptions {
  /** Which deterministic cases to return. Default both. */
  readonly include?: readonly ("valid" | "invalid")[];
  /** Extra randomized valid values appended after the boundary cases. Default 0. */
  readonly random?: number;
  /** Cap on boundary + invalid cases (in generation order). Default 1000. */
  readonly limit?: number;
}

interface Candidate {
  readonly value: unknown;
  readonly label: string;
  readonly constraint: string;
  readonly path: string;
  /** What the producer of this candidate intends; mismatches are dropped, never relabelled. */
  readonly expectValid: boolean;
}

const LONG_STRING = 1000;
const UNICODE_CYCLE = ["😀", "é", "日", "ñ", "ß"] as const;
const MAX_ENUM_CASES = 20;

function cand(value: unknown, label: string, constraint: string, path: string, expectValid: boolean): Candidate {
  return { value, label, constraint, path, expectValid };
}

function repeatCp(unit: readonly string[], count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += unit[i % unit.length] as string;
  return out;
}

function wrongType(node: Node, path: string): Candidate[] {
  const make = (value: unknown): Candidate[] => [cand(value, "wrong type", "type", path, false)];
  switch (node.kind) {
    case "string":
      return make(123);
    case "number":
      return make("123");
    case "boolean":
      return make("true");
    case "null":
      return make(0);
    case "literal":
    case "enum":
      return make({});
    case "date":
      return make(node.iso ? 20240101 : "2024-01-01");
    case "array":
      return make({});
    case "object":
      return make([]);
    case "nullable":
      return wrongType(node.inner, path);
    case "union":
      return make({});
  }
}

function collect(node: Node, rng: Rng, env: GenEnv, path: string): Candidate[] {
  const out: Candidate[] = [];
  const { limits } = env;
  switch (node.kind) {
    case "string": {
      if (node.format !== undefined) {
        out.push(cand(`not-a-${node.format}`, `string that is not a ${node.format}`, "format", path, false));
        break;
      }
      const { minLength: lo, maxLength: hi } = node;
      if (lo === 0) out.push(cand("", "empty string", "minLength", path, true));
      if (lo > 0 && lo <= limits.maxStringLength) out.push(cand(repeatCp(["a"], lo), "string at minLength", "minLength", path, true));
      if (hi !== undefined && hi <= limits.maxStringLength)
        out.push(cand(repeatCp(["a"], hi), "string at maxLength", "maxLength", path, true));
      const uni = Math.max(lo, 1);
      if ((hi === undefined || uni <= hi) && uni <= limits.maxStringLength) {
        out.push(cand(repeatCp(UNICODE_CYCLE, uni), "unicode string (astral, accented, CJK)", "unicode", path, true));
        out.push(cand(repeatCp([" "], uni), "whitespace-only string", "whitespace", path, true));
      }
      if (hi === undefined && lo <= Math.min(LONG_STRING, limits.maxStringLength)) {
        out.push(
          cand(
            repeatCp(["a"], Math.min(LONG_STRING, limits.maxStringLength)),
            `very long string (${Math.min(LONG_STRING, limits.maxStringLength)} chars)`,
            "long",
            path,
            true,
          ),
        );
      }
      if (lo > 0 && lo - 1 <= limits.maxStringLength)
        out.push(cand(repeatCp(["a"], lo - 1), "string one below minLength", "minLength", path, false));
      if (hi !== undefined && hi + 1 <= limits.maxStringLength)
        out.push(cand(repeatCp(["a"], hi + 1), "string one above maxLength", "maxLength", path, false));
      break;
    }
    case "number": {
      const { min, max, integer } = node;
      const lo = min === undefined ? undefined : integer ? Math.ceil(min) : min;
      const hi = max === undefined ? undefined : integer ? Math.floor(max) : max;
      if (lo !== undefined) {
        out.push(cand(lo, "number at minimum", "min", path, true));
        out.push(cand(integer ? lo + 1 : nextUp(lo), "number just above minimum", "min", path, true));
      }
      if (hi !== undefined) {
        out.push(cand(hi, "number at maximum", "max", path, true));
        out.push(cand(integer ? hi - 1 : nextDown(hi), "number just below maximum", "max", path, true));
      }
      out.push(cand(0, "zero", "zero", path, true));
      out.push(cand(-0, "negative zero", "zero", path, true));
      if (integer) {
        if (lo === undefined) out.push(cand(Number.MIN_SAFE_INTEGER, "smallest safe integer", "min", path, true));
        if (hi === undefined) out.push(cand(Number.MAX_SAFE_INTEGER, "largest safe integer", "max", path, true));
      } else {
        if (lo === undefined) out.push(cand(-Number.MAX_VALUE, "most negative finite number", "min", path, true));
        if (hi === undefined) out.push(cand(Number.MAX_VALUE, "largest finite number", "max", path, true));
        out.push(cand(Number.MIN_VALUE, "smallest positive number", "precision", path, true));
      }
      if (lo !== undefined) out.push(cand(integer ? lo - 1 : nextDown(lo), "number just below minimum", "min", path, false));
      if (hi !== undefined) out.push(cand(integer ? hi + 1 : nextUp(hi), "number just above maximum", "max", path, false));
      out.push(cand(Number.NaN, "NaN", "finite", path, false));
      out.push(cand(Number.POSITIVE_INFINITY, "Infinity", "finite", path, false));
      if (integer) out.push(cand(1.5, "non-integer", "integer", path, false));
      break;
    }
    case "boolean":
      out.push(cand(true, "true", "boolean", path, true), cand(false, "false", "boolean", path, true));
      break;
    case "null":
      out.push(cand(null, "null", "null", path, true));
      break;
    case "literal":
      out.push(cand(node.value, "the literal value", "literal", path, true));
      out.push(cand(typeof node.value === "string" ? `${node.value}-other` : "other", "a different value", "literal", path, false));
      break;
    case "enum": {
      for (const v of node.values.slice(0, MAX_ENUM_CASES)) out.push(cand(v, `enum member ${JSON.stringify(v)}`, "enum", path, true));
      out.push(cand("__not_a_member__", "value outside the enum", "enum", path, false));
      break;
    }
    case "date": {
      const wrap = (ms: number): unknown => (node.iso ? new Date(ms).toISOString() : new Date(ms));
      const inRange = (ms: number): boolean => ms >= node.min && ms <= node.max;
      out.push(cand(wrap(node.min), "date at minimum", "min", path, true), cand(wrap(node.max), "date at maximum", "max", path, true));
      if (node.min + 1 <= node.max) out.push(cand(wrap(node.min + 1), "date 1ms after minimum", "min", path, true));
      if (node.max - 1 >= node.min) out.push(cand(wrap(node.max - 1), "date 1ms before maximum", "max", path, true));
      for (const [ms, label] of [
        [0, "Unix epoch"],
        [Date.UTC(2024, 1, 29), "leap day 2024-02-29"],
        [Date.UTC(2038, 0, 19, 3, 14, 7), "32-bit time_t rollover"],
      ] as const) {
        if (inRange(ms)) out.push(cand(wrap(ms), label, "date-boundary", path, true));
      }
      const iso = (ms: number): boolean =>
        !node.iso || (ms >= new Date("0000-01-01T00:00:00.000Z").getTime() && ms <= new Date("9999-12-31T23:59:59.999Z").getTime());
      if (iso(node.min - 1)) out.push(cand(wrap(node.min - 1), "date 1ms before minimum", "min", path, false));
      if (iso(node.max + 1)) out.push(cand(wrap(node.max + 1), "date 1ms after maximum", "max", path, false));
      if (node.iso) {
        out.push(cand("2024-13-45T00:00:00.000Z", "impossible month/day", "format", path, false));
        out.push(cand("2023-02-29T00:00:00.000Z", "Feb 29 in a non-leap year", "format", path, false));
        out.push(cand("not-a-date", "unparseable date string", "format", path, false));
      } else {
        out.push(cand(new Date(Number.NaN), "Invalid Date", "type", path, false));
      }
      break;
    }
    case "nullable":
      out.push(cand(null, "null", "nullable", path, true), ...collect(node.inner, rng, env, path));
      return out;
    case "union":
      node.options.forEach((option, i) => out.push(...collect(option, rng.fork(i), env, path)));
      break;
    case "array":
      out.push(...collectArray(node, rng, env, path));
      break;
    case "object":
      out.push(...collectObject(node, rng, env, path));
      break;
  }
  out.push(...wrongType(node, path));
  return out;
}

function fixedLengthArray(node: ArrayNode, length: number, rng: Rng, env: GenEnv, path: string): unknown[] {
  return generateValue({ ...node, minItems: length, maxItems: length }, rng, env, path) as unknown[];
}

function collectArray(node: ArrayNode, rng: Rng, env: GenEnv, path: string): Candidate[] {
  const out: Candidate[] = [];
  const cap = env.limits.maxArrayLength;
  const at = (n: number, label: string, constraint: string, valid: boolean): void => {
    if (n < 0 || n > cap) return;
    out.push(cand(fixedLengthArray(node, n, rng.fork(`len${n}`), env, path), label, constraint, path, valid));
  };
  if (node.minItems === 0) at(0, "empty array", "minItems", true);
  if (node.minItems > 0) at(node.minItems, "array at minItems", "minItems", true);
  if (node.maxItems !== undefined) at(node.maxItems, "array at maxItems", "maxItems", true);
  if (node.minItems > 0) at(node.minItems - 1, "array one below minItems", "minItems", false);
  if (node.maxItems !== undefined) at(node.maxItems + 1, "array one above maxItems", "maxItems", false);

  const baseLength = Math.max(node.minItems, 1);
  const roomForElement = (node.maxItems === undefined || baseLength <= node.maxItems) && baseLength <= cap;
  if (roomForElement) {
    const base = fixedLengthArray(node, baseLength, rng.fork("base"), env, path);
    if (baseLength >= 2 || node.maxItems === undefined || node.maxItems >= 2) {
      const dupLen = Math.max(baseLength, 2);
      if (dupLen <= cap && (node.maxItems === undefined || dupLen <= node.maxItems)) {
        const dup = fixedLengthArray(node, dupLen, rng.fork("dup"), env, path);
        dup[1] = dup[0];
        out.push(
          cand(
            dup,
            node.unique ? "array with duplicate elements" : "array with duplicate elements (allowed)",
            "unique",
            path,
            !node.unique,
          ),
        );
      }
    }
    for (const child of collect(node.item, rng.fork("item"), env, indexPath(path, 0))) {
      const copy = base.slice();
      copy[0] = child.value;
      out.push(cand(copy, child.label, child.constraint, child.path, child.expectValid));
    }
  }
  return out;
}

function collectObject(node: ObjectNode, rng: Rng, env: GenEnv, path: string): Candidate[] {
  const out: Candidate[] = [];
  const base = generateValue(node, rng.fork("base"), env, path) as Record<string, unknown>;
  for (const prop of node.props) {
    const childPath = joinPath(path, prop.key);
    const without = Object.fromEntries(Object.entries(base).filter(([key]) => key !== prop.key));
    if (prop.optional) out.push(cand(without, `optional property "${prop.key}" omitted`, "optional", childPath, true));
    else {
      out.push(cand(without, `required property "${prop.key}" missing`, "required", childPath, false));
      out.push(cand({ ...base, [prop.key]: undefined }, `required property "${prop.key}" is undefined`, "required", childPath, false));
    }
    for (const child of collect(prop.node, rng.fork(prop.key), env, childPath)) {
      out.push(cand({ ...base, [prop.key]: child.value }, child.label, child.constraint, child.path, child.expectValid));
    }
  }
  if (node.strict) out.push(cand({ ...base, __unexpected__: 1 }, "unknown property", "strict", joinPath(path, "__unexpected__"), false));
  return out;
}

/**
 * Deterministic boundary + invalid cases for `node`, plus optional random valid values.
 * Every returned `valid: true` value is re-validated against the schema and every `valid: false`
 * value is verified to fail it. Candidates that disagree with their intended classification
 * (possible with unions) are dropped rather than mislabelled. Boundary cases larger than the
 * configured limits are omitted. This is boundary-focused, not exhaustive coverage.
 */
export function generateEdgeCases(node: Node, root: Rng, env: GenEnv, options: EdgeCaseOptions = {}): EdgeCase<unknown>[] {
  const include = options.include ?? ["valid", "invalid"];
  const limit = options.limit ?? 1000;
  const random = options.random ?? 0;
  if (!Number.isSafeInteger(limit) || limit < 0) throw new ConfigError(`edgeCases limit must be a non-negative integer (got ${limit})`);
  if (!Number.isSafeInteger(random) || random < 0 || random > env.limits.maxCount) {
    throw new ConfigError(`edgeCases random must be an integer in [0, ${env.limits.maxCount}] (got ${random})`);
  }
  const wantValid = include.includes("valid");
  const wantInvalid = include.includes("invalid");
  const results: EdgeCase<unknown>[] = [];
  const seen = new Set<string>();

  for (const c of collect(node, root.fork("edge"), env, "")) {
    if (results.length >= limit) break;
    const issues = validateNode(node, c.value);
    const isValid = issues.length === 0;
    if (isValid !== c.expectValid) continue;
    if (isValid ? !wantValid : !wantInvalid) continue;
    const key = `${isValid}|${canonicalKey(c.value)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(
      isValid
        ? { valid: true, category: "boundary", value: c.value, label: c.label, path: c.path, constraint: c.constraint }
        : { valid: false, category: "invalid", value: c.value, label: c.label, path: c.path, constraint: c.constraint },
    );
  }

  const randomRoot = root.fork("edge-random");
  for (let i = 0; i < random; i++) {
    const value = generateValue(node, randomRoot.fork(i), env);
    if (validateNode(node, value).length > 0) {
      throw new GenerationError("Random edge case failed validation", { seed: env.seed });
    }
    results.push({ valid: true, category: "random", value, label: `random valid value #${i + 1}`, path: "", constraint: "random" });
  }
  return results;
}
