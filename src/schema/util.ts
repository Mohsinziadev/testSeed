export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

export function kindOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

/** Length in Unicode code points (matches JSON Schema's minLength/maxLength semantics). */
export function codePointLength(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // A high surrogate followed by a low surrogate is one code point.
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) i++;
    }
    n++;
  }
  return n;
}

/** Order-independent structural key used for uniqueness checks. */
export function canonicalKey(value: unknown): string {
  if (value instanceof Date) return `d:${value.getTime()}`;
  if (Array.isArray(value)) return `[${value.map(canonicalKey).join(",")}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonicalKey(value[k])}`)
      .join(",")}}`;
  }
  if (typeof value === "number" && Object.is(value, -0)) return "n:-0";
  return `${typeof value}:${String(value)}`;
}

/** Smallest double strictly greater than `x` (finite inputs). */
export function nextUp(x: number): number {
  if (x === 0) return Number.MIN_VALUE;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x);
  let bits = view.getBigUint64(0);
  bits += x > 0 ? 1n : -1n;
  view.setBigUint64(0, bits);
  return view.getFloat64(0);
}

/** Largest double strictly less than `x` (finite inputs). */
export function nextDown(x: number): number {
  return -nextUp(-x);
}
