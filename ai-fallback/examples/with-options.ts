/**
 * Realistic example — real provider shape, retries, timeout, and logging hooks.
 * Swap the fake `callOpenAI` / `callClaude` / `callGemini` for your actual SDK calls.
 * Run with: npx tsx examples/with-options.ts
 */
import { fallback, retryableOnly } from "../src/index.js";

// Stand-ins for real SDK calls, e.g.:
//   () => openai.chat.completions.create({ model: "gpt-4o", messages })
//   () => anthropic.messages.create({ model: "claude-sonnet-4-6", max_tokens: 1000, messages })
//   () => gemini.generateContent(prompt)
async function callOpenAI(): Promise<string> {
  throw Object.assign(new Error("rate limited"), { status: 429 });
}
async function callClaude(): Promise<string> {
  return "Response from Claude";
}
async function callGemini(): Promise<string> {
  return "Response from Gemini";
}

async function main() {
  const result = await fallback(
    [
      { label: "openai", call: callOpenAI, retries: 1 },
      { label: "claude", call: callClaude },
      { label: "gemini", call: callGemini },
    ],
    {
      timeoutMs: 15_000,
      retryDelayMs: 500,
      isRetryable: retryableOnly, // don't fall through on 401/403 — a bad key won't fix itself
      onFallback: (a) => console.warn(`[fallback] ${a.label} failed after ${a.durationMs}ms:`, (a.error as Error).message),
      onAttempt: (a) => console.log(`[attempt] ${a.label} ${a.ok ? "ok" : "fail"} in ${a.durationMs}ms`),
    }
  );

  console.log("Final result:", result);
}

main();
