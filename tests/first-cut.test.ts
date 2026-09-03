import { describe, expect, it } from "vitest";
import { createFirstCutProposal } from "../src/first-cut.js";
import type { SourceAnalysisReport } from "../src/analyze.js";

describe("first-cut proposals", () => {
  it("combines visual, silence, and transcript evidence without applying edits", () => {
    const report: SourceAnalysisReport = {
      project: "Proposal",
      generatedAt: "2026-09-03T00:00:00.000Z",
      contactSheets: [{
        sceneId: "demo", source: "demo.mov", outputPath: "sheet.jpg",
        sourceStartMilliseconds: 2_000, sourceEndMilliseconds: 12_000,
        sampleTimesMilliseconds: [3_000], columns: 1, rows: 1, frameWidth: 480, frameHeight: 270,
      }],
      cutCandidates: [{ sceneId: "demo", source: "demo.mov", sourceTimeMilliseconds: 7_000, confidence: 0.42 }],
      audio: [{ sceneId: "demo", source: "demo.mov", status: "analyzed", silenceRegions: [{
        sourceStartMilliseconds: 8_000, sourceEndMilliseconds: 10_000, durationMilliseconds: 2_000,
      }] }],
      transcripts: [{ sceneId: "demo", source: "demo.vtt", provider: "whisper.cpp", model: "base.en", provenance: "local-model", cues: [
        { startMilliseconds: 3_000, endMilliseconds: 5_000, text: "Introduce the system." },
        { startMilliseconds: 7_500, endMilliseconds: 9_000, text: "Show the result." },
      ] }],
    };

    const proposal = createFirstCutProposal(report);
    expect(proposal.authority).toEqual({ state: "proposed-only", applied: false });
    expect(proposal.scenes[0]?.segments).toEqual([
      expect.objectContaining({ id: "demo-01", sourceIn: "00:02.000", sourceOut: "00:07.000", transcriptCueCount: 1, disposition: "keep" }),
      expect.objectContaining({ id: "demo-02", sourceIn: "00:07.000", sourceOut: "00:12.000", transcriptCueCount: 1, confidence: 0.42, disposition: "keep" }),
    ]);
    expect(proposal.scenes[0]?.reviewActions).toEqual([
      expect.objectContaining({ id: "demo-transition-01", type: "review-transition", status: "pending" }),
      expect.objectContaining({ id: "demo-silence-01", type: "consider-remove-silence", status: "pending" }),
    ]);
  });

  it("is deterministic across analysis timestamps", () => {
    const base: SourceAnalysisReport = {
      project: "Stable", generatedAt: "first", cutCandidates: [], audio: [], transcripts: [],
      contactSheets: [{ sceneId: "demo", source: "demo.mov", outputPath: "sheet.jpg", sourceStartMilliseconds: 0, sourceEndMilliseconds: 1_000, sampleTimesMilliseconds: [], columns: 1, rows: 1, frameWidth: 480, frameHeight: 270 }],
    };
    expect(createFirstCutProposal(base)).toEqual(createFirstCutProposal({ ...base, generatedAt: "second" }));
  });
});
