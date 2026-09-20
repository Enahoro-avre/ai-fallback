"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  FallbackError: () => FallbackError,
  default: () => index_default,
  fallback: () => fallback,
  retryableOnly: () => retryableOnly
});
module.exports = __toCommonJS(index_exports);
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FallbackError,
  fallback,
  retryableOnly
});
