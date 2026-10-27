import { ConfigError } from "../errors.js";
import type { Rng } from "../random/rng.js";
import {
  CITIES,
  COUNTRIES,
  EMAIL_DOMAINS,
  FIRST_NAMES,
  LAST_NAMES,
  REGIONS,
  STREET_NAMES,
  STREET_SUFFIXES,
  URL_TLDS,
  WORDS,
} from "./data.js";

export interface IntOptions {
  readonly min?: number;
  readonly max?: number;
}
export interface FloatOptions {
  readonly min?: number;
  readonly max?: number;
  /** Round to this many fractional digits (0-15). */
  readonly fractionDigits?: number;
}
export interface LengthOption {
  readonly min?: number;
  readonly max?: number;
}
export interface DateRange {
  readonly from?: Date | string | number;
  readonly to?: Date | string | number;
}
export interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}
export interface Address {
  readonly street: string;
  readonly city: string;
  readonly region: string;
  readonly postalCode: string;
  readonly country: string;
}
export interface Person {
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly email: string;
}

/** Fixed, deterministic default date window (never depends on the wall clock). */
export const DEFAULT_DATE_FROM = Date.UTC(2000, 0, 1);
export const DEFAULT_DATE_TO = Date.UTC(2030, 0, 1);
const MAX_ISO_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
const MIN_ISO_MS = new Date("0000-01-01T00:00:00.000Z").getTime();

const ALPHA = "abcdefghijklmnopqrstuvwxyz";
const ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const HEX = "0123456789abcdef";

function requireInt(name: string, value: number, min: number): void {
  if (!Number.isSafeInteger(value) || value < min) {
    throw new ConfigError(`${name} must be a safe integer >= ${min} (got ${value})`);
  }
}

function toMs(name: string, value: Date | string | number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const ms = value instanceof Date ? value.getTime() : typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(ms)) throw new ConfigError(`${name} is not a valid date`);
  return ms;
}

class NumberGen {
  constructor(private readonly rng: Rng) {}

  /** Integer in [min, max] inclusive. Defaults: 0..1000. */
  int(options: IntOptions = {}): number {
    const min = options.min ?? 0;
    const max = options.max ?? Math.max(min, 1000);
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) {
      throw new ConfigError(`number.int bounds must be safe integers (got ${min}, ${max})`);
    }
    if (min > max) throw new ConfigError(`number.int min (${min}) must not exceed max (${max})`);
    return this.rng.int(min, max);
  }

  /** Float in [min, max] inclusive. Defaults: 0..1. */
  float(options: FloatOptions = {}): number {
    const min = options.min ?? 0;
    const max = options.max ?? 1;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) {
      throw new ConfigError(`number.float needs finite bounds with min <= max (got ${min}, ${max})`);
    }
    let value = min + this.rng.float() * (max - min);
    if (options.fractionDigits !== undefined) {
      requireInt("number.float fractionDigits", options.fractionDigits, 0);
      if (options.fractionDigits > 15) throw new ConfigError("number.float fractionDigits must be <= 15");
      const factor = 10 ** options.fractionDigits;
      value = Math.round(value * factor) / factor;
      value = Math.min(max, Math.max(min, value));
    }
    return value;
  }
}

class StringGen {
  constructor(private readonly rng: Rng) {}

  private chars(alphabet: string, length: number | LengthOption): string {
    const n = typeof length === "number" ? length : this.rng.int(length.min ?? 1, length.max ?? Math.max(length.min ?? 1, 16));
    requireInt("string length", n, 0);
    let out = "";
    for (let i = 0; i < n; i++) out += alphabet.charAt(this.rng.int(0, alphabet.length - 1));
    return out;
  }
  /** Lowercase letters a-z. */
  alpha(length: number | LengthOption = 8): string {
    return this.chars(ALPHA, length);
  }
  /** Lowercase letters and digits. */
  alphanumeric(length: number | LengthOption = 8): string {
    return this.chars(ALNUM, length);
  }
  /** Digits 0-9. */
  numeric(length: number | LengthOption = 6): string {
    return this.chars("0123456789", length);
  }
  hex(length: number | LengthOption = 8): string {
    return this.chars(HEX, length);
  }
}

