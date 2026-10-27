import { describe, expect, it } from "vitest";
import { ALGORITHM_VERSION, createSeed, VERSION, GenerationError } from "../../src/index.js";

describe("generateWithReport", () => {
  it("reports seed, factory, config and a reproduce snippet on success", () => {
    const seed = createSeed({ seed: 1 });
    const f = seed.factory({ id: (_g, c) => c.sequence, token: () => "super-secret" }, { name: "user", traits: { vip: { id: 0 } } });
    const r = seed.generateWithReport(f, { count: 5, seed: 12345, traits: ["vip"], overrides: { token: "also-secret" } });
    expect(r.ok).toBe(true);
    expect(r.seed).toBe(12345);
    expect(r.factory).toBe("user");
    expect(r.count).toBe(5);
    expect(r.records).toHaveLength(5);
    expect(r.algorithmVersion).toBe(ALGORITHM_VERSION);
    expect(r.packageVersion).toBe(VERSION);
    expect(r.reproduce).toContain("12345");
    expect(r.overriddenFields).toEqual(["token"]);
    const { records: _records, ...withoutRecords } = r;
    expect(JSON.stringify(withoutRecords)).not.toContain("secret");
  });

  it("the report's seed reproduces the same records", () => {
    const seed = createSeed({ seed: 1 });
    const f = seed.factory({ n: (g) => g.number.int({ min: 0, max: 1e9 }) });
    const r = seed.generateWithReport(f, { count: 10, seed: 777 });
    expect(createSeed({ seed: 777 }).generate(f, 10)).toEqual(r.records);
  });

  it("collects failures with index, path, constraint, hint; keeps going; never echoes values", () => {
    const seed = createSeed({ seed: 4 });
    const f = seed.factory({
      v: (g, c) => {
        if (c.index % 2 === 1) return g.number.int({ min: 9, max: 1 });
        return c.index;
      },
    });
    const r = seed.generateWithReport(f, { count: 6 });
    expect(r.ok).toBe(false);
    expect(r.records).toHaveLength(3);
    expect(r.failures.map((x) => x.index)).toEqual([1, 3, 5]);
    expect(r.failures[0]).toMatchObject({ code: "GENERATION", path: "v" });
    expect(r.seed).toBe(4);
  });

  it("truncates after 100 failures", () => {
    const seed = createSeed({ seed: 4 });
    const f = seed.factory({
      v: () => {
        throw new Error("x");
      },
    });
    const r = seed.generateWithReport(f, { count: 500 });
    expect(r.failures).toHaveLength(100);
    expect(r.failuresTruncated).toBe(true);
  });

  it("errors are JSON-safe and carry the seed", () => {
    const seed = createSeed({ seed: 8 });
    const f = seed.factory({
      v: () => {
        throw new Error("db password hunter2");
      },
    });
    try {
      seed.build(f);
      expect.unreachable();
    } catch (e) {
      const json = JSON.stringify((e as GenerationError).toJSON());
      expect(json).toContain('"seed":8');
      expect(json).not.toContain("hunter2");
    }
  });
});
