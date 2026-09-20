/**
 * ai-fallback
 * Try multiple LLM (or any async) providers in order.
 * Falls through to the next one on error, timeout, or rate limit.
 */
interface ProviderAttempt {
    index: number;
    label?: string;
    error: unknown;
    durationMs: number;
}
declare class FallbackError extends Error {
    attempts: ProviderAttempt[];
    constructor(attempts: ProviderAttempt[]);
}
interface Provider<T> {
    /** The call itself. */
    call: () => Promise<T>;
    /** Optional label for logging (e.g. "openai", "claude"). */
    label?: string;
    /** Per-provider retry count before falling through. Default: 0. */
    retries?: number;
    /** Per-provider timeout in ms. Overrides the global timeoutMs. */
    timeoutMs?: number;
}
type ProviderInput<T> = (() => Promise<T>) | Provider<T>;
interface FallbackOptions {
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
    onAttempt?: (info: {
        index: number;
        label?: string;
        ok: boolean;
        durationMs: number;
    }) => void;
}
/**
 * Try each provider in order. Returns the first successful result.
 * Throws FallbackError (with per-provider details) if all fail.
 */
declare function fallback<T>(providers: ProviderInput<T>[], options?: FallbackOptions): Promise<T>;
/** Common isRetryable helper: only fall through on rate limits / timeouts / 5xx, not on auth errors. */
declare function retryableOnly(error: unknown): boolean;

export { FallbackError, type FallbackOptions, type Provider, type ProviderAttempt, type ProviderInput, fallback as default, fallback, retryableOnly };
