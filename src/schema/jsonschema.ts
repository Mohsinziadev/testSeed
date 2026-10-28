import { SchemaError, UnsupportedSchemaError, joinPath } from "../errors.js";
import { DEFAULT_DATE_FROM, DEFAULT_DATE_TO } from "../generators/gen.js";
import { Schema, t } from "./builder.js";
import type { Node, Prop, StringFormat } from "./node.js";
import { isPlainObject } from "./util.js";

export interface JsonSchemaOptions {
  /**
   * Accept a `pattern` that accompanies a recognised `format` (email, uuid, uri, date-time),
   * as emitted by Zod's `z.toJSONSchema`. Seedset's own values for those formats are generated
   * from a fixed shape; pass the original validator as the factory `validator` to confirm they
   * satisfy the stricter pattern. Default true. A bare `pattern` is always rejected.
   */
  readonly allowFormatPatterns?: boolean;
}

const ANNOTATIONS = new Set([
  "$schema",
  "$id",
  "$comment",
  "title",
  "description",
  "default",
  "examples",
  "deprecated",
  "readOnly",
  "writeOnly",
  "$defs",
  "definitions",
]);
const COMMON = new Set(["type", "enum", "const"]);
const BY_TYPE: Readonly<Record<string, ReadonlySet<string>>> = {
  string: new Set(["minLength", "maxLength", "format", "pattern"]),
  number: new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]),
  integer: new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum"]),
  array: new Set(["items", "minItems", "maxItems", "uniqueItems"]),
  object: new Set(["properties", "required", "additionalProperties"]),
  boolean: new Set(),
  null: new Set(),
};
const HINTS: Readonly<Record<string, string>> = {
  pattern:
    "Seedset does not generate from regular expressions. Remove `pattern`, or build the field with t.string() / a custom factory field.",
  multipleOf: "multipleOf is not supported. Use an integer range or a custom factory field.",
  allOf: "allOf is not supported. Merge the sub-schemas into one schema.",
  oneOf: "oneOf is not supported because exclusivity cannot be guaranteed. Use anyOf if overlapping options are acceptable.",
  not: "`not` is not supported.",
  if: "if/then/else is not supported.",
  patternProperties: "patternProperties is not supported.",
  propertyNames: "propertyNames is not supported.",
  dependentRequired: "dependentRequired is not supported.",
  dependentSchemas: "dependentSchemas is not supported.",
  contains: "contains is not supported.",
  minProperties: "minProperties is not supported.",
  maxProperties: "maxProperties is not supported.",
  prefixItems: "Tuple schemas (prefixItems / array-form items) are not supported.",
};
const FORMATS: Readonly<Record<string, StringFormat | "date-time">> = {
  email: "email",
  uuid: "uuid",
  uri: "url",
  url: "url",
  "date-time": "date-time",
};

interface Ctx {
  readonly root: Record<string, unknown>;
  readonly allowFormatPatterns: boolean;
  readonly refStack: readonly string[];
}

function unsupported(message: string, path: string, constraint: string): never {
  throw new UnsupportedSchemaError(message, { path, constraint, hint: HINTS[constraint] });
}

function resolveRef(ref: string, path: string, ctx: Ctx): Record<string, unknown> {
  const match = /^#\/(\$defs|definitions)\/([^/]+)$/.exec(ref);
  if (match === null) unsupported(`Only local "#/$defs/..." or "#/definitions/..." references are supported (got "${ref}")`, path, "$ref");
  const container = ctx.root[match[1] as string];
  const name = decodeURIComponent((match[2] as string).replace(/~1/g, "/").replace(/~0/g, "~"));
  const target = isPlainObject(container) ? container[name] : undefined;
  if (!isPlainObject(target)) throw new SchemaError(`Reference "${ref}" does not resolve to a schema`, { path, constraint: "$ref" });
  return target;
}

function mustBeInt(value: unknown, keyword: string, path: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new SchemaError(`${keyword} must be a non-negative integer`, { path, constraint: keyword });
  }
  return value;
}

function mustBeNumber(value: unknown, keyword: string, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SchemaError(`${keyword} must be a finite number`, { path, constraint: keyword });
  }
  return value;
}

function checkKeywords(schema: Record<string, unknown>, types: readonly string[], path: string): void {
  for (const key of Object.keys(schema)) {
    if (ANNOTATIONS.has(key) || COMMON.has(key) || key.startsWith("x-")) continue;
    if (key === "$ref" || key === "anyOf") continue;
    if (types.some((tp) => BY_TYPE[tp]?.has(key))) continue;
    if (Object.keys(BY_TYPE).some((tp) => BY_TYPE[tp]?.has(key))) continue; // valid keyword for another type: inapplicable here
    unsupported(`Unsupported JSON Schema keyword "${key}"`, path, key);
  }
}

