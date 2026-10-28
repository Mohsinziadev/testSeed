import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createSeed,
  fromJsonSchema,
  GenerationError,
  LimitError,
  SchemaError,
  t,
  UnsupportedSchemaError,
  validate,
} from "../../src/index.js";
import type { Schema } from "../../src/index.js";

const seed = createSeed({ seed: 123 });

describe("builder + generation", () => {
  const user = t.object({
    id: t.string({ format: "uuid" }),
    email: t.string({ format: "email" }),
    age: t.int({ min: 18, max: 80 }),
    score: t.number({ min: 0, max: 1 }),
    role: t.enum(["admin", "member"]),
    tags: t.array(t.string({ minLength: 1, maxLength: 5 }), { min: 1, max: 3, unique: true }),
    nick: t.string({ minLength: 2 }).optional(),
    bio: t.string({ maxLength: 20 }).nullable(),
    createdAt: t.dateString({ min: "2020-01-01", max: "2020-12-31" }),
    visits: t.date({ min: "2021-01-01", max: "2021-01-02" }),
    kind: t.literal("user"),
    payload: t.union([t.int({ min: 0, max: 9 }), t.string({ maxLength: 3 })]),
    address: t.object({ zip: t.string({ minLength: 5, maxLength: 5 }), lines: t.array(t.string(), { max: 2 }) }),
  });

  it("generates values that satisfy every constraint (1000 samples)", () => {
    for (const v of seed.generate(user, 1000)) {
      expect(validate(user, v)).toEqual([]);
      expect(v.age).toBeGreaterThanOrEqual(18);
      expect(v.tags.length).toBeGreaterThanOrEqual(1);
      expect(new Set(v.tags).size).toBe(v.tags.length);
      expect(v.address.zip).toHaveLength(5);
    }
  });

  it("exercises optional, nullable and union branches", () => {
    const vs = seed.generate(user, 400);
    expect(vs.some((v) => v.nick === undefined)).toBe(true);
    expect(vs.some((v) => v.nick !== undefined)).toBe(true);
    expect(vs.some((v) => v.bio === null)).toBe(true);
    expect(vs.some((v) => typeof v.payload === "string")).toBe(true);
    expect(vs.some((v) => typeof v.payload === "number")).toBe(true);
  });

  it("is deterministic and adding a property does not shift existing ones", () => {
    const a = t.object({ x: t.int({ min: 0, max: 1e6 }), y: t.string() });
    const b = t.object({ z: t.string(), x: t.int({ min: 0, max: 1e6 }), y: t.string() });
    const ra = createSeed({ seed: 1 }).generate(a, 10);
    const rb = createSeed({ seed: 1 }).generate(b, 10);
    expect(rb.map(({ x, y }) => ({ x, y }))).toEqual(ra);
  });

  it("rejects contradictory schemas at build time", () => {
    expect(() => t.string({ minLength: 5, maxLength: 2 })).toThrow(SchemaError);
    expect(() => t.int({ min: 5, max: 1 })).toThrow(SchemaError);
    expect(() => t.int({ min: 1.2, max: 1.8 })).toThrow(SchemaError);
    expect(() => t.array(t.string(), { min: 3, max: 1 })).toThrow(SchemaError);
    expect(() => t.enum([] as never)).toThrow(SchemaError);
    expect(() => t.enum(["a", "a"])).toThrow(SchemaError);
    expect(() => t.date({ min: "2021-01-01", max: "2020-01-01" })).toThrow(SchemaError);
    expect(() => t.number({ min: Number.NaN })).toThrow(SchemaError);
  });

  it("fails loudly when a unique array cannot be satisfied", () => {
    const s = t.array(t.enum(["a", "b"]), { min: 3, max: 3, unique: true });
    expect(() => seed.sample(s)).toThrow(GenerationError);
  });

  it("fails loudly when format cannot satisfy length constraints", () => {
    expect(() => seed.sample(t.string({ format: "uuid", maxLength: 5 }))).toThrow(GenerationError);
  });

  it("respects configured limits", () => {
    const small = createSeed({ seed: 1, limits: { maxStringLength: 10, maxArrayLength: 3 } });
    expect(() => small.sample(t.string({ minLength: 11 }))).toThrow(LimitError);
    expect(() => small.sample(t.array(t.string(), { min: 4 }))).toThrow(LimitError);
    for (const s of small.generate(t.string(), 100)) expect(s.length).toBeLessThanOrEqual(10);
  });

  it("counts string length in code points", () => {
    expect(validate(t.string({ maxLength: 1 }), "😀")).toEqual([]);
    expect(validate(t.string({ maxLength: 1 }), "ab")).toHaveLength(1);
  });

  it("validate reports path, constraint and never the value", () => {
    const issues = validate(user, { id: "secret-token-xyz", email: 5, age: 3, tags: [], role: "root" });
    const byPath = Object.fromEntries(issues.map((i) => [i.path, i.constraint]));
    expect(byPath["id"]).toBe("format");
    expect(byPath["email"]).toBe("type");
    expect(byPath["age"]).toBe("min");
    expect(byPath["tags"]).toBe("minItems");
    expect(byPath["role"]).toBe("enum");
    expect(byPath["address"]).toBe("required");
    expect(JSON.stringify(issues)).not.toContain("secret-token-xyz");
  });

  it("validate reports nested array paths", () => {
    const s = t.object({ items: t.array(t.object({ n: t.int({ max: 5 }) })) });
    expect(validate(s, { items: [{ n: 1 }, { n: 9 }] })).toEqual([{ path: "items[1].n", constraint: "max", message: expect.any(String) }]);
  });

  it("strict objects reject unknown keys; default objects allow them", () => {
    expect(validate(t.object({ a: t.int() }, { strict: true }), { a: 1, b: 2 })[0]?.path).toBe("b");
    expect(validate(t.object({ a: t.int() }), { a: 1, b: 2 })).toEqual([]);
  });

  it("property: generated values validate for random schemas", () => {
    const leaf: fc.Arbitrary<Schema<unknown>> = fc.oneof(
      fc.record({ a: fc.nat(10), b: fc.nat(10) }).map(({ a, b }) => t.string({ minLength: Math.min(a, b), maxLength: Math.max(a, b) })),
      fc
        .record({ a: fc.integer({ min: -50, max: 50 }), b: fc.integer({ min: -50, max: 50 }) })
        .map(({ a, b }) => t.int({ min: Math.min(a, b), max: Math.max(a, b) })),
      fc.constant(t.boolean()),
      fc.constant(t.dateString()),
      fc.constant(t.enum(["x", "y", "z"])),
    );
    const schema = fc.letrec<{ s: Schema<unknown> }>((tie) => ({
      s: fc.oneof(
        { depthSize: "small", maxDepth: 3 },
        leaf,
        tie("s").map((x) => x.nullable()),
        tie("s").map((x) => t.array(x, { max: 3 })),
        fc
          .array(fc.tuple(fc.stringMatching(/^[a-z]{1,4}$/), tie("s"), fc.boolean()), { maxLength: 3 })
          .map((entries) => t.object(Object.fromEntries(entries.map(([k, s, opt]) => [k, opt ? s.optional() : s])))),
      ),
    })).s;
    fc.assert(
      fc.property(schema, fc.integer(), (s, sd) => {
        const g = createSeed({ seed: sd });
        return g.generate(s, 5).every((v) => validate(s, v).length === 0);
      }),
      { numRuns: 200 },
    );
  });
});

