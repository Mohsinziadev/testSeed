# Large Datasets

Generate a lot of data without holding it in memory.

```ts
for (const user of seed.stream(userFactory, { count: 10_000_000 })) {
  /* one record at a time; break to stop */
}

for (const batch of seed.batches(userFactory, { count: 1e6, batchSize: 5000 })) insertMany(batch);

const controller = new AbortController();
for await (const batch of seed.batchesAsync(userFactory, { count: 1e6, signal: controller.signal })) {
  /* yields to the event loop between batches */
}
```

## Guarantees

- Streams produce **exactly the records `generate()` would**, so a streamed run and an in-memory run agree.
- Memory stays flat. On one machine, 500k records used about 16 MB of heap delta streaming against about 131 MB as an array. See [Benchmarks](../docs/BENCHMARKS.md) for the method and caveats.
- Abort is checked between batches.
- Streams are not capped by `limits.maxCount`. In-memory `generate` and `dataset` are.
