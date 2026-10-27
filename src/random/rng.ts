/**
 * Seeded pseudorandom number generator.
 *
 * Algorithm: SFC32 (Chris Doty-Humphrey's "small fast counting" generator),
 * 128-bit state, initialised from a string hash and warmed up for 12 rounds.
 * It is a statistical PRNG for test data. It is NOT cryptographically secure and
 * must not be used for passwords, tokens or keys.
 *
 * Streams can be forked by label. A fork derives from the *origin* of its parent,
 * not its current position, so `rng.fork("x")` yields the same stream no matter how
 * much the parent has been consumed. This is what makes adding a field to a factory
 * not shift the values of the other fields.
 */

const TWO_POW_26 = 67108864;
const TWO_POW_53 = 9007199254740992;
const GOLD = 0x9e3779b9;

/** Four unsigned 32-bit words. Serializable as JSON. */
export type RngState = readonly [number, number, number, number];

function fmix32(input: number): number {
  let h = input | 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

function hashString(text: string): [number, number] {
  let h1 = 0xdeadbeef ^ text.length;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return [h1 >>> 0, h2 >>> 0];
}

function hashLabel(label: string | number): [number, number] {
  if (typeof label === "string") return hashString(`s${label}`);
  if (!Number.isSafeInteger(label) || label < 0) {
    throw new RangeError("Numeric fork labels must be non-negative safe integers");
  }
  const lo = label >>> 0;
  const hi = Math.floor(label / 4294967296);
  return [fmix32(lo ^ 0x1234567), fmix32((hi + 0x7654321) | 0)];
}

export class Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;
  private readonly origin: RngState;

  private constructor(origin: RngState, state: RngState, warmUp: boolean) {
    this.origin = origin;
    this.a = state[0] | 0;
    this.b = state[1] | 0;
    this.c = state[2] | 0;
    this.d = state[3] | 0;
    if (warmUp) for (let i = 0; i < 12; i++) this.next32();
  }

  /** Create a generator from a finite number or a string. */
  static fromSeed(seed: number | string): Rng {
    if (typeof seed === "number" && !Number.isFinite(seed)) {
      throw new RangeError("Seed must be a finite number or a string");
    }
    if (typeof seed !== "number" && typeof seed !== "string") {
      throw new TypeError("Seed must be a finite number or a string");
    }
    const [h1, h2] = hashString(JSON.stringify([typeof seed, seed]));
    const words: RngState = [fmix32(h1), fmix32(h2), fmix32(h1 ^ h2 ^ GOLD), fmix32((h1 + Math.imul(h2, 0x85ebca6b)) | 0)];
    return new Rng(words, words, true);
  }

  /** Restore a generator at an exact position previously returned by `getState`. */
  static fromState(state: RngState): Rng {
    if (state.length !== 4 || !state.every((w) => Number.isInteger(w) && w >= 0 && w <= 0xffffffff)) {
      throw new RangeError("State must be four unsigned 32-bit integers");
    }
    return new Rng(state, state, false);
  }

  /** Snapshot the current position. JSON-serializable. */
  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }

  /** Independent child stream, determined only by this generator's origin and `label`. */
  fork(label: string | number): Rng {
    const [h1, h2] = hashLabel(label);
    const [p0, p1, p2, p3] = this.origin;
    const words: RngState = [fmix32(p0 ^ h1), fmix32((p1 + h2) | 0), fmix32(p2 ^ ((h2 + GOLD) | 0)), fmix32((p3 + (h1 ^ 0x85ebca6b)) | 0)];
    return new Rng(words, words, true);
  }

  /** Next unsigned 32-bit integer. */
  next32(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  /** Uniform float in [0, 1) with 53 bits of precision. */
  float(): number {
    const hi = this.next32() >>> 5;
    const lo = this.next32() >>> 6;
    return (hi * TWO_POW_26 + lo) / TWO_POW_53;
  }

  /** Uniform integer in [min, max], both inclusive, without modulo bias. */
  int(min: number, max: number): number {
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new RangeError(`int() bounds must be safe integers (got ${min}, ${max})`);
    }
    if (min > max) throw new RangeError(`int() min (${min}) must not exceed max (${max})`);
    const span = max - min + 1;
    if (span === 1) return min;
    if (span > TWO_POW_53) {
      // Span exceeds 2^53 only for near-full safe-integer ranges; exact uniformity is not offered here.
      return Math.min(max, min + Math.floor(this.float() * span));
    }
    const limit = TWO_POW_53 - (TWO_POW_53 % span);
    for (;;) {
      const r = (this.next32() >>> 5) * TWO_POW_26 + (this.next32() >>> 6);
      if (r < limit) return min + (r % span);
    }
  }

  /** True with the given probability (0..1). */
  chance(probability: number): boolean {
    if (!(probability >= 0 && probability <= 1)) {
      throw new RangeError(`probability must be within [0, 1] (got ${probability})`);
    }
    return this.float() < probability;
  }
}
