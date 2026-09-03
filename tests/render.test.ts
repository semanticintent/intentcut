import { describe, expect, it } from "vitest";
import type { LoadedProject } from "../src/manifest.js";
import { createRenderPlan } from "../src/render.js";
import type { TimelinePlan } from "../src/timeline.js";

const project: LoadedProject = {
  manifestPath: "/work/demo/intentcut.yaml",
  baseDirectory: "/work/demo",
  manifest: {
    version: 1,
    project: {
      title: "Render test",
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      maximumDuration: "30s",
    },
    scenes: [
      {
        id: "opening",
        type: "image",
        source: "opening.png",
        duration: "5s",
        motion: { type: "push-in", from: 1, to: 1.05 },
      },
      {
        id: "demo",
        type: "video",
        source: "demo.mov",
        trim: { in: "2s", out: "22s" },
        speed: 2,
      },
    ],
    audio: {
      narration: { source: "narration.wav", mode: "human-final" },
      loudness: { integrated: -16, truePeak: -1.5, range: 7 },
    },
    output: {
      file: "renders/preview.mp4",
      codec: "h264",
      reportDirectory: "reports",
    },
  },
};

const timeline: TimelinePlan = {
  title: "Render test",
  durationMilliseconds: 15_000,
  maximumDurationMilliseconds: 30_000,
  withinMaximumDuration: true,
  canvas: { width: 1920, height: 1080, fps: 30 },
  scenes: [
    {
      id: "opening",
      type: "image",
      source: "opening.png",
      startMilliseconds: 0,
      endMilliseconds: 5_000,
      durationMilliseconds: 5_000,
      speed: 1,
    },
    {
      id: "demo",
      type: "video",
      source: "demo.mov",
      startMilliseconds: 5_000,
      endMilliseconds: 15_000,
      durationMilliseconds: 10_000,
      speed: 2,
    },
  ],
};

describe("render planning", () => {
  it("creates a reproducible FFmpeg graph from editorial intent", () => {
    const plan = createRenderPlan(project, timeline);
    const filterGraph = plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];

    expect(plan.outputPath).toBe("/work/demo/renders/preview.mp4");
    expect(plan.narrationMode).toBe("human-final");
    expect(filterGraph).toContain("zoompan");
    expect(filterGraph).toContain("setpts=(PTS-STARTPTS)/2");
    expect(filterGraph).toContain("concat=n=2:v=1:a=0");
    expect(filterGraph).toContain("loudnorm=I=-16:TP=-1.5:LRA=7");
  });
});
