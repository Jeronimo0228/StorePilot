import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { logger } from "../src/utils/logger.js";

describe("logger", () => {
  it("formats Error objects with their message instead of {}", () => {
    const original = process.stderr.write.bind(process.stderr);
    let out = "";
    process.stderr.write = ((chunk: string) => {
      out += chunk;
      return true;
    }) as typeof process.stderr.write;
    try {
      logger.error("Fatal error", new Error("boom"));
    } finally {
      process.stderr.write = original;
    }
    assert.match(out, /\[ERROR\] Fatal error: boom/);
    assert.doesNotMatch(out, /\{\}/);
  });
});
