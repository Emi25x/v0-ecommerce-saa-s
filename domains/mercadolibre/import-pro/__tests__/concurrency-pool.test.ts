import { describe, it, expect } from "vitest"
import { runPool } from "../application/concurrency-pool"

describe("runPool", () => {
  it("runs all tasks and returns results", async () => {
    const tasks = [() => Promise.resolve(1), () => Promise.resolve(2), () => Promise.resolve(3)]
    const results = await runPool(tasks, 2)

    expect(results).toHaveLength(3)
    expect(results.every((r) => r.status === "fulfilled")).toBe(true)
    expect(results.map((r) => (r as PromiseFulfilledResult<number>).value)).toEqual([1, 2, 3])
  })

  it("handles rejected tasks without breaking others", async () => {
    const tasks = [
      () => Promise.resolve("ok"),
      () => Promise.reject(new Error("fail")),
      () => Promise.resolve("also ok"),
    ]
    const results = await runPool(tasks, 2)

    expect(results[0].status).toBe("fulfilled")
    expect(results[1].status).toBe("rejected")
    expect(results[2].status).toBe("fulfilled")
  })

  it("respects concurrency limit", async () => {
    let running = 0
    let maxConcurrent = 0

    const tasks = Array.from({ length: 10 }, () => async () => {
      running++
      maxConcurrent = Math.max(maxConcurrent, running)
      await new Promise((r) => setTimeout(r, 10))
      running--
      return maxConcurrent
    })

    await runPool(tasks, 3)
    expect(maxConcurrent).toBeLessThanOrEqual(3)
  })

  it("works with empty task list", async () => {
    const results = await runPool([], 5)
    expect(results).toHaveLength(0)
  })

  it("works with concurrency=1 (sequential)", async () => {
    const order: number[] = []
    const tasks = [1, 2, 3].map((n) => async () => {
      order.push(n)
      return n
    })

    await runPool(tasks, 1)
    expect(order).toEqual([1, 2, 3])
  })
})
