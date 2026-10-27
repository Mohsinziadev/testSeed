import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createSeed, GenerationError, OverrideError, ConfigError, t } from "../../src/index.js";

function setup(seedValue: number | string = 42) {
  const seed = createSeed({ seed: seedValue });
  const user = seed.factory(
    {
      id: (_g, ctx) => ctx.sequence,
      name: (g) => g.person.fullName(),
      age: t.int({ min: 18, max: 80 }),
      role: "user" as string,
      address: (g) => g.location.address(),
    },
    { name: "user", traits: { admin: { role: "admin" } } },
  );
  return { seed, user };
}

describe("factory", () => {
  it("is deterministic: same seed and factory give the same records", () => {
    expect(setup().seed.generate(setup().user, 25)).toEqual(setup().seed.generate(setup().user, 25));
  });

  it("different seeds differ", () => {
    const a = setup(1);
    const b = setup(2);
    expect(a.seed.generate(a.user, 5)).not.toEqual(b.seed.generate(b.user, 5));
  });

  it("record i does not depend on count: generate(10) is a prefix of generate(100)", () => {
    const { seed, user } = setup();
    expect(seed.generate(user, 100).slice(0, 10)).toEqual(seed.generate(user, 10));
  });

  it("generate is pure: calling twice returns equal data; start selects a window", () => {
    const { seed, user } = setup();
    expect(seed.generate(user, 5)).toEqual(seed.generate(user, 5));
    expect(seed.generate(user, 5, { start: 3 })).toEqual(seed.generate(user, 8).slice(3));
  });

  it("the n-th build equals the n-th generated record", () => {
    const { seed, user } = setup();
    const built = [seed.build(user), seed.build(user), seed.build(user)];
    expect(built).toEqual(setup().seed.generate(user, 3));
  });

  it("adding a field does not change the other fields (per-field streams)", () => {
    const seed = createSeed({ seed: 7 });
    const small = seed.factory({ name: (g) => g.person.fullName(), age: (g) => g.number.int({ min: 1, max: 99 }) }, { name: "p" });
    const big = seed.factory(
      {
        extra: (g) => g.uuid(),
        name: (g) => g.person.fullName(),
        age: (g) => g.number.int({ min: 1, max: 99 }),
        more: (g) => g.string.alpha(5),
      },
      { name: "p" },
    );
    const a = seed.generate(small, 20);
    const b = seed.generate(big, 20);
    expect(b.map((r) => ({ name: r.name, age: r.age }))).toEqual(a);
  });

  it("overriding a field leaves other fields unchanged", () => {
    const { seed, user } = setup();
    const base = seed.generate(user, 1)[0]!;
    const over = seed.generate(user, 1, { overrides: { name: "Alex Morgan", age: 32 } })[0]!;
    expect(over).toEqual({ ...base, name: "Alex Morgan", age: 32 });
  });

  it("sequence ids are unique", () => {
    const { seed, user } = setup();
    const ids = seed.generate(user, 1000).map((u) => u.id);
    expect(new Set(ids).size).toBe(1000);
  });

  it("traits change fields; unknown traits are rejected", () => {
    const { seed, user } = setup();
    expect(seed.build(user, {}, { traits: ["admin"] }).role).toBe("admin");
    expect(seed.generate(user, 3, { traits: ["admin"] }).every((u) => u.role === "admin")).toBe(true);
    expect(() => seed.build(user, {}, { traits: ["nope" as "admin"] })).toThrow(OverrideError);
  });

  it("rejects traits that reference unknown fields at definition time", () => {
    const seed = createSeed({ seed: 1 });
    expect(() => seed.factory({ a: 1 }, { traits: { bad: { b: 2 } as never } })).toThrow(ConfigError);
  });

  it("rejects unknown override keys with the list of known fields", () => {
    const { seed, user } = setup();
    expect(() => seed.build(user, { nme: "x" } as never)).toThrowError(/Unknown override "nme".*Known fields: id, name/s);
  });

  it("validates overrides against schema-backed fields with path and constraint", () => {
    const { seed, user } = setup();
    try {
      seed.build(user, { age: 5 });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(OverrideError);
      const err = e as OverrideError;
      expect(err.path).toBe("age");
      expect(err.constraint).toBe("min");
      expect(err.seed).toBe(42);
      expect(err.message).not.toContain("5)"); // value not echoed
    }
  });

  it("does not mutate caller-owned overrides or trait/field definitions", () => {
    const { seed, user } = setup();
    const overrides = Object.freeze({ name: "Frozen" });
    expect(() => seed.build(user, overrides)).not.toThrow();
    const nested = { street: "s" };
    const f = seed.factory({ addr: nested });
    const rec = seed.build(f);
    expect(rec.addr).toBe(nested); // constants are passed through by reference, never copied or modified
    expect(nested).toEqual({ street: "s" });
  });

  it("wraps user-function failures with path and keeps the cause", () => {
    const seed = createSeed({ seed: 9 });
    const f = seed.factory({
      ok: 1,
      bad: () => {
        throw new TypeError("boom");
      },
    });
    try {
      seed.build(f);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(GenerationError);
      expect((e as GenerationError).path).toBe("bad");
      expect((e as GenerationError).seed).toBe(9);
      expect((e as Error).cause).toBeInstanceOf(TypeError);
      expect((e as Error).message).not.toContain("boom");
    }
  });

  it("surfaces invalid generator arguments with the field path", () => {
    const seed = createSeed({ seed: 9 });
    const f = seed.factory({ n: (g) => g.number.int({ min: 5, max: 1 }) });
    expect(() => seed.build(f)).toThrowError(/Field "n" failed/);
  });

  describe("validator (Standard Schema, e.g. Zod)", () => {
    const schema = z.object({ email: z.string().email(), age: z.number().int().min(18) });

    it("accepts records that pass and retries deterministically otherwise", () => {
      const seed = createSeed({ seed: 5 });
      const f = seed.factory(
        { email: (g) => g.internet.email(), age: (g) => g.number.int({ min: 0, max: 40 }) },
        { validator: schema, maxAttempts: 50, name: "v" },
      );
      const a = seed.generate(f, 50);
      expect(a.every((r) => schema.safeParse(r).success)).toBe(true);
      expect(createSeed({ seed: 5 }).generate(f, 50)).toEqual(a);
    });

    it("fails with validator issues, path and seed when it can never pass", () => {
      const seed = createSeed({ seed: 5 });
      const f = seed.factory({ email: "not-an-email", age: 20 }, { validator: schema, maxAttempts: 3 });
      try {
        seed.build(f);
        expect.unreachable();
      } catch (e) {
        const err = e as GenerationError;
        expect(err).toBeInstanceOf(GenerationError);
        expect(err.path).toBe("email");
        expect(err.seed).toBe(5);
        expect(err.issues.length).toBeGreaterThan(0);
        expect(err.message).not.toContain("not-an-email");
      }
    });

    it("blames the caller when overrides break the validator", () => {
      const seed = createSeed({ seed: 5 });
      const f = seed.factory({ email: (g) => g.internet.email(), age: 30 }, { validator: schema });
      expect(() => seed.build(f, { age: 3 })).toThrow(OverrideError);
    });

    it("rejects async validators and non-standard validators", () => {
      const seed = createSeed({ seed: 5 });
      const asyncV = { "~standard": { version: 1 as const, vendor: "x", validate: () => Promise.resolve({ value: 1 }) } };
      expect(() => seed.build(seed.factory({ a: 1 }, { validator: asyncV }))).toThrow(ConfigError);
      expect(() => seed.factory({ a: 1 }, { validator: {} as never })).toThrow(ConfigError);
    });
  });

  it("validates factory options", () => {
    const seed = createSeed({ seed: 1 });
    expect(() => seed.factory({}, { name: "" })).toThrow(ConfigError);
    expect(() => seed.factory({}, { maxAttempts: 0 })).toThrow(ConfigError);
  });
});

describe("count and limits", () => {
  it("rejects invalid counts", () => {
    const { seed, user } = setup();
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => seed.generate(user, bad)).toThrow(ConfigError);
  });

  it("count 0 returns an empty array", () => {
    const { seed, user } = setup();
    expect(seed.generate(user, 0)).toEqual([]);
  });

  it("enforces limits.maxCount with an actionable message", () => {
    const seed = createSeed({ seed: 1, limits: { maxCount: 10 } });
    const f = seed.factory({ a: 1 });
    expect(seed.generate(f, 10)).toHaveLength(10);
    expect(() => seed.generate(f, 11)).toThrowError(/maxCount.*stream/s);
  });

  it("rejects invalid limits", () => {
    expect(() => createSeed({ seed: 1, limits: { maxCount: 0 } })).toThrow(ConfigError);
  });
});