function literalNode(value: unknown, path: string): Node {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return { kind: "literal", value };
  }
  return unsupported("enum/const members must be string, number, boolean or null", path, "enum");
}

function convertEnum(values: unknown, path: string): Node {
  if (!Array.isArray(values) || values.length === 0) throw new SchemaError("enum must be a non-empty array", { path, constraint: "enum" });
  if (values.every((v) => typeof v === "string" || typeof v === "number") && new Set(values).size === values.length) {
    return { kind: "enum", values: values as (string | number)[] };
  }
  return values.length === 1 ? literalNode(values[0], path) : { kind: "union", options: values.map((v) => literalNode(v, path)) };
}

function convertString(schema: Record<string, unknown>, path: string, ctx: Ctx): Node {
  const formatRaw = schema["format"];
  let format: StringFormat | "date-time" | undefined;
  if (formatRaw !== undefined) {
    if (typeof formatRaw !== "string" || FORMATS[formatRaw] === undefined) {
      unsupported(`Unsupported string format "${String(formatRaw)}". Supported: ${Object.keys(FORMATS).join(", ")}.`, path, "format");
    }
    format = FORMATS[formatRaw as string];
  }
  if (schema["pattern"] !== undefined && !(format !== undefined && ctx.allowFormatPatterns)) {
    unsupported("A bare `pattern` cannot be generated", path, "pattern");
  }
  const minLength = schema["minLength"] === undefined ? 0 : mustBeInt(schema["minLength"], "minLength", path);
  const maxLength = schema["maxLength"] === undefined ? undefined : mustBeInt(schema["maxLength"], "maxLength", path);
  if (format === "date-time") {
    if (schema["minLength"] !== undefined || schema["maxLength"] !== undefined) {
      unsupported("minLength/maxLength together with format date-time is not supported", path, "format");
    }
    return t.dateString({ min: DEFAULT_DATE_FROM, max: DEFAULT_DATE_TO }).node;
  }
  return t.string({ minLength, ...(maxLength === undefined ? {} : { maxLength }), ...(format === undefined ? {} : { format }) }).node;
}

function convertNumber(schema: Record<string, unknown>, integer: boolean, path: string): Node {
  let min = schema["minimum"] === undefined ? undefined : mustBeNumber(schema["minimum"], "minimum", path);
  let max = schema["maximum"] === undefined ? undefined : mustBeNumber(schema["maximum"], "maximum", path);
  for (const [kw, side] of [
    ["exclusiveMinimum", "min"],
    ["exclusiveMaximum", "max"],
  ] as const) {
    const raw = schema[kw];
    if (raw === undefined) continue;
    if (typeof raw !== "number") unsupported(`${kw} must be a number (draft 6+ form)`, path, kw);
    if (!integer) unsupported(`${kw} on non-integer numbers is not supported (no "immediately inside" float is defined)`, path, kw);
    const bound = side === "min" ? Math.floor(raw) + 1 : Math.ceil(raw) - 1;
    if (side === "min") min = min === undefined ? bound : Math.max(min, bound);
    else max = max === undefined ? bound : Math.min(max, bound);
  }
  const options = { ...(min === undefined ? {} : { min }), ...(max === undefined ? {} : { max }) };
  return (integer ? t.int(options) : t.number(options)).node;
}

function convertObject(schema: Record<string, unknown>, path: string, ctx: Ctx): Node {
  const properties = schema["properties"] ?? {};
  if (!isPlainObject(properties)) throw new SchemaError("properties must be an object", { path, constraint: "properties" });
  const required = schema["required"] ?? [];
  if (!Array.isArray(required) || !required.every((r) => typeof r === "string")) {
    throw new SchemaError("required must be an array of strings", { path, constraint: "required" });
  }
  for (const r of required as string[]) {
    if (!(r in properties)) unsupported(`required property "${r}" has no schema in "properties"`, joinPath(path, r), "required");
  }
  const additional = schema["additionalProperties"];
  if (additional !== undefined && typeof additional !== "boolean") {
    unsupported("additionalProperties with a schema is not supported (use true or false)", path, "additionalProperties");
  }
  const props: Prop[] = Object.keys(properties).map((key) => ({
    key,
    node: convert(properties[key], joinPath(path, key), ctx),
    optional: !(required as string[]).includes(key),
  }));
  return { kind: "object", props, strict: additional === false };
}

