/**
 * ai-fallback
 * Try multiple LLM (or any async) providers in order.
 * Falls through to the next one on error, timeout, or rate limit.
 */

export interface ProviderAttempt {
  index: number;
  label?: string;
  error: unknown;
  durationMs: number;
}

export class FallbackError extends Error {
  attempts: ProviderAttempt[];
  constructor(attempts: ProviderAttempt[]) {
    const summary = attempts
      .map((a) => `  [${a.index}]${a.label ? ` ${a.label}` : ""}: ${errMessage(a.error)}`)
      .join("\n");
    super(`All ${attempts.length} provider(s) failed:\n${summary}`);
    this.name = "FallbackError";
    this.attempts = attempts;
  }
}

export interface Provider<T> {
  /** The call itself. */
  call: () => Promise<T>;
  /** Optional label for logging (e.g. "openai", "claude"). */
  label?: string;
  /** Per-provider retry count before falling through. Default: 0. */
  retries?: number;
  /** Per-provider timeout in ms. Overrides the global timeoutMs. */
  timeoutMs?: number;
}

export type ProviderInput<T> = (() => Promise<T>) | Provider<T>;

export interface FallbackOptions {
  /** Global timeout per attempt, in ms. Default: no timeout. */
  timeoutMs?: number;
  /** Default retries per provider before moving to the next. Default: 0. */
  retries?: number;
  /** Backoff between retries of the SAME provider, in ms. Default: 300. */
  retryDelayMs?: number;
  /** Decide whether an error should trigger a fallback at all.
   *  Return false to stop immediately and throw (e.g. on auth errors
   *  you don't want to silently swallow). Default: always true. */
  isRetryable?: (error: unknown) => boolean;
  /** Called every time a provider fails, before moving to the next one. */
  onFallback?: (attempt: ProviderAttempt) => void;
  /** Called after every attempt (success or failure) — useful for cost/latency logging. */
  onAttempt?: (info: { index: number; label?: string; ok: boolean; durationMs: number }) => void;
}

function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

function normalize<T>(p: ProviderInput<T>): Provider<T> {
  return typeof p === "function" ? { call: p } : p;
}

function withTimeout<T>(promise: Promise<T>, ms?: number): Promise<T> {
  if (!ms) return promise;
  return new Promise<T>((resolve, reject) => {
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try each provider in order. Returns the first successful result.
 * Throws FallbackError (with per-provider details) if all fail.
 */
export async function fallback<T>(
  providers: ProviderInput<T>[],
  options: FallbackOptions = {}
): Promise<T> {
  const {
    timeoutMs,
    retries = 0,
    retryDelayMs = 300,
    isRetryable = () => true,
    onFallback,
    onAttempt,
  } = options;

  if (providers.length === 0) {
    throw new Error("ai-fallback: providers array is empty");
  }

  const attempts: ProviderAttempt[] = [];

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
          durationMs: Date.now() - start,
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

        const record: ProviderAttempt = { index: i, label: provider.label, error, durationMs };
        attempts.push(record);
        onFallback?.(record);
      }
    }
  }

  throw new FallbackError(attempts);
}

/** Common isRetryable helper: only fall through on rate limits / timeouts / 5xx, not on auth errors. */
export function retryableOnly(error: unknown): boolean {
  const status =
    (error as any)?.status ?? (error as any)?.response?.status ?? (error as any)?.statusCode;
  if (status === 401 || status === 403) return false; // don't burn other providers on bad auth
  return true;
}

export default fallback;
