import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createCaptionPlan, writeCaptions } from "../src/captions.js";
import type { LoadedProject } from "../src/manifest.js";
import type { NarrationPlan } from "../src/narration.js";

describe("WebVTT captions", () => {
  it("derives portable cues from narration sections", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-captions-"));
    const scriptPath = path.join(directory, "voice.md");
    await writeFile(scriptPath, "Meaning,  not pixels.\n", "utf8");
    const project = {
      baseDirectory: directory,
      manifestPath: path.join(directory, "intentcut.yaml"),
      manifest: {
        version: 1,
        project: { title: "Captions", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "10s" },
        scenes: [{ id: "opening", type: "image", source: "opening.png", duration: "10s" }],
        annotations: [],
        audio: {
          narration: { sections: [{ id: "voice", scene: "opening", script: "voice.md", offset: "0s", mode: "synthetic-prototype" }], generatedDirectory: "generated" },
          loudness: { integrated: -16, truePeak: -1.5, range: 7 },
        },
        output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports", captions: { file: "captions.vtt" } },
      },
    } satisfies LoadedProject;
    const narration: NarrationPlan = {
      syntheticCount: 1,
      humanCount: 0,
      allFit: true,
      sections: [{
        id: "voice",
        scene: "opening",
        mode: "synthetic-prototype",
        scriptPath,
        audioPath: path.join(directory, "voice.aiff"),
        startMilliseconds: 1_250,
        durationMilliseconds: 2_500,
        capacityMilliseconds: 5_000,
        fits: true,
      }],
    };

    const plan = await createCaptionPlan(project, narration);
    expect(plan).toBeDefined();
    if (!plan) return;
    await writeCaptions(plan);
    const output = await readFile(plan.outputPath, "utf8");
    expect(output).toContain("00:00:01.250 --> 00:00:03.750");
    expect(output).toContain("Meaning, not pixels.");
  });
});
