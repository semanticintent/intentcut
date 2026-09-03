import { describe, expect, it } from "vitest";
import { createCaptureBrief } from "../src/brief.js";
import type { LoadedProject } from "../src/manifest.js";

describe("capture briefs", () => {
  it("compiles configured takes without granting recording control", () => {
    const project = {
      baseDirectory: "/production", manifestPath: "/production/intentcut.yaml",
      manifest: {
        version: 1,
        project: { title: "Capture", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "30s" },
        scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", speed: 1 }],
        annotations: [],
        inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
        capture: { preflight: ["Hide notifications."], takes: [{ scene: "demo", objective: "Show the result.", startState: "Workspace empty.", actions: ["Create proposal."], visibleProof: ["Validated preview visible."], endState: "Preview remains visible.", privacyNotes: ["Use sample data."] }] },
        output: { file: "renders/preview.mp4", codec: "h264", reportDirectory: "reports" },
      },
    } satisfies LoadedProject;
    const brief = createCaptureBrief(project);
    expect(brief.authority).toEqual({ state: "brief-only", recordingControl: "manual" });
    expect(brief.preflight).toEqual([{ text: "Hide notifications.", status: "pending" }]);
    expect(brief.takes[0]).toMatchObject({ filename: "recordings/demo.mov", objective: "Show the result.", actions: ["Create proposal."] });
  });

  it("creates a safe placeholder take when capture intent is not declared", () => {
    const project = {
      baseDirectory: "/production", manifestPath: "/production/intentcut.yaml",
      manifest: {
        version: 1,
        project: { title: "Fallback", resolution: { width: 1280, height: 720 }, fps: 30, maximumDuration: "30s" },
        scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", speed: 1 }], annotations: [],
        inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
        output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
      },
    } satisfies LoadedProject;
    expect(createCaptureBrief(project).takes[0]?.startState).toContain("Declare the exact starting state");
  });
});