class TextGen {
  constructor(private readonly rng: Rng) {}
  words(count: number | LengthOption = 3): string {
    const n = typeof count === "number" ? count : this.rng.int(count.min ?? 1, count.max ?? Math.max(count.min ?? 1, 6));
    requireInt("text.words count", n, 0);
    const out: string[] = [];
    for (let i = 0; i < n; i++) out.push(WORDS[this.rng.int(0, WORDS.length - 1)] as string);
    return out.join(" ");
  }
  sentence(): string {
    const text = this.words({ min: 4, max: 10 });
    return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
  }
}

class DateGen {
  constructor(private readonly rng: Rng) {}

  /** Date between `from` and `to` (inclusive). Defaults to 2000-01-01..2030-01-01 UTC. */
  between(range: DateRange = {}): Date {
    const from = toMs("date.between from", range.from, DEFAULT_DATE_FROM);
    const to = toMs("date.between to", range.to, DEFAULT_DATE_TO);
    if (from > to) throw new ConfigError("date.between: `from` must not be after `to`");
    return new Date(this.rng.int(from, to));
  }
  /** Same as `between`, as an ISO-8601 UTC string (`2024-02-29T12:00:00.000Z`). */
  iso(range: DateRange = {}): string {
    const date = this.between(range);
    if (date.getTime() > MAX_ISO_MS || date.getTime() < MIN_ISO_MS) {
      throw new ConfigError("date.iso supports years 0000-9999 only");
    }
    return date.toISOString();
  }
}

class PersonGen {
  constructor(private readonly rng: Rng) {}
  firstName(): string {
    return FIRST_NAMES[this.rng.int(0, FIRST_NAMES.length - 1)] as string;
  }
  lastName(): string {
    return LAST_NAMES[this.rng.int(0, LAST_NAMES.length - 1)] as string;
  }
  fullName(): string {
    return `${this.firstName()} ${this.lastName()}`;
  }
  /** A person whose email is derived from the name (on a reserved example domain). */
  person(): Person {
    const firstName = this.firstName();
    const lastName = this.lastName();
    const email =
      `${firstName}.${lastName}${this.rng.int(1, 99)}@${EMAIL_DOMAINS[this.rng.int(0, EMAIL_DOMAINS.length - 1)]}`.toLowerCase();
    return { firstName, lastName, fullName: `${firstName} ${lastName}`, email };
  }
}

class InternetGen {
  constructor(private readonly rng: Rng) {}
  username(): string {
    const first = (FIRST_NAMES[this.rng.int(0, FIRST_NAMES.length - 1)] as string).toLowerCase();
    return `${first}_${this.rng.int(1, 9999)}`;
  }
  /** Email on an RFC 2606 reserved domain (example.com/.org/.net): never a real mailbox. */
  email(): string {
    const domain = EMAIL_DOMAINS[this.rng.int(0, EMAIL_DOMAINS.length - 1)] as string;
    return `${this.username()}@${domain}`;
  }
  /** `https://` URL on a `.example` host with a short path. */
  url(): string {
    const word = WORDS[this.rng.int(0, WORDS.length - 1)] as string;
    const tld = URL_TLDS[this.rng.int(0, URL_TLDS.length - 1)] as string;
    const path = WORDS[this.rng.int(0, WORDS.length - 1)] as string;
    return `https://${word}.example.${tld}/${path}`;
  }
  ipv4(): string {
    return [10, this.rng.int(0, 255), this.rng.int(0, 255), this.rng.int(1, 254)].join(".");
  }
}

class LocationGen {
  constructor(private readonly rng: Rng) {}
  address(): Address {
    const street = `${this.rng.int(1, 9999)} ${STREET_NAMES[this.rng.int(0, STREET_NAMES.length - 1)]} ${STREET_SUFFIXES[this.rng.int(0, STREET_SUFFIXES.length - 1)]}`;
    return {
      street,
      city: CITIES[this.rng.int(0, CITIES.length - 1)] as string,
      region: REGIONS[this.rng.int(0, REGIONS.length - 1)] as string,
      postalCode: String(this.rng.int(10000, 99999)),
      country: COUNTRIES[this.rng.int(0, COUNTRIES.length - 1)] as string,
    };
  }
}

class PhoneGen {
  constructor(private readonly rng: Rng) {}
  /** North-American-style number in the fictional 555-01XX range (reserved for fiction). */
  number(): string {
    const area = this.rng.int(201, 989);
    const line = String(this.rng.int(0, 99)).padStart(2, "0");
    return `+1-${area}-555-01${line}`;
  }
}

