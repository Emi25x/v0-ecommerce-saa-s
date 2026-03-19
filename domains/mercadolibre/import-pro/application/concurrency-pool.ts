/**
 * Bounded concurrency pool
 *
 * Runs async tasks with a configurable concurrency limit.
 * Reusable utility — no domain/infrastructure dependencies.
 */

export async function runPool<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try {
        results[i] = { status: "fulfilled", value: await tasks[i]() }
      } catch (e: unknown) {
        results[i] = { status: "rejected", reason: e }
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, worker))
  return results
}
