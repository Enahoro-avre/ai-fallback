import { test } from "node:test";
import assert from "node:assert/strict";
import { fallback, FallbackError, retryableOnly } from "../src/index.js";

test("returns result from first provider on success", async () => {
  const result = await fallback([
    () => Promise.resolve("from A"),
    () => Promise.resolve("from B"),
  ]);
  assert.equal(result, "from A");
});

test("falls through to next provider on rejection", async () => {
  const result = await fallback([
    () => Promise.reject(new Error("rate limited")),
    () => Promise.resolve("from B"),
  ]);
  assert.equal(result, "from B");
});

test("falls through across three providers", async () => {
  const order: string[] = [];
  const result = await fallback([
    { label: "a", call: () => { order.push("a"); return Promise.reject(new Error("down")); } },
    { label: "b", call: () => { order.push("b"); return Promise.reject(new Error("down")); } },
    { label: "c", call: () => { order.push("c"); return Promise.resolve("from C"); } },
  ]);
  assert.equal(result, "from C");
  assert.deepEqual(order, ["a", "b", "c"]);
});

test("throws FallbackError with one attempt per provider when all fail", async () => {
  await assert.rejects(
    fallback([
      { label: "openai", call: () => Promise.reject(new Error("429")) },
      { label: "claude", call: () => Promise.reject(new Error("503")) },
    ]),
    (err: unknown) => {
      assert.ok(err instanceof FallbackError);
      assert.equal(err.attempts.length, 2);
      assert.equal(err.attempts[0].label, "openai");
      assert.equal(err.attempts[1].label, "claude");
      return true;
    }
  );
});

test("respects per-provider retries before falling through", async () => {
  let calls = 0;
  const result = await fallback(
    [
      {
        label: "flaky",
        retries: 2,
        call: () => {
          calls++;
          return calls < 3 ? Promise.reject(new Error("transient")) : Promise.resolve("recovered");
        },
      },
    ],
    { retryDelayMs: 1 }
  );
  assert.equal(result, "recovered");
  assert.equal(calls, 3);
});

test("timeoutMs triggers fallback to next provider", async () => {
  const result = await fallback(
    [
      () => new Promise((resolve) => setTimeout(() => resolve("too slow"), 200)),
      () => Promise.resolve("fast"),
    ],
    { timeoutMs: 20 }
  );
  assert.equal(result, "fast");
});

test("isRetryable=false stops immediately instead of falling through", async () => {
  let secondCalled = false;
  await assert.rejects(
    fallback(
      [
        () => Promise.reject(Object.assign(new Error("bad key"), { status: 401 })),
        () => {
          secondCalled = true;
          return Promise.resolve("never reached");
        },
      ],
      { isRetryable: retryableOnly }
    ),
    /bad key/
  );
  assert.equal(secondCalled, false);
});

test("retryableOnly treats 429 as retryable, 401/403 as not", () => {
  assert.equal(retryableOnly({ status: 429 }), true);
  assert.equal(retryableOnly({ status: 401 }), false);
  assert.equal(retryableOnly({ status: 403 }), false);
  assert.equal(retryableOnly(new Error("network blip")), true);
});

test("onAttempt and onFallback hooks fire with correct data", async () => {
  const attempts: boolean[] = [];
  const fallbacks: string[] = [];
  await fallback(
    [
      { label: "a", call: () => Promise.reject(new Error("down")) },
      { label: "b", call: () => Promise.resolve("ok") },
    ],
    {
      onAttempt: (info) => attempts.push(info.ok),
      onFallback: (a) => fallbacks.push(a.label ?? "?"),
    }
  );
  assert.deepEqual(attempts, [false, true]);
  assert.deepEqual(fallbacks, ["a"]);
});

test("throws immediately on empty providers array", async () => {
  await assert.rejects(fallback([]), /empty/);
});
