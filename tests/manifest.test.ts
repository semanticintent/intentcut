import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { projectManifestSchema, replaceNarrationSection } from "../src/manifest.js";

const base = {
  version: 1 as const,
  project: {
    title: "Narration test",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    maximumDuration: "20s",
  },
  scenes: [{ id: "opening", type: "image" as const, source: "opening.png", duration: "8s" }],
  output: { file: "renders/preview.mp4", codec: "h264" as const },
};

describe("sectioned narration", () => {
  it("rejects references to unknown scenes", () => {
    expect(() => projectManifestSchema.parse({
      ...base,
      audio: {
        narration: {
          sections: [{ id: "voice", scene: "missing", script: "voice.md" }],
        },
      },
    })).toThrow("unknown scene");
  });

  it("requires a source for human-final narration", () => {
    expect(() => projectManifestSchema.parse({
      ...base,
      audio: {
        narration: {
          sections: [{ id: "voice", scene: "opening", script: "voice.md", mode: "human-final" }],
        },
      },
    })).toThrow("requires a source");
  });

  it("replaces one prototype section without changing the others", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-manifest-"));
    const manifestPath = path.join(directory, "intentcut.yaml");
    await writeFile(manifestPath, `version: 1
project:
  title: Replace test
  resolution: { width: 1920, height: 1080 }
  fps: 30
  maximumDuration: 20s
scenes:
  - { id: opening, type: image, source: opening.png, duration: 8s }
audio:
  narration:
    sections:
      - { id: voice, scene: opening, script: voice.md, mode: synthetic-prototype }
output: { file: renders/preview.mp4, codec: h264 }
`, "utf8");

    await replaceNarrationSection(manifestPath, "voice", "narration/human/voice.wav");
    const updated = await readFile(manifestPath, "utf8");
    expect(updated).toContain("mode: human-final");
    expect(updated).toContain("source: narration/human/voice.wav");
  });

  it("rejects transcript sidecars attached to unknown scenes", () => {
    expect(() => projectManifestSchema.parse({
      ...base,
      inspection: {
        transcripts: [{
          scene: "missing",
          source: "transcripts/missing.vtt",
          provider: "manual",
          provenance: "human",
        }],
      },
    })).toThrow("unknown scene");
  });
});
