import { describe, expect, it } from "vitest";
import type { LoadedProject } from "../src/manifest.js";
import { createRenderPlan } from "../src/render.js";
import type { NarrationPlan } from "../src/narration.js";
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
  annotations: [],
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

  it("positions independent narration sections on the shared timeline", () => {
    const sectioned = structuredClone(project);
    sectioned.manifest.audio = {
      narration: {
        generatedDirectory: "narration/generated",
        sections: [
          { id: "first", scene: "opening", script: "first.md", offset: "0s", mode: "synthetic-prototype" },
          { id: "second", scene: "demo", script: "second.md", offset: "1s", mode: "human-final", source: "second.wav" },
        ],
      },
      loudness: { integrated: -16, truePeak: -1.5, range: 7 },
    };
    const narrationPlan: NarrationPlan = {
      syntheticCount: 1,
      humanCount: 1,
      allFit: true,
      sections: [
        {
          id: "first",
          scene: "opening",
          mode: "synthetic-prototype",
          scriptPath: "/work/demo/first.md",
          audioPath: "/work/demo/narration/generated/first.aiff",
          startMilliseconds: 0,
          capacityMilliseconds: 5_000,
          durationMilliseconds: 3_000,
          fits: true,
        },
        {
          id: "second",
          scene: "demo",
          mode: "human-final",
          scriptPath: "/work/demo/second.md",
          audioPath: "/work/demo/second.wav",
          startMilliseconds: 6_000,
          capacityMilliseconds: 9_000,
          durationMilliseconds: 4_000,
          fits: true,
        },
      ],
    };

    const plan = createRenderPlan(sectioned, timeline, narrationPlan);
    const filterGraph = plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];
    expect(plan.syntheticNarrationSections).toBe(1);
    expect(filterGraph).toContain("adelay=0:all=1[na0]");
    expect(filterGraph).toContain("adelay=6000:all=1[na1]");
    expect(filterGraph).toContain("amix=inputs=2:duration=longest:normalize=0");
  });

  it("compiles bounded camera movement and annotation overlays", () => {
    const visualProject = structuredClone(project);
    const video = visualProject.manifest.scenes[1];
    if (video?.type === "video") {
      video.camera = [{
        at: "1s",
        duration: "3s",
        transition: "500ms",
        zoom: 1.25,
        center: { x: 0.75, y: 0.5 },
      }];
    }
    visualProject.manifest.annotations = [{
      id: "meaning",
      at: "6s",
      duration: "3s",
      text: "Meaning, not pixels",
      position: "bottom-left",
      tone: "accent",
    }];
    const visualTimeline = structuredClone(timeline);
    visualTimeline.annotations = [{
      id: "meaning",
      text: "Meaning, not pixels",
      position: "bottom-left",
      tone: "accent",
      startMilliseconds: 6_000,
      endMilliseconds: 9_000,
    }];

    const plan = createRenderPlan(visualProject, visualTimeline);
    const filterGraph = plan.arguments[plan.arguments.indexOf("-filter_complex") + 1];
    expect(filterGraph).toContain("zoompan");
    expect(filterGraph).toContain("overlay=0:0:enable='between(t,6.000000,9.000000)':shortest=1");
    expect(plan.annotationAssets).toHaveLength(1);
  });
});
