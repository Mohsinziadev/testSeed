import { describe, expect, it } from "vitest";
import { ConfigError, createSeed } from "../../src/index.js";

const seed = createSeed({ seed: 3 });
const f = seed.factory({ id: (_g, c) => c.sequence, name: (g) => g.person.fullName() }, { name: "s" });

describe("streaming", () => {
  it("stream yields exactly the records generate() returns", () => {
    expect([...seed.stream(f, { count: 250 })]).toEqual(seed.generate(f, 250));
  });

  it("batches respect batchSize, including a short last batch, and concatenate to generate()", () => {
    const bs = [...seed.batches(f, { count: 25, batchSize: 10 })];
    expect(bs.map((b) => b.length)).toEqual([10, 10, 5]);
    expect(bs.flat()).toEqual(seed.generate(f, 25));
  });

  it("start resumes at an index", () => {
    expect([...seed.stream(f, { count: 5, start: 100 })]).toEqual(seed.generate(f, 105).slice(100));
  });

  it("is lazy: breaking early builds only what was consumed", () => {
    let built = 0;
    const counting = seed.factory({
      n: (_g, c) => {
        built++;
        return c.index;
      },
    });
    for (const r of seed.stream(counting, { count: 1_000_000 })) {
      if (r.n === 4) break;
    }
    expect(built).toBe(5);
  });

  it("count 0 yields nothing; invalid arguments are rejected eagerly on first pull", () => {
    expect([...seed.stream(f, { count: 0 })]).toEqual([]);
    expect(() => [...seed.stream(f, { count: -1 })]).toThrow(ConfigError);
    expect(() => [...seed.batches(f, { count: 5, batchSize: 0 })]).toThrow(ConfigError);
    expect(() => [...seed.stream(f, { count: 5, start: -1 })]).toThrow(ConfigError);
  });

  it("is not limited by maxCount (that limit guards in-memory generation)", () => {
    const small = createSeed({ seed: 1, limits: { maxCount: 10 } });
    const g = small.factory({ a: 1 });
    expect([...small.stream(g, { count: 50 })]).toHaveLength(50);
    expect(() => small.generate(g, 50)).toThrow(ConfigError);
  });

  it("async batches equal sync batches", async () => {
    const out: unknown[][] = [];
    for await (const b of seed.batchesAsync(f, { count: 25, batchSize: 10 })) out.push(b);
    expect(out).toEqual([...seed.batches(f, { count: 25, batchSize: 10 })]);
  });

  it("async batches stop on abort and report the abort reason", async () => {
    const controller = new AbortController();
    const seen: number[] = [];
    await expect(
      (async () => {
        for await (const b of seed.batchesAsync(f, { count: 10_000, batchSize: 100, signal: controller.signal })) {
          seen.push(b.length);
          if (seen.length === 3) controller.abort(new Error("stop"));
        }
      })(),
    ).rejects.toThrow("stop");
    expect(seen).toHaveLength(3);
  });

  it("an already-aborted signal produces nothing", async () => {
    const controller = new AbortController();
    controller.abort();
    const it = seed.batchesAsync(f, { count: 10, signal: controller.signal });
    await expect(it.next()).rejects.toBeDefined();
  });

  it("keeps heap flat while streaming a large dataset", () => {
    const g = seed.factory({ id: (_g, c) => c.sequence, s: (gen) => gen.string.alphanumeric(40) });
    if (typeof globalThis.gc === "function") globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    let sum = 0;
    for (const r of seed.stream(g, { count: 200_000 })) sum += r.id;
    if (typeof globalThis.gc === "function") globalThis.gc();
    const growth = process.memoryUsage().heapUsed - before;
    expect(sum).toBe((200_000 * 200_001) / 2);
    // 200k records of this shape held in memory would be tens of MB; streaming must not retain them.
    expect(growth).toBeLessThan(30 * 1024 * 1024);
  });
});
