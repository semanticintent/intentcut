import { describe, expect, it } from "vitest";
import { createAgentProjectContext } from "../src/agent.js";
import type { LoadedProject } from "../src/manifest.js";

function project(title = "Agent Context"): LoadedProject {
  return {
    baseDirectory: "/production",
    manifestPath: "/production/intentcut.yaml",
    manifest: {
      version: 1,
      project: { title, resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "3m" },
      scenes: [
        { id: "opening", type: "image", source: "assets/opening.png", duration: "5s" },
        { id: "demo", type: "video", source: "recordings/demo.mov", speed: 1 },
      ],
      annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      capture: { preflight: [], takes: [{ scene: "demo", objective: "Show it.", startState: "Ready.", actions: ["Act."], visibleProof: ["Visible."], endState: "Done.", privacyNotes: [] }] },
      audio: { narration: { sections: [{ id: "voice-demo", scene: "demo", script: "Show the result.", offset: "0s", mode: "synthetic-prototype" }], generatedDirectory: "narration/generated" }, loudness: { integrated: -16, truePeak: -1.5, range: 7 } },
      output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

describe("bounded agent context", () => {
  it("exposes semantic project structure without absolute local paths", () => {
    const context = createAgentProjectContext(project());
    expect(context.kind).toBe("intentcut-agent-context");
    expect(context.scenes).toEqual([
      { id: "opening", type: "image", source: "assets/opening.png", captureDeclared: false, narrationSections: [] },
      { id: "demo", type: "video", source: "recordings/demo.mov", captureDeclared: true, narrationSections: ["voice-demo"] },
    ]);
    expect(JSON.stringify(context)).not.toContain("/production");
  });

  it("allows proposals while keeping execution and consequence unavailable", () => {
    const context = createAgentProjectContext(project());
    expect(context.authority).toEqual({
      state: "read-only", manifestWrites: false, recordingControl: false,
      ingestionControl: false, renderingControl: false,
      approval: "human-only", release: "human-only",
    });
    expect(context.capabilities.find((capability) => capability.name === "edit.propose")?.availability).toBe("available");
    expect(context.capabilities.filter((capability) => capability.effect === "execute" || capability.effect === "consequential").every((capability) => capability.availability !== "available")).toBe(true);
  });

  it("creates a stable revision for the same validated manifest", () => {
    expect(createAgentProjectContext(project()).project.revision).toBe(createAgentProjectContext(project()).project.revision);
    expect(createAgentProjectContext(project()).project.revision).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("changes the revision when project intent changes", () => {
    expect(createAgentProjectContext(project("One")).project.revision).not.toBe(createAgentProjectContext(project("Two")).project.revision);
  });
});
