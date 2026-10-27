import { ConfigError } from "../errors.js";

export interface StreamOptions {
  /** Number of records to produce. Must be a non-negative safe integer. */
  readonly count: number;
  /** Index of the first record. Default 0. Streams are pure: the same `start` yields the same records. */
  readonly start?: number;
}
export interface BatchOptions extends StreamOptions {
  /** Records per batch. Default 1000. */
  readonly batchSize?: number;
}
export interface AsyncBatchOptions extends BatchOptions {
  /** Abort between batches; the iterator then throws `signal.reason`. */
  readonly signal?: AbortSignal;
}

function nonNeg(name: string, value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new ConfigError(`${name} must be a non-negative safe integer (got ${value})`, { constraint: name });
  return value;
}

function plan(options: BatchOptions): { count: number; start: number; batchSize: number } {
  const count = nonNeg("count", options.count);
  const start = nonNeg("start", options.start ?? 0);
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1)
    throw new ConfigError(`batchSize must be an integer >= 1 (got ${batchSize})`, { constraint: "batchSize" });
  if (start + count > Number.MAX_SAFE_INTEGER)
    throw new ConfigError("start + count exceeds Number.MAX_SAFE_INTEGER", { constraint: "count" });
  return { count, start, batchSize };
}

/** One record at a time. Nothing is retained, so memory stays flat regardless of `count`. Stop early with `break`. */
export function* iterate<T>(options: StreamOptions, build: (index: number) => T): Generator<T, void, undefined> {
  const { count, start } = plan(options);
  for (let i = 0; i < count; i++) yield build(start + i);
}

/** Arrays of up to `batchSize` records. Memory is bounded by one batch. */
export function* batches<T>(options: BatchOptions, build: (index: number) => T): Generator<T[], void, undefined> {
  const { count, start, batchSize } = plan(options);
  for (let offset = 0; offset < count; offset += batchSize) {
    const size = Math.min(batchSize, count - offset);
    const batch: T[] = new Array<T>(size);
    for (let i = 0; i < size; i++) batch[i] = build(start + offset + i);
    yield batch;
  }
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Like `batches`, but yields to the event loop between batches and honours an `AbortSignal`.
 * Abort is checked before each batch: a batch already being built is completed, the next is not started.
 */
export async function* batchesAsync<T>(options: AsyncBatchOptions, build: (index: number) => T): AsyncGenerator<T[], void, undefined> {
  const { count, start, batchSize } = plan(options);
  const { signal } = options;
  for (let offset = 0; offset < count; offset += batchSize) {
    signal?.throwIfAborted();
    const size = Math.min(batchSize, count - offset);
    const batch: T[] = new Array<T>(size);
    for (let i = 0; i < size; i++) batch[i] = build(start + offset + i);
    yield batch;
    await tick();
  }
  signal?.throwIfAborted();
}
