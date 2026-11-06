/**
 * Run `worker` over `items` with at most `limit` in flight.
 * Results are returned in input order; `onResult` fires as each item completes
 * (completion order) — use it for incremental checkpointing / progress.
 */
export async function mapPool<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
  onResult?: (result: R, item: T, index: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      const r = await worker(items[i], i);
      results[i] = r;
      onResult?.(r, items[i], i);
    }
  });
  await Promise.all(runners);
  return results;
}
