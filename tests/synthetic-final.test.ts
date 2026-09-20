import { describe, expect, it } from "vitest";
import { projectManifestSchema } from "../src/manifest.js";

const base = {
  version: 1 as const,
  project: {
    title: "Voice",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    maximumDuration: "2m",
  },
  scenes: [{ id: "opening", type: "image" as const, source: "opening.png", duration: "8s" }],
  output: { file: "renders/preview.mp4", codec: "h264" as const },
};

const sectioned = (sections: unknown[], synthesis?: unknown) => projectManifestSchema.parse({
  ...base,
  audio: { narration: { sections, ...(synthesis ? { synthesis } : {}) } },
});

describe("declaring a synthesised final voice", () => {
  it("accepts a section that ships a declared voice", () => {
    const manifest = sectioned(
      [{ id: "opening", scene: "opening", script: "opening.md", mode: "synthetic-final" }],
      { provider: "say", model: "macos-say", voice: "Samantha" },
    );
    const narration = manifest.audio?.narration;
    expect(narration && "sections" in narration && narration.sections[0]?.mode).toBe("synthetic-final");
    expect(narration && "sections" in narration && narration.synthesis?.provider).toBe("say");
  });

  it("refuses to ship a synthesised voice that was never declared", () => {
    expect(() => sectioned([
      { id: "opening", scene: "opening", script: "opening.md", mode: "synthetic-final" },
    ])).toThrow("requires declaring it");
  });

  it("still allows an undeclared prototype, which a final render refuses separately", () => {
    expect(() => sectioned([
      { id: "opening", scene: "opening", script: "opening.md", mode: "synthetic-prototype" },
    ])).not.toThrow();
  });

  it("applies the same rule to a single narration track", () => {
    expect(() => projectManifestSchema.parse({
      ...base,
      audio: { narration: { source: "voice.wav", mode: "synthetic-final" } },
    })).toThrow("requires declaring it");
    expect(() => projectManifestSchema.parse({
      ...base,
      audio: { narration: { source: "voice.wav", mode: "synthetic-final", synthesis: { provider: "kokoro" } } },
    })).not.toThrow();
  });

  it("does not require a declaration for a human voice", () => {
    expect(() => sectioned([
      { id: "opening", scene: "opening", script: "opening.md", mode: "human-final", source: "human/opening.wav" },
    ])).not.toThrow();
  });
});
