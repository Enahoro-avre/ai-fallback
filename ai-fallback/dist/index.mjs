// src/index.ts
var FallbackError = class extends Error {
  constructor(attempts) {
    const summary = attempts.map((a) => `  [${a.index}]${a.label ? ` ${a.label}` : ""}: ${errMessage(a.error)}`).join("\n");
    super(`All ${attempts.length} provider(s) failed:
${summary}`);
    this.name = "FallbackError";
    this.attempts = attempts;
  }
};
function errMessage(e) {
  if (e instanceof Error) return e.message;
  return String(e);
}
function normalize(p) {
  return typeof p === "function" ? { call: p } : p;
}
function withTimeout(promise, ms) {
  if (!ms) return promise;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function fallback(providers, options = {}) {
  const {
    timeoutMs,
    retries = 0,
    retryDelayMs = 300,
    isRetryable = () => true,
    onFallback,
    onAttempt
  } = options;
  if (providers.length === 0) {
    throw new Error("ai-fallback: providers array is empty");
  }
  const attempts = [];
  for (let i = 0; i < providers.length; i++) {
    const provider = normalize(providers[i]);
    const maxRetries = provider.retries ?? retries;
    const effectiveTimeout = provider.timeoutMs ?? timeoutMs;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const start = Date.now();
      try {
        const result = await withTimeout(provider.call(), effectiveTimeout);
        onAttempt?.({
          index: i,
          label: provider.label,
          ok: true,
          durationMs: Date.now() - start
        });
        return result;
      } catch (error) {
        const durationMs = Date.now() - start;
        onAttempt?.({ index: i, label: provider.label, ok: false, durationMs });
        if (!isRetryable(error)) {
          throw error;
        }
        const isLastRetryForThisProvider = attempt === maxRetries;
        if (!isLastRetryForThisProvider) {
          if (retryDelayMs) await sleep(retryDelayMs);
          continue;
        }
        const record = { index: i, label: provider.label, error, durationMs };
        attempts.push(record);
        onFallback?.(record);
      }
    }
  }
  throw new FallbackError(attempts);
}
function retryableOnly(error) {
  const status = error?.status ?? error?.response?.status ?? error?.statusCode;
  if (status === 401 || status === 403) return false;
  return true;
}
var index_default = fallback;
export {
  FallbackError,
  index_default as default,
  fallback,
  retryableOnly
};
