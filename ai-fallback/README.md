# ai-fallback

Try multiple LLM providers in order. Falls through on error, rate limit, or timeout — returns the first success.

```bash
npm install @enahoro/ai-fallback
```

## Usage

```ts
import { fallback } from "@enahoro/ai-fallback";

const res = await fallback([
  () => openai.chat.completions.create({ model: "gpt-4o", messages }),
  () => anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1000, messages }),
  () => gemini.generateContent(prompt),
]);
```

## With labels, retries, and timeouts

```ts
import { fallback, retryableOnly } from "@enahoro/ai-fallback";

const res = await fallback(
  [
    { label: "openai", call: () => openai.chat.completions.create({ ... }), retries: 1 },
    { label: "claude", call: () => anthropic.messages.create({ ... }) },
    { label: "gemini", call: () => gemini.generateContent(prompt) },
  ],
  {
    timeoutMs: 15_000,          // per-attempt timeout
    retryDelayMs: 500,          // backoff between retries of the SAME provider
    isRetryable: retryableOnly, // don't fall through on 401/403 — those won't fix themselves
    onFallback: (a) => console.warn(`${a.label} failed, falling back:`, a.error),
    onAttempt: (a) => console.log(`[${a.label}] ${a.ok ? "ok" : "fail"} in ${a.durationMs}ms`),
  }
);
```

## Why

Every multi-provider AI app ends up hand-rolling this exact try/catch chain. This is the
50-line version, typed, tested, with retry + timeout + observability hooks — nothing else.

- **No SDK lock-in.** Pass any async function. Works with OpenAI, Anthropic, Gemini, or
  literally any promise.
- **Per-provider config.** Different retry counts / timeouts per provider if you need it.
- **Fails loud, not silent.** `FallbackError` carries every attempt's error and timing so you
  can actually debug a full outage instead of just seeing "request failed."
- **Zero dependencies.**

## API

### `fallback(providers, options?)`

- `providers`: array of `() => Promise<T>` or `{ call, label?, retries?, timeoutMs? }`
- `options.timeoutMs` — global per-attempt timeout
- `options.retries` — default retries per provider before moving on (default `0`)
- `options.retryDelayMs` — backoff between retries of the same provider (default `300`)
- `options.isRetryable(error)` — return `false` to stop immediately instead of falling through
  (e.g. don't burn your other providers on a `401`)
- `options.onFallback(attempt)` — fires each time a provider is abandoned
- `options.onAttempt(info)` — fires after every attempt, success or failure (hook your cost/latency logger here)

Throws `FallbackError` (with `.attempts`, one entry per exhausted provider) if everything fails.

### `retryableOnly(error)`

Built-in `isRetryable` helper — treats `401`/`403` as non-retryable, everything else
(429s, 5xxs, timeouts, network errors) as fair game to fall through on.

## Development

```bash
npm install
npm test          # runs the suite in test/index.test.ts (node's built-in test runner + tsx)
npm run build     # compiles src/index.ts -> dist/ (cjs + esm + .d.ts)
npx tsx examples/basic.ts
npx tsx examples/with-options.ts
```

10 tests cover: basic success, single/multi-hop fallback, `FallbackError` shape, per-provider
retries, timeouts, the `isRetryable` short-circuit, the built-in `retryableOnly` classifier,
the `onAttempt`/`onFallback` hooks, and the empty-providers guard.

## Publishing

```bash
npm login
npm publish          # prepublishOnly runs build + test automatically
```

Published as a scoped package (`@enahoro/ai-fallback`) so the name is guaranteed available —
`publishConfig.access` is already set to `"public"` in `package.json`, so a plain `npm publish`
publishes it publicly rather than defaulting to a private (paid) scoped package.

This repo also ships two GitHub Actions workflows:
- `.github/workflows/ci.yml` — runs the test suite on Node 18/20/22 on every push and PR
- `.github/workflows/publish.yml` — publishes to npm automatically when you push a `v*` tag
  (set an `NPM_TOKEN` secret in the repo settings first)

## License

MIT
