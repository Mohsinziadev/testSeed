import { GenerationError, LimitError, indexPath, joinPath } from "../errors.js";
import { Gen } from "../generators/gen.js";
import type { Rng } from "../random/rng.js";
import type { Limits, Node } from "./node.js";
import { NULL_PROBABILITY, OPTIONAL_PRESENT_PROBABILITY } from "./node.js";
import { canonicalKey } from "./util.js";
import { validateNode } from "./validate.js";

export interface GenEnv {
  readonly seed: string | number;
  readonly limits: Limits;
}

const DEFAULT_STRING_SPAN = 12;
const DEFAULT_ARRAY_SPAN = 4;
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

function gen(node: Node, rng: Rng, env: GenEnv, path: string): unknown {
  switch (node.kind) {
    case "string": {
      if (node.minLength > env.limits.maxStringLength) {
        throw new LimitError(`minLength ${node.minLength} exceeds the maxStringLength limit (${env.limits.maxStringLength})`, {
          path,
          constraint: "minLength",
          seed: env.seed,
          hint: "Raise `limits.maxStringLength` in createSeed() if this size is intended.",
        });
      }
      if (node.format !== undefined) {
        const g = new Gen(rng);
        const text = node.format === "email" ? g.internet.email() : node.format === "uuid" ? g.uuid() : g.internet.url();
        const length = [...text].length;
        if (length < node.minLength || (node.maxLength !== undefined && length > node.maxLength)) {
          throw new GenerationError(`A "${node.format}" string cannot satisfy the length constraints`, {
            path,
            constraint: "format+length",
            seed: env.seed,
            hint: `Remove minLength/maxLength from the ${node.format} schema, or drop the format.`,
          });
        }
        return text;
      }
      const hi = Math.min(node.maxLength ?? node.minLength + DEFAULT_STRING_SPAN, env.limits.maxStringLength);
      const length = rng.int(node.minLength, Math.max(node.minLength, hi));
      let out = "";
      for (let i = 0; i < length; i++) out += ALNUM.charAt(rng.int(0, ALNUM.length - 1));
      return out;
    }
    case "number": {
      let lo = node.min;
      let hi = node.max;
      if (lo === undefined && hi === undefined) {
        lo = 0;
        hi = 1000;
      } else if (lo === undefined) {
        lo = (hi as number) - 1000;
      } else if (hi === undefined) {
        hi = lo + 1000;
      }
      if (node.integer) {
        return rng.int(Math.max(Math.ceil(lo), Number.MIN_SAFE_INTEGER), Math.min(Math.floor(hi as number), Number.MAX_SAFE_INTEGER));
      }
      const u = rng.float();
      const value = lo * (1 - u) + (hi as number) * u;
      return Math.min(hi as number, Math.max(lo, value));
    }
    case "boolean":
      return rng.chance(0.5);
    case "null":
      return null;
    case "literal":
      return node.value;
    case "enum":
      return node.values[rng.int(0, node.values.length - 1)];
    case "date": {
      const ms = rng.int(node.min, node.max);
      return node.iso ? new Date(ms).toISOString() : new Date(ms);
    }
    case "array": {
      if (node.minItems > env.limits.maxArrayLength) {
        throw new LimitError(`array min ${node.minItems} exceeds the maxArrayLength limit (${env.limits.maxArrayLength})`, {
          path,
          constraint: "minItems",
          seed: env.seed,
          hint: "Raise `limits.maxArrayLength` in createSeed() if this size is intended.",
        });
      }
      const hi = Math.min(node.maxItems ?? node.minItems + DEFAULT_ARRAY_SPAN, env.limits.maxArrayLength);
      const length = rng.int(node.minItems, Math.max(node.minItems, hi));
      const out: unknown[] = [];
      if (!node.unique) {
        for (let i = 0; i < length; i++) out.push(gen(node.item, rng.fork(i), env, indexPath(path, i)));
        return out;
      }
      const seen = new Set<string>();
      let attempt = 0;
      const budget = length * 25 + 25;
      while (out.length < length) {
        if (attempt >= budget) {
          throw new GenerationError(`Could not generate ${length} distinct array elements`, {
            path,
            constraint: "unique",
            seed: env.seed,
            hint: "The element schema has fewer distinct values than the requested length; widen it or lower the array minimum.",
          });
        }
        const value = gen(node.item, rng.fork(attempt), env, indexPath(path, out.length));
        attempt++;
        const key = canonicalKey(value);
        if (!seen.has(key)) {
          seen.add(key);
          out.push(value);
        }
      }
      return out;
    }
    case "object": {
      const out: Record<string, unknown> = {};
      for (const prop of node.props) {
        const child = rng.fork(prop.key);
        if (prop.optional && !child.chance(OPTIONAL_PRESENT_PROBABILITY)) continue;
        out[prop.key] = gen(prop.node, child, env, joinPath(path, prop.key));
      }
      return out;
    }
    case "nullable":
      return rng.chance(NULL_PROBABILITY) ? null : gen(node.inner, rng, env, path);
    case "union": {
      const index = rng.int(0, node.options.length - 1);
      return gen(node.options[index] as Node, rng.fork(index), env, path);
    }
  }
}

/**
 * Generate one value for `node` and verify it against the same node. A verification failure
 * is reported, never returned: generated output never silently violates the schema.
 */
export function generateValue(node: Node, rng: Rng, env: GenEnv, path = ""): unknown {
  const value = gen(node, rng, env, path);
  const issues = validateNode(node, value, path);
  if (issues.length > 0) {
    const first = issues[0];
    throw new GenerationError(`Generated value violates its own schema: ${first?.message ?? "unknown"}`, {
      path: first?.path,
      constraint: first?.constraint,
      seed: env.seed,
      issues,
      hint: "This indicates conflicting constraints or a TestSeed bug. Please open an issue with the schema and seed.",
    });
  }
  return value;
}
