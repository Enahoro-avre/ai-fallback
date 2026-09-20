/**
 * Basic example — three providers, first success wins.
 * Run with: npx tsx examples/basic.ts
 */
import { fallback } from "../src/index.js";

async function main() {
  const result = await fallback([
    () => Promise.reject(new Error("simulated OpenAI 429")),
    () => Promise.reject(new Error("simulated Claude overloaded")),
    () => Promise.resolve("Gemini says hi"),
  ]);

  console.log("Result:", result);
}

main();