describe("fromJsonSchema", () => {
  const json = {
    type: "object",
    properties: {
      id: { type: "string", format: "uuid" },
      n: { type: "integer", minimum: 1, exclusiveMaximum: 5 },
      tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 4 }, minItems: 1, uniqueItems: true },
      note: { type: ["string", "null"], maxLength: 10 },
      mode: { enum: ["a", "b"] },
      when: { type: "string", format: "date-time" },
      child: { $ref: "#/$defs/child" },
      either: {
        anyOf: [
          { type: "integer", maximum: 3 },
          { type: "string", maxLength: 2 },
        ],
      },
    },
    required: ["id", "n", "tags", "child"],
    additionalProperties: false,
    $defs: { child: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] } },
  };

  it("generates valid values and enforces integer exclusive bounds", () => {
    const s = fromJsonSchema(json);
    const vs = createSeed({ seed: 4 }).generate(s, 300) as Record<string, unknown>[];
    for (const v of vs) {
      expect(validate(s, v)).toEqual([]);
      expect(v["n"]).toBeGreaterThanOrEqual(1);
      expect(v["n"]).toBeLessThanOrEqual(4);
    }
    expect(vs.some((v) => v["note"] === null)).toBe(true);
    expect(vs.some((v) => v["note"] === undefined)).toBe(true);
  });

  it.each([
    [{ type: "string", pattern: "^a+$" }, "pattern"],
    [{ type: "integer", multipleOf: 5 }, "multipleOf"],
    [{ allOf: [{ type: "string" }] }, "allOf"],
    [{ oneOf: [{ type: "string" }] }, "oneOf"],
    [{ type: "string", format: "ipv4" }, "format"],
    [{ type: "number", exclusiveMinimum: 0 }, "exclusiveMinimum"],
    [{ type: "array" }, "items"],
    [{ type: "object", properties: {}, additionalProperties: { type: "string" } }, "additionalProperties"],
    [{ type: "object", patternProperties: {} }, "patternProperties"],
    [{ description: "no type" }, "type"],
    [{ $ref: "https://example.com/x.json" }, "$ref"],
    [{ type: "string", bogusKeyword: 1 }, "bogusKeyword"],
    [true, "schema"],
  ])("rejects unsupported schema %j naming %s", (schema, constraint) => {
    try {
      fromJsonSchema(schema);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(UnsupportedSchemaError);
      expect((e as UnsupportedSchemaError).constraint).toBe(constraint);
    }
  });

  it("reports the path of the unsupported keyword", () => {
    try {
      fromJsonSchema({ type: "object", properties: { a: { type: "object", properties: { b: { type: "string", pattern: "x" } } } } });
      expect.unreachable();
    } catch (e) {
      expect((e as UnsupportedSchemaError).path).toBe("a.b");
    }
  });

  it("detects recursive $ref", () => {
    expect(() =>
      fromJsonSchema({
        type: "object",
        properties: { next: { $ref: "#/$defs/n" } },
        $defs: { n: { type: "object", properties: { next: { $ref: "#/$defs/n" } } } },
      }),
    ).toThrow(/Recursive/);
  });

  it("ignores annotation keywords and x- extensions", () => {
    const s = fromJsonSchema({ type: "string", title: "T", description: "D", default: "x", examples: ["a"], "x-vendor": 1 });
    expect(validate(s, seed.sample(s))).toEqual([]);
  });

  it("rejects bare patterns when format patterns are disallowed", () => {
    expect(() => fromJsonSchema({ type: "string", format: "email", pattern: "x" }, { allowFormatPatterns: false })).toThrow(
      UnsupportedSchemaError,
    );
  });
});

