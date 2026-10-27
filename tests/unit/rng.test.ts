import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { Rng } from "../../src/index.js";

const take = (rng: Rng, n: number): number[] => Array.from({ length: n }, () => rng.next32());

describe("Rng", () => {
  it("same seed gives the same sequence", () => {
    expect(take(Rng.fromSeed(42), 50)).toEqual(take(Rng.fromSeed(42), 50));
    expect(take(Rng.fromSeed("abc"), 50)).toEqual(take(Rng.fromSeed("abc"), 50));
  });

  it("different seeds, and number vs string seeds, give different sequences", () => {
    expect(take(Rng.fromSeed(1), 8)).not.toEqual(take(Rng.fromSeed(2), 8));
    expect(take(Rng.fromSeed(1), 8)).not.toEqual(take(Rng.fromSeed("1"), 8));
  });

  it("instances are isolated: interleaving two generators does not change either", () => {
    const solo = take(Rng.fromSeed(7), 20);
    const a = Rng.fromSeed(7);
    const b = Rng.fromSeed(8);
    const interleaved: number[] = [];
    for (let i = 0; i < 20; i++) {
      interleaved.push(a.next32());
      b.next32();
    }
    expect(interleaved).toEqual(solo);
  });

  it("never touches Math.random", () => {
    const spy = vi.spyOn(Math, "random").mockImplementation(() => {
      throw new Error("Math.random called");
    });
    try {
      const rng = Rng.fromSeed(1);
      rng.int(0, 10);
      rng.float();
      rng.fork("x").next32();
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects non-finite and invalid seeds", () => {
    expect(() => Rng.fromSeed(Number.NaN)).toThrow(RangeError);
    expect(() => Rng.fromSeed(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => Rng.fromSeed({} as unknown as number)).toThrow(TypeError);
  });

  it("fork depends on label, not on how much the parent was consumed", () => {
    const fresh = Rng.fromSeed(5);
    const used = Rng.fromSeed(5);
    take(used, 1000);
    expect(take(used.fork("a"), 10)).toEqual(take(fresh.fork("a"), 10));
    expect(take(fresh.fork("a"), 10)).not.toEqual(take(fresh.fork("b"), 10));
    expect(take(fresh.fork(1), 10)).not.toEqual(take(fresh.fork("1"), 10));
  });

  it("fork order matters (a/b differs from b/a)", () => {
    const r = Rng.fromSeed(5);
    expect(take(r.fork("a").fork("b"), 5)).not.toEqual(take(r.fork("b").fork("a"), 5));
  });

  it("state can be saved and restored at the exact position", () => {
    const rng = Rng.fromSeed(99);
    take(rng, 13);
    const state = JSON.parse(JSON.stringify(rng.getState())) as [number, number, number, number];
    const expected = take(rng, 10);
    expect(take(Rng.fromState(state), 10)).toEqual(expected);
    expect(() => Rng.fromState([1, 2, 3] as unknown as [number, number, number, number])).toThrow(RangeError);
  });

  describe("int", () => {
    it("always stays within inclusive bounds (property)", () => {
      fc.assert(
        fc.property(fc.integer(), fc.integer({ min: -1000, max: 1000 }), fc.nat(5000), (seed, min, span) => {
          const rng = Rng.fromSeed(seed);
          const max = min + span;
          for (let i = 0; i < 20; i++) {
            const v = rng.int(min, max);
            if (!(Number.isInteger(v) && v >= min && v <= max)) return false;
          }
          return true;
        }),
      );
    });

    it("returns the only value when min === max, including at safe-integer extremes", () => {
      const rng = Rng.fromSeed(1);
      expect(rng.int(5, 5)).toBe(5);
      expect(rng.int(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
      expect(rng.int(Number.MIN_SAFE_INTEGER, Number.MIN_SAFE_INTEGER)).toBe(Number.MIN_SAFE_INTEGER);
    });

    it("hits both ends of a small range and is roughly uniform", () => {
      const rng = Rng.fromSeed(2024);
      const counts = [0, 0, 0];
      const n = 30000;
      for (let i = 0; i < n; i++) counts[rng.int(0, 2)]! += 1;
      for (const c of counts) expect(Math.abs(c / n - 1 / 3)).toBeLessThan(0.02);
    });

    it("stays within bounds for the full safe-integer span", () => {
      const rng = Rng.fromSeed(3);
      for (let i = 0; i < 200; i++) {
        const v = rng.int(Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
        expect(v).toBeGreaterThanOrEqual(Number.MIN_SAFE_INTEGER);
        expect(v).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
      }
    });

    it("rejects bad bounds", () => {
      const rng = Rng.fromSeed(1);
      expect(() => rng.int(2, 1)).toThrow(RangeError);
      expect(() => rng.int(0.5, 2)).toThrow(RangeError);
      expect(() => rng.int(0, Number.MAX_SAFE_INTEGER + 2)).toThrow(RangeError);
    });
  });

  it("float is within [0, 1)", () => {
    const rng = Rng.fromSeed(11);
    for (let i = 0; i < 5000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });

  it("chance validates probability and handles the extremes", () => {
    const rng = Rng.fromSeed(1);
    expect(() => rng.chance(-0.1)).toThrow(RangeError);
    expect(() => rng.chance(1.1)).toThrow(RangeError);
    expect(() => rng.chance(Number.NaN)).toThrow(RangeError);
    for (let i = 0; i < 100; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});
