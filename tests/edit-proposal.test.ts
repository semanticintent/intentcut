import { describe, expect, it } from "vitest";
import { createAgentProjectContext } from "../src/agent.js";
import { validateAgentEditProposal } from "../src/edit-proposal.js";
import type { LoadedProject } from "../src/manifest.js";

function project(): LoadedProject {
  return {
    baseDirectory: "/production", manifestPath: "/production/intentcut.yaml",
    manifest: {
      version: 1,
      project: { title: "Proposal", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "3m" },
      scenes: [
        { id: "opening", type: "image", source: "opening.png", duration: "5s" },
        { id: "demo", type: "video", source: "demo.mov", trim: { in: "1s", out: "20s" }, speed: 1 },
      ],
      annotations: [{ id: "existing", at: "2s", duration: "3s", text: "Existing", position: "top-left", tone: "neutral" }],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      audio: { narration: { sections: [{ id: "voice-demo", scene: "demo", script: "Old script.", offset: "0s", mode: "synthetic-prototype" }], generatedDirectory: "narration/generated" }, loudness: { integrated: -16, truePeak: -1.5, range: 7 } },
      output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

function proposal(projectValue: LoadedProject): Record<string, unknown> {
  return {
    kind: "intentcut-edit-proposal", version: 1,
    expectedRevision: createAgentProjectContext(projectValue).project.revision,
    summary: "Tighten the demonstration and clarify the result.",
    operations: [
      { id: "trim-demo", operation: "scene.set-trim", sceneId: "demo", trim: { in: "2s", out: "18s" } },
      { id: "speed-demo", operation: "scene.set-speed", sceneId: "demo", speed: 1.25 },
      { id: "focus-demo", operation: "scene.set-camera", sceneId: "demo", camera: { at: "4s", duration: "5s", transition: "750ms", zoom: 1.2, center: { x: 0.7, y: 0.5 } } },
      { id: "add-note", operation: "annotation.upsert", annotation: { id: "result", at: "10s", duration: "3s", text: "Visible result", position: "bottom-left", tone: "accent" } },
      { id: "rewrite-voice", operation: "narration.set-script", sectionId: "voice-demo", script: "New script." },
      { id: "remove-note", operation: "annotation.remove", annotationId: "existing" },
    ],
    authority: { state: "proposed-only", applied: false },
  };
}

describe("revision-bound agent edit proposals", () => {
  it("validates bounded editorial operations without applying them", () => {
    const current = project();
    const before = JSON.stringify(current.manifest);
    const result = validateAgentEditProposal(current, proposal(current));
    expect(result).toMatchObject({ valid: true, operationCount: 6, issues: [], authority: { state: "validation-only", applied: false, manifestWritten: false } });
    expect(JSON.stringify(current.manifest)).toBe(before);
  });

  it("rejects a stale project revision", () => {
    const current = project();
    const input = { ...proposal(current), expectedRevision: `sha256:${"0".repeat(64)}` };
    expect(validateAgentEditProposal(current, input).issues).toContainEqual(expect.objectContaining({ path: "expectedRevision", message: expect.stringContaining("does not match") }));
  });

  it("rejects video operations against image or unknown scenes", () => {
    const current = project();
    const input = proposal(current);
    input.operations = [
      { id: "trim-image", operation: "scene.set-trim", sceneId: "opening", trim: { in: "1s" } },
      { id: "speed-missing", operation: "scene.set-speed", sceneId: "missing", speed: 2 },
    ];
    const result = validateAgentEditProposal(current, input);
    expect(result.valid).toBe(false);
    expect(result.issues.map((entry) => entry.message)).toEqual(expect.arrayContaining([expect.stringContaining("not a video"), expect.stringContaining("Unknown scene")]));
  });

  it("rejects inverted trims and unknown semantic targets", () => {
    const current = project();
    const input = proposal(current);
    input.operations = [
      { id: "bad-trim", operation: "scene.set-trim", sceneId: "demo", trim: { in: "12s", out: "4s" } },
      { id: "bad-section", operation: "narration.set-script", sectionId: "missing", script: "No." },
      { id: "bad-remove", operation: "annotation.remove", annotationId: "missing" },
    ];
    const result = validateAgentEditProposal(current, input);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(3);
  });

  it("rejects duplicate operation ids", () => {
    const current = project();
    const input = proposal(current);
    input.operations = [
      { id: "same", operation: "scene.set-speed", sceneId: "demo", speed: 1.1 },
      { id: "same", operation: "scene.set-speed", sceneId: "demo", speed: 1.2 },
    ];
    expect(validateAgentEditProposal(current, input).issues).toContainEqual(expect.objectContaining({ path: "operations.1.id", message: expect.stringContaining("Duplicate") }));
  });

  it("rejects undeclared fields and any claim that the proposal is applied", () => {
    const current = project();
    const input = proposal(current);
    input.authority = { state: "proposed-only", applied: true };
    input.operations = [{ id: "source-change", operation: "scene.set-speed", sceneId: "demo", speed: 2, source: "/tmp/replacement.mov" }];
    const result = validateAgentEditProposal(current, input);
    expect(result.valid).toBe(false);
    expect(result.operationCount).toBe(0);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });
});