class Helpers {
  constructor(private readonly rng: Rng) {}

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new ConfigError("helpers.pick needs a non-empty array");
    return items[this.rng.int(0, items.length - 1)] as T;
  }

  /** `count` distinct items (without replacement), in random order. */
  pickMany<T>(items: readonly T[], count: number): T[] {
    requireInt("pickMany count", count, 0);
    if (count > items.length) {
      throw new ConfigError(`pickMany cannot pick ${count} distinct items from ${items.length}`);
    }
    return this.shuffle(items).slice(0, count);
  }

  /** Fisher-Yates shuffle. Returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** Weighted choice. Weights must be finite and >= 0, with a positive sum. */
  weighted<T>(choices: readonly Weighted<T>[]): T {
    if (choices.length === 0) throw new ConfigError("helpers.weighted needs at least one choice");
    let total = 0;
    for (const c of choices) {
      if (!Number.isFinite(c.weight) || c.weight < 0) {
        throw new ConfigError(`helpers.weighted weights must be finite and >= 0 (got ${c.weight})`);
      }
      total += c.weight;
    }
    if (total <= 0) throw new ConfigError("helpers.weighted needs a positive total weight");
    let target = this.rng.float() * total;
    for (const c of choices) {
      if (c.weight === 0) continue;
      if (target < c.weight) return c.value;
      target -= c.weight;
    }
    for (let i = choices.length - 1; i >= 0; i--) {
      const c = choices[i] as Weighted<T>;
      if (c.weight > 0) return c.value;
    }
    throw new ConfigError("helpers.weighted found no choice with positive weight");
  }

  /** Array of `count` (or random length in a range) values from `make`. */
  arrayOf<T>(length: number | LengthOption, make: (index: number) => T): T[] {
    const n = typeof length === "number" ? length : this.rng.int(length.min ?? 0, length.max ?? Math.max(length.min ?? 0, 5));
    requireInt("arrayOf length", n, 0);
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(make(i));
    return out;
  }

  /** `null` with the given probability (default 0.2), otherwise `make()`. */
  nullable<T>(make: () => T, probability = 0.2): T | null {
    return this.rng.chance(probability) ? null : make();
  }

  /** `undefined` with the given probability (default 0.2), otherwise `make()`. */
  optional<T>(make: () => T, probability = 0.2): T | undefined {
    return this.rng.chance(probability) ? undefined : make();
  }
}

/**
 * Value generators bound to one random stream. Every method consumes that stream, so two
 * `Gen`s built from the same `Rng` position produce the same values.
 */
export class Gen {
  readonly rng: Rng;
  private cache: {
    number?: NumberGen;
    string?: StringGen;
    text?: TextGen;
    date?: DateGen;
    person?: PersonGen;
    internet?: InternetGen;
    location?: LocationGen;
    phone?: PhoneGen;
    helpers?: Helpers;
  } = {};

  constructor(rng: Rng) {
    this.rng = rng;
  }

  get number(): NumberGen {
    return (this.cache.number ??= new NumberGen(this.rng));
  }
  get string(): StringGen {
    return (this.cache.string ??= new StringGen(this.rng));
  }
  get text(): TextGen {
    return (this.cache.text ??= new TextGen(this.rng));
  }
  get date(): DateGen {
    return (this.cache.date ??= new DateGen(this.rng));
  }
  get person(): PersonGen {
    return (this.cache.person ??= new PersonGen(this.rng));
  }
  get internet(): InternetGen {
    return (this.cache.internet ??= new InternetGen(this.rng));
  }
  get location(): LocationGen {
    return (this.cache.location ??= new LocationGen(this.rng));
  }
  get phone(): PhoneGen {
    return (this.cache.phone ??= new PhoneGen(this.rng));
  }
  get helpers(): Helpers {
    return (this.cache.helpers ??= new Helpers(this.rng));
  }

  /** True with the given probability (default 0.5). */
  boolean(probability = 0.5): boolean {
    return this.rng.chance(probability);
  }

  /**
   * Random UUID in version-4 format. Drawn from the seeded stream, so it is reproducible
   * but NOT unique-by-construction and NOT suitable as a secret. Use a sequence when you
   * need guaranteed-unique ids.
   */
  uuid(): string {
    const bytes: number[] = [];
    for (let i = 0; i < 16; i++) bytes.push(this.rng.int(0, 255));
    bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
    bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
    const h = bytes.map((b) => b.toString(16).padStart(2, "0"));
    return `${h.slice(0, 4).join("")}-${h.slice(4, 6).join("")}-${h.slice(6, 8).join("")}-${h.slice(8, 10).join("")}-${h.slice(10).join("")}`;
  }
}
