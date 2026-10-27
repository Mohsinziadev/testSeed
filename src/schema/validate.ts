import type { Issue } from "../errors.js";
import { joinPath, indexPath } from "../errors.js";
import type { Node } from "./node.js";
import { canonicalKey, codePointLength, isPlainObject, kindOf } from "./util.js";

const MAX_ISSUES = 100;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?Z$/;

function isUrl(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

/** Parse the strict ISO form accepted by `t.dateString`; returns ms or undefined. */
export function parseIso(text: string): number | undefined {
  const m = ISO.exec(text);
  if (m === null) return undefined;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number, number];
  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return undefined;
  const back = new Date(ms);
  if (
    back.getUTCFullYear() !== y ||
    back.getUTCMonth() !== mo - 1 ||
    back.getUTCDate() !== d ||
    back.getUTCHours() !== h ||
    back.getUTCMinutes() !== mi ||
    back.getUTCSeconds() !== s
  ) {
    return undefined;
  }
  return ms;
}

function push(issues: Issue[], path: string, constraint: string, message: string): void {
  if (issues.length < MAX_ISSUES) issues.push({ path, constraint, message });
}

function check(node: Node, value: unknown, path: string, issues: Issue[]): void {
  switch (node.kind) {
    case "string": {
      if (typeof value !== "string") return push(issues, path, "type", `expected string, received ${kindOf(value)}`);
      const len = codePointLength(value);
      if (len < node.minLength) push(issues, path, "minLength", `length ${len} is below minLength ${node.minLength}`);
      if (node.maxLength !== undefined && len > node.maxLength)
        push(issues, path, "maxLength", `length ${len} exceeds maxLength ${node.maxLength}`);
      if (node.format === "email" && !EMAIL.test(value)) push(issues, path, "format", "not an email-shaped string");
      if (node.format === "uuid" && !UUID.test(value)) push(issues, path, "format", "not a UUID");
      if (node.format === "url" && !isUrl(value)) push(issues, path, "format", "not an absolute URL");
      return;
    }
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return push(
          issues,
          path,
          "type",
          `expected finite number, received ${typeof value === "number" ? "non-finite number" : kindOf(value)}`,
        );
      }
      if (node.integer && !Number.isSafeInteger(value)) push(issues, path, "integer", "expected a safe integer");
      if (node.min !== undefined && value < node.min) push(issues, path, "min", `value is below minimum ${node.min}`);
      if (node.max !== undefined && value > node.max) push(issues, path, "max", `value exceeds maximum ${node.max}`);
      return;
    }
    case "boolean":
      if (typeof value !== "boolean") push(issues, path, "type", `expected boolean, received ${kindOf(value)}`);
      return;
    case "null":
      if (value !== null) push(issues, path, "type", `expected null, received ${kindOf(value)}`);
      return;
    case "literal":
      if (value !== node.value) push(issues, path, "literal", `expected the literal ${JSON.stringify(node.value)}`);
      return;
    case "enum":
      if (!(typeof value === "string" || typeof value === "number") || !node.values.includes(value)) {
        push(issues, path, "enum", `value is not one of ${node.values.length} allowed members`);
      }
      return;
    case "date": {
      let ms: number | undefined;
      if (node.iso) {
        if (typeof value !== "string") return push(issues, path, "type", `expected ISO date string, received ${kindOf(value)}`);
        ms = parseIso(value);
        if (ms === undefined) return push(issues, path, "format", "not a valid ISO-8601 UTC date-time (YYYY-MM-DDTHH:mm:ss[.SSS]Z)");
      } else {
        if (!(value instanceof Date)) return push(issues, path, "type", `expected Date, received ${kindOf(value)}`);
        ms = value.getTime();
        if (!Number.isFinite(ms)) return push(issues, path, "type", "Date is invalid");
      }
      if (ms < node.min) push(issues, path, "min", "date is before the minimum");
      if (ms > node.max) push(issues, path, "max", "date is after the maximum");
      return;
    }
    case "array": {
      if (!Array.isArray(value)) return push(issues, path, "type", `expected array, received ${kindOf(value)}`);
      if (value.length < node.minItems) push(issues, path, "minItems", `length ${value.length} is below min ${node.minItems}`);
      if (node.maxItems !== undefined && value.length > node.maxItems)
        push(issues, path, "maxItems", `length ${value.length} exceeds max ${node.maxItems}`);
      for (let i = 0; i < value.length && issues.length < MAX_ISSUES; i++) check(node.item, value[i], indexPath(path, i), issues);
      if (node.unique) {
        const seen = new Set<string>();
        for (const item of value) {
          const key = canonicalKey(item);
          if (seen.has(key)) {
            push(issues, path, "unique", "array contains duplicate elements");
            break;
          }
          seen.add(key);
        }
      }
      return;
    }
    case "object": {
      if (!isPlainObject(value)) return push(issues, path, "type", `expected object, received ${kindOf(value)}`);
      for (const prop of node.props) {
        const child = joinPath(path, prop.key);
        if (!Object.hasOwn(value, prop.key) || value[prop.key] === undefined) {
          if (!prop.optional) push(issues, child, "required", "required property is missing");
          continue;
        }
        check(prop.node, value[prop.key], child, issues);
      }
      if (node.strict) {
        const known = new Set(node.props.map((p) => p.key));
        for (const key of Object.keys(value)) {
          if (!known.has(key)) push(issues, joinPath(path, key), "strict", "unknown property");
        }
      }
      return;
    }
    case "nullable":
      if (value !== null) check(node.inner, value, path, issues);
      return;
    case "union": {
      for (const option of node.options) {
        const local: Issue[] = [];
        check(option, value, path, local);
        if (local.length === 0) return;
      }
      push(issues, path, "union", `value matches none of the ${node.options.length} union options`);
      return;
    }
  }
}

/** Collect every violation (up to 100). Empty result means valid. Never includes the value itself. */
export function validateNode(node: Node, value: unknown, basePath = ""): Issue[] {
  const issues: Issue[] = [];
  check(node, value, basePath, issues);
  return issues;
}
