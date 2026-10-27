import { describe, expect, it } from "vitest";
import { ConfigError, createSeed } from "../../src/index.js";

describe("generators", () => {
  const s = () => createSeed({ seed: 1 });

  it("number.int respects bounds and validates arguments", () => {
    const seed = s();
    for (let i = 0; i < 500; i++) {
      const n = seed.number.int({ min: -3, max: 3 });
      expect(Number.isInteger(n) && n >= -3 && n <= 3).toBe(true);
    }
    expect(() => seed.number.int({ min: 5, max: 1 })).toThrow(ConfigError);
    expect(() => seed.number.int({ min: 0.5, max: 1 })).toThrow(ConfigError);
  });

  it("number.float respects bounds and fractionDigits", () => {
    const seed = s();
    for (let i = 0; i < 500; i++) {
      const n = seed.number.float({ min: 1, max: 2, fractionDigits: 2 });
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      expect(Math.round(n * 100) / 100).toBe(n);
    }
    expect(() => seed.number.float({ min: 2, max: 1 })).toThrow(ConfigError);
    expect(() => seed.number.float({ fractionDigits: 20 })).toThrow(ConfigError);
  });

  it("strings have exact requested lengths and alphabets", () => {
    const seed = s();
    expect(seed.string.alpha(12)).toMatch(/^[a-z]{12}$/);
    expect(seed.string.numeric(5)).toMatch(/^\d{5}$/);
    expect(seed.string.hex(9)).toMatch(/^[0-9a-f]{9}$/);
    expect(seed.string.alphanumeric(0)).toBe("");
    expect(() => seed.string.alpha(-1)).toThrow(ConfigError);
  });

  it("emails and URLs only use reserved example domains", () => {
    const seed = s();
    for (let i = 0; i < 100; i++) {
      expect(seed.internet.email()).toMatch(/^[a-z]+_\d+@example\.(com|org|net)$/);
      expect(seed.internet.url()).toMatch(/^https:\/\/[a-z]+\.example\.(com|org|net)\/[a-z]+$/);
      expect(seed.person.person().email).toMatch(/@example\.(com|org|net)$/);
    }
  });

  it("phone numbers are in the fictional 555-01XX range", () => {
    const seed = s();
    for (let i = 0; i < 100; i++) expect(seed.phone.number()).toMatch(/^\+1-\d{3}-555-01\d{2}$/);
  });

  it("uuid is v4-shaped", () => {
    const seed = s();
    for (let i = 0; i < 100; i++) expect(seed.uuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("dates fall in range and default window never depends on the clock", () => {
    const seed = s();
    for (let i = 0; i < 200; i++) {
      const d = seed.date.between({ from: "2020-01-01", to: "2020-01-02" });
      expect(d.getTime()).toBeGreaterThanOrEqual(Date.UTC(2020, 0, 1));
      expect(d.getTime()).toBeLessThanOrEqual(Date.UTC(2020, 0, 2));
      expect(seed.date.iso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
    expect(() => seed.date.between({ from: "2021-01-01", to: "2020-01-01" })).toThrow(ConfigError);
    expect(() => seed.date.between({ from: "garbage" })).toThrow(ConfigError);
  });

  it("weighted honours weights, skips zero weights, and validates", () => {
    const seed = s();
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 20000; i++)
      counts[
        seed.helpers.weighted([
          { value: "a", weight: 3 },
          { value: "b", weight: 1 },
          { value: "c", weight: 0 },
        ])
      ]!++;
    expect(counts.c).toBe(0);
    expect(counts.a! / counts.b!).toBeGreaterThan(2.6);
    expect(counts.a! / counts.b!).toBeLessThan(3.4);
    expect(() => seed.helpers.weighted([])).toThrow(ConfigError);
    expect(() => seed.helpers.weighted([{ value: 1, weight: 0 }])).toThrow(ConfigError);
    expect(() => seed.helpers.weighted([{ value: 1, weight: -1 }])).toThrow(ConfigError);
    expect(() => seed.helpers.weighted([{ value: 1, weight: Number.NaN }])).toThrow(ConfigError);
  });

  it("pick, pickMany and shuffle", () => {
    const seed = s();
    expect(() => seed.helpers.pick([])).toThrow(ConfigError);
    const many = seed.helpers.pickMany([1, 2, 3, 4, 5], 5);
    expect([...many].sort()).toEqual([1, 2, 3, 4, 5]);
    expect(() => seed.helpers.pickMany([1, 2], 3)).toThrow(ConfigError);
    const input = [1, 2, 3, 4];
    const shuffled = seed.helpers.shuffle(input);
    expect(input).toEqual([1, 2, 3, 4]);
    expect([...shuffled].sort()).toEqual(input);
  });

  it("nullable/optional produce both outcomes and arrayOf honours lengths", () => {
    const seed = s();
    const values = Array.from({ length: 200 }, () => seed.helpers.nullable(() => 1, 0.5));
    expect(values).toContain(null);
    expect(values).toContain(1);
    const opt = Array.from({ length: 200 }, () => seed.helpers.optional(() => 1, 0.5));
    expect(opt).toContain(undefined);
    expect(seed.helpers.arrayOf(3, (i) => i)).toEqual([0, 1, 2]);
    for (let i = 0; i < 50; i++) expect(seed.helpers.arrayOf({ min: 2, max: 4 }, () => 0).length).toBeGreaterThanOrEqual(2);
  });

  it("address has all parts", () => {
    const a = s().location.address();
    expect(Object.keys(a).sort()).toEqual(["city", "country", "postalCode", "region", "street"]);
    expect(a.postalCode).toMatch(/^\d{5}$/);
  });

  it("two seeds are isolated even when interleaved", () => {
    const a1 = createSeed({ seed: 3 });
    const solo = Array.from({ length: 10 }, () => a1.person.fullName());
    const a2 = createSeed({ seed: 3 });
    const b = createSeed({ seed: 4 });
    const mixed = Array.from({ length: 10 }, () => {
      b.person.fullName();
      return a2.person.fullName();
    });
    expect(mixed).toEqual(solo);
  });

  it("unseeded instances expose a reproducible seed", () => {
    const a = createSeed();
    const b = createSeed({ seed: a.seed });
    expect(a.person.fullName()).toBe(b.person.fullName());
  });
});