function convertTyped(schema: Record<string, unknown>, type: string, path: string, ctx: Ctx): Node {
  switch (type) {
    case "string":
      return convertString(schema, path, ctx);
    case "number":
      return convertNumber(schema, false, path);
    case "integer":
      return convertNumber(schema, true, path);
    case "boolean":
      return { kind: "boolean" };
    case "null":
      return { kind: "null" };
    case "array": {
      const items = schema["items"];
      if (items === undefined) unsupported("Arrays without `items` are not supported", path, "items");
      if (Array.isArray(items)) unsupported("Tuple-form `items` is not supported", path, "prefixItems");
      const min = schema["minItems"] === undefined ? undefined : mustBeInt(schema["minItems"], "minItems", path);
      const max = schema["maxItems"] === undefined ? undefined : mustBeInt(schema["maxItems"], "maxItems", path);
      const unique = schema["uniqueItems"];
      if (unique !== undefined && typeof unique !== "boolean")
        throw new SchemaError("uniqueItems must be boolean", { path, constraint: "uniqueItems" });
      const item = convert(items, `${path}[]`, ctx);
      return { kind: "array", item, minItems: min ?? 0, maxItems: max, unique: unique === true };
    }
    case "object":
      return convertObject(schema, path, ctx);
    default:
      return unsupported(`Unsupported type "${type}"`, path, "type");
  }
}

function convert(input: unknown, path: string, ctx: Ctx): Node {
  if (!isPlainObject(input)) {
    return unsupported("Boolean schemas and non-object schemas are not supported", path, "schema");
  }
  const schema = input;
  const ref = schema["$ref"];
  if (typeof ref === "string") {
    if (ctx.refStack.includes(ref)) unsupported(`Recursive reference "${ref}" is not supported`, path, "$ref");
    const others = Object.keys(schema).filter((k) => k !== "$ref" && !ANNOTATIONS.has(k) && !k.startsWith("x-"));
    if (others.length > 0) unsupported(`$ref combined with other keywords (${others.join(", ")}) is not supported`, path, "$ref");
    return convert(resolveRef(ref, path, ctx), path, { ...ctx, refStack: [...ctx.refStack, ref] });
  }
  for (const banned of Object.keys(HINTS)) {
    if (banned in schema && banned !== "pattern") unsupported(`Unsupported JSON Schema keyword "${banned}"`, path, banned);
  }
  if (schema["anyOf"] !== undefined) {
    const options = schema["anyOf"];
    const others = Object.keys(schema).filter((k) => k !== "anyOf" && !ANNOTATIONS.has(k) && !k.startsWith("x-"));
    if (!Array.isArray(options) || options.length === 0)
      throw new SchemaError("anyOf must be a non-empty array", { path, constraint: "anyOf" });
    if (others.length > 0) unsupported(`anyOf combined with other keywords (${others.join(", ")}) is not supported`, path, "anyOf");
    const nodes = options.map((o) => convert(o, path, ctx));
    return nodes.length === 1 ? (nodes[0] as Node) : { kind: "union", options: nodes };
  }
  if (schema["const"] !== undefined) {
    return literalNode(schema["const"], path);
  }
  if (schema["enum"] !== undefined) return convertEnum(schema["enum"], path);

  const rawType = schema["type"];
  if (rawType === undefined) unsupported("Schemas without `type`, `enum`, `const`, `anyOf` or `$ref` are not supported", path, "type");
  const types = typeof rawType === "string" ? [rawType] : rawType;
  if (!Array.isArray(types) || types.length === 0 || !types.every((x) => typeof x === "string")) {
    throw new SchemaError("type must be a string or a non-empty array of strings", { path, constraint: "type" });
  }
  checkKeywords(schema, types as string[], path);
  const nonNull = (types as string[]).filter((x) => x !== "null");
  const nodes = nonNull.map((tp) => convertTyped(schema, tp, path, ctx));
  const nullable = types.includes("null");
  let node: Node;
  if (nodes.length === 0) node = { kind: "null" };
  else if (nodes.length === 1) node = nodes[0] as Node;
  else node = { kind: "union", options: nodes };
  if (nullable && nodes.length > 0) node = { kind: "nullable", inner: node };
  return node;
}

/**
 * Convert a JSON Schema (draft 2019-09 / 2020-12 style, plain object) into a Seedset schema.
 *
 * Supported: type (incl. type arrays), properties/required, additionalProperties: boolean,
 * items, minItems/maxItems/uniqueItems, minLength/maxLength, minimum/maximum (and integer exclusive
 * bounds), enum, const, anyOf, local $ref/$defs (non-recursive), formats email, uuid, uri, date-time.
 * Anything else throws {@link UnsupportedSchemaError} naming the path and keyword; nothing is ignored silently
 * except annotation keywords (title, description, default, examples, ...).
 * The returned schema cannot be statically typed, hence `Schema<unknown>`.
 */
export function fromJsonSchema(json: unknown, options: JsonSchemaOptions = {}): Schema<unknown> {
  if (!isPlainObject(json)) unsupported("A JSON Schema must be an object (boolean schemas are not supported)", "", "schema");
  const ctx: Ctx = { root: json, allowFormatPatterns: options.allowFormatPatterns ?? true, refStack: [] };
  return new Schema<unknown>(convert(json, "", ctx));
}
