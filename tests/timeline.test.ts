import { describe, expect, it } from "vitest";
import type { MediaInspection } from "../src/inspect.js";
import type { LoadedProject } from "../src/manifest.js";
import { compileTimeline } from "../src/timeline.js";

const project: LoadedProject = {
  manifestPath: "/tmp/intentcut.yaml",
  baseDirectory: "/tmp",
  manifest: {
    version: 1,
    project: {
      title: "Test production",
      resolution: { width: 1920, height: 1080 },
      fps: 30,
      maximumDuration: "30s",
    },
    scenes: [
      { id: "opening", type: "image", source: "opening.png", duration: "5s" },
      {
        id: "demo",
        type: "video",
        source: "demo.mov",
        trim: { in: "2s", out: "22s" },
        speed: 2,
      },
      { id: "closing", type: "image", source: "closing.png", duration: "4s" },
    ],
    output: { file: "renders/preview.mp4", codec: "h264" },
  },
};

const inspections = new Map<string, MediaInspection>([
  ["demo.mov", {
    source: "demo.mov",
    absolutePath: "/tmp/demo.mov",
    durationMilliseconds: 30_000,
  }],
]);

describe("timeline compilation", () => {
  it("resolves trims and speed into deterministic scene positions", () => {
    const timeline = compileTimeline(project, inspections);

    expect(timeline.durationMilliseconds).toBe(19_000);
    expect(timeline.withinMaximumDuration).toBe(true);
    expect(timeline.scenes.map((scene) => ({
      id: scene.id,
      start: scene.startMilliseconds,
      end: scene.endMilliseconds,
    }))).toEqual([
      { id: "opening", start: 0, end: 5_000 },
      { id: "demo", start: 5_000, end: 15_000 },
      { id: "closing", start: 15_000, end: 19_000 },
    ]);
  });

  it("marks a timeline that exceeds the configured maximum", () => {
    const shortened = structuredClone(project);
    shortened.manifest.project.maximumDuration = "18s";

    expect(compileTimeline(shortened, inspections).withinMaximumDuration).toBe(false);
  });

  it("rejects trims beyond the inspected source", () => {
    const invalid = structuredClone(project);
    const video = invalid.manifest.scenes[1];
    if (video?.type === "video") {
      video.trim = { in: "2s", out: "40s" };
    }

    expect(() => compileTimeline(invalid, inspections)).toThrow("exceeds the source duration");
  });
});
