import { describe, expect, it } from "vitest";
import { formatDuration, parseDuration } from "../src/duration.js";

describe("duration", () => {
  it("parses milliseconds, seconds, and minutes", () => {
    expect(parseDuration("500ms")).toBe(500);
    expect(parseDuration("4s")).toBe(4_000);
    expect(parseDuration("2.5m")).toBe(150_000);
  });

  it("rejects ambiguous values", () => {
    expect(() => parseDuration("12")).toThrow("Invalid duration");
    expect(() => parseDuration("one minute")).toThrow("Invalid duration");
  });

  it("formats timeline timestamps", () => {
    expect(formatDuration(172_000)).toBe("02:52.000");
    expect(formatDuration(1_234)).toBe("00:01.234");
    expect(formatDuration(-1_234)).toBe("-00:01.234");
  });
});
