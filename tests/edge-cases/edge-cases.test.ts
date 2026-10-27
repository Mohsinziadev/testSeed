import { describe, expect, it } from "vitest";
import { ConfigError, createSeed, fromJsonSchema, t, validate } from "../../src/index.js";
import { canonicalKey } from "../../src/schema/util.js";

const seed = createSeed({ seed: 77 });

describe("edgeCases", () => {
  const schema = t.object({
    name: t.string({ minLength: 2, maxLength: 10 }),
    age: t.int({ min: 18, max: 80 }),
    ratio: t.number({ min: 0, max: 1 }),
    tags: t.array(t.string({ maxLength: 3 }), { max: 3 }),
    nick: t.string().optional(),
    bio: t.string({ maxLength: 50 }).nullable(),
    born: t.dateString({ min: "1900-01-01", max: "2100-01-01" }),
    role: t.enum(["a", "b"]),
  });
  const all = seed.edgeCases(schema, { random: 5 });
  const find = (label: string, path: string) => all.find((c) => c.label === label && c.path === path);

  it("every valid case passes validation and every invalid case fails it", () => {
    expect(all.length).toBeGreaterThan(60);
    for (const c of all) expect(validate(schema, c.value).length === 0).toBe(c.valid);
  });

  it("separates categories", () => {
    expect(all.filter((c) => c.category === "boundary").every((c) => c.valid)).toBe(true);
    expect(all.filter((c) => c.category === "invalid").every((c) => !c.valid)).toBe(true);
    expect(all.filter((c) => c.category === "random")).toHaveLength(5);
  });

  it("include: ['valid'] never yields an invalid value; include: ['invalid'] never yields a valid one", () => {
    for (const c of seed.edgeCases(schema, { include: ["valid"] })) expect(validate(schema, c.value)).toEqual([]);
    const invalid = seed.edgeCases(schema, { include: ["invalid"] });
    expect(invalid.length).toBeGreaterThan(20);
    for (const c of invalid) expect(validate(schema, c.value).length).toBeGreaterThan(0);
  });

  it("covers string boundaries exactly", () => {
    expect((find("string at minLength", "name")!.value as { name: string }).name).toHaveLength(2);
    expect((find("string at maxLength", "name")!.value as { name: string }).name).toHaveLength(10);
    expect((find("string one below minLength", "name")!.value as { name: string }).name).toHaveLength(1);
    expect((find("string one above maxLength", "name")!.value as { name: string }).name).toHaveLength(11);
    expect(find("string one above maxLength", "name")!.valid).toBe(false);
  });

  it("includes unicode (astral code points count once) and keeps them valid", () => {
    const c = find("unicode string (astral, accented, CJK)", "name")!;
    expect(c.valid).toBe(true);
    expect([...(c.value as { name: string }).name].length).toBe(2);
  });

  it("covers integer and float boundaries including values immediately outside", () => {
    expect((find("number at minimum", "age")!.value as { age: number }).age).toBe(18);
    expect((find("number at maximum", "age")!.value as { age: number }).age).toBe(80);
    expect((find("number just below minimum", "age")!.value as { age: number }).age).toBe(17);
    expect(find("number just below minimum", "age")!.valid).toBe(false);
    const above = find("number just above maximum", "ratio")!;
    expect((above.value as { ratio: number }).ratio).toBe(1.0000000000000002);
    expect(above.valid).toBe(false);
    expect(find("NaN", "age")!.valid).toBe(false);
    expect(find("non-integer", "age")!.valid).toBe(false);
  });

  it("covers arrays: empty, max, over max, duplicates and element-level cases", () => {
    expect((find("empty array", "tags")!.value as { tags: unknown[] }).tags).toEqual([]);
    expect((find("array at maxItems", "tags")!.value as { tags: unknown[] }).tags).toHaveLength(3);
    expect(find("array one above maxItems", "tags")!.valid).toBe(false);
    expect(find("array with duplicate elements (allowed)", "tags")!.valid).toBe(true);
    expect(find("string one above maxLength", "tags[0]")!.valid).toBe(false);
  });

  it("covers optional / required / nullable handling", () => {
    expect(find('optional property "nick" omitted', "nick")!.valid).toBe(true);
    expect(find('required property "name" missing', "name")!.valid).toBe(false);
    expect(find('required property "name" is undefined', "name")!.valid).toBe(false);
    expect(find("null", "bio")!.valid).toBe(true);
    expect(find("null", "name")).toBeUndefined();
  });

  it("covers dates: boundaries, leap day, epoch, impossible dates", () => {
    expect(find("leap day 2024-02-29", "born")!.valid).toBe(true);
    expect(find("Unix epoch", "born")!.valid).toBe(true);
    expect(find("date 1ms before minimum", "born")!.valid).toBe(false);
    expect(find("Feb 29 in a non-leap year", "born")!.valid).toBe(false);
    expect(find("impossible month/day", "born")!.valid).toBe(false);
  });

  it("strict objects get an unknown-property invalid case", () => {
    const strict = t.object({ a: t.int() }, { strict: true });
    const cs = seed.edgeCases(strict);
    expect(cs.find((c) => c.constraint === "strict")?.valid).toBe(false);
  });

  it("unique arrays get an invalid duplicate case", () => {
    const cs = seed.edgeCases(t.array(t.int({ min: 0, max: 100 }), { unique: true, min: 2 }));
    expect(cs.find((c) => c.label === "array with duplicate elements")?.valid).toBe(false);
  });

  it("zero-width ranges, min == max", () => {
    const cs = seed.edgeCases(t.int({ min: 5, max: 5 }));
    expect(cs.filter((c) => c.valid).map((c) => c.value)).toContain(5);
    expect(cs.filter((c) => c.valid).every((c) => c.value === 5)).toBe(true);
  });

  it("unbounded ints include safe-integer extremes", () => {
    const vals = seed.edgeCases(t.int(), { include: ["valid"] }).map((c) => c.value);
    expect(vals).toContain(Number.MAX_SAFE_INTEGER);
    expect(vals).toContain(Number.MIN_SAFE_INTEGER);
  });

  it("unions: cases are verified against the whole union, nothing is mislabelled", () => {
    const u = t.union([t.int({ min: 0, max: 9 }), t.string({ maxLength: 3 })]);
    for (const c of seed.edgeCases(u)) expect(validate(u, c.value).length === 0).toBe(c.valid);
  });

  it("is deterministic", () => {
    expect(createSeed({ seed: 5 }).edgeCases(schema, { random: 3 })).toEqual(createSeed({ seed: 5 }).edgeCases(schema, { random: 3 }));
  });

  it("works for JSON Schema input", () => {
    const s = fromJsonSchema({ type: "object", properties: { n: { type: "integer", minimum: 1, maximum: 3 } }, required: ["n"] });
    const cs = seed.edgeCases(s);
    expect(cs.some((c) => !c.valid && c.constraint === "required")).toBe(true);
    for (const c of cs) expect(validate(s, c.value).length === 0).toBe(c.valid);
  });

  it("limit caps results; invalid arguments are rejected", () => {
    expect(seed.edgeCases(schema, { limit: 7 })).toHaveLength(7);
    expect(seed.edgeCases(schema, { limit: 0 })).toEqual([]);
    expect(() => seed.edgeCases(schema, { limit: -1 })).toThrow(ConfigError);
    expect(() => seed.edgeCases(schema, { random: 1.5 })).toThrow(ConfigError);
  });

  it("does not return duplicate (validity, value) pairs", () => {
    const keys = all.filter((c) => c.category !== "random").map((c) => `${c.valid}${canonicalKey(c.value)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
