import { describe, expect, it } from "vitest";
import { runProcess } from "../src/process.js";

describe("process execution", () => {
  it("kills and rejects a process that exceeds its timeout", async () => {
    const started = Date.now();
    await expect(runProcess(process.execPath, ["-e", "setTimeout(() => {}, 10000)"], { timeoutMilliseconds: 200 })).rejects.toThrow("timed out");
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