describe("Zod interop (Zod -> JSON Schema -> Seedset, validated by Zod itself)", () => {
  const zUser = z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    site: z.url(),
    age: z.number().int().min(18).max(80),
    role: z.enum(["admin", "member"]),
    tags: z.array(z.string().min(1).max(5)).min(1).max(3),
    nick: z.string().optional(),
    note: z.string().nullable(),
    at: z.iso.datetime(),
    u: z.union([z.string(), z.number().int().max(9)]),
    score: z.number().min(0).max(1),
  });

  it("every generated value passes the original Zod schema", () => {
    const s = fromJsonSchema(z.toJSONSchema(zUser));
    const values = createSeed({ seed: 2026 }).generate(s, 2000);
    for (const v of values) expect(zUser.safeParse(v).success).toBe(true);
  });

  it('boundary and invalid edge cases agree with Zod\'s verdict (io: "input")', () => {
    const small = z.object({ age: z.number().int().min(18).max(80), name: z.string().min(1).max(8), tags: z.array(z.string()).max(3) });
    const s = fromJsonSchema(z.toJSONSchema(small, { io: "input" }));
    const cases = createSeed({ seed: 1 }).edgeCases(s);
    expect(cases.length).toBeGreaterThan(20);
    for (const c of cases) expect(small.safeParse(c.value).success).toBe(c.valid);
  });

  it("documented gap: default z.toJSONSchema emits additionalProperties:false but Zod strips unknown keys instead of rejecting", () => {
    const small = z.object({ age: z.number().int() });
    const s = fromJsonSchema(z.toJSONSchema(small));
    const disagreements = createSeed({ seed: 1 })
      .edgeCases(s)
      .filter((c) => small.safeParse(c.value).success !== c.valid);
    expect(disagreements.map((c) => c.constraint)).toEqual(["strict"]);
  });
});
