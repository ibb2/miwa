/** Runs `transform` over every value with at most `concurrency` promises in flight. */
export async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await transform(values[index], index);
      }
    }),
  );
  return results;
}

/** Throws an `AbortError` when the signal has fired; call between await steps. */
export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('Operation aborted.');
  error.name = 'AbortError';
  throw error;
}
