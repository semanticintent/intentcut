import { describe, expect, it } from "vitest";
import { createContactSheetPlans } from "../src/analyze.js";
import type { MediaInspection } from "../src/inspect.js";
import type { LoadedProject } from "../src/manifest.js";
import type { TimelinePlan } from "../src/timeline.js";

describe("source analysis planning", () => {
  it("samples the declared source range at deterministic midpoints", () => {
    const project = {
      baseDirectory: "/production",
      manifestPath: "/production/intentcut.yaml",
      manifest: {
        version: 1,
        project: { title: "Analyze", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "20s" },
        scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", trim: { in: "2s", out: "10s" }, speed: 1 }],
        annotations: [],
        inspection: { contactSheets: { samples: 4, columns: 2, frameWidth: 480 } },
        output: { file: "renders/preview.mp4", codec: "h264", reportDirectory: "reports" },
      },
    } satisfies LoadedProject;
    const inspection: MediaInspection = {
      source: "recordings/demo.mov",
      absolutePath: "/production/recordings/demo.mov",
      durationMilliseconds: 12_000,
      video: { width: 1920, height: 1080 },
    };
    const timeline: TimelinePlan = {
      title: "Analyze",
      durationMilliseconds: 8_000,
      maximumDurationMilliseconds: 20_000,
      withinMaximumDuration: true,
      output: { width: 1920, height: 1080, fps: 30 },
      annotations: [],
      scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", startMilliseconds: 0, endMilliseconds: 8_000, durationMilliseconds: 8_000, sourceDurationMilliseconds: 8_000, speed: 1 }],
    };

    const plans = createContactSheetPlans(project, timeline, new Map([[inspection.source, inspection]]));
    expect(plans).toHaveLength(1);
    expect(plans[0]?.sampleTimesMilliseconds).toEqual([3_000, 5_000, 7_000, 9_000]);
    expect(plans[0]).toMatchObject({ columns: 2, rows: 2, frameWidth: 480, frameHeight: 270 });
  });
});
