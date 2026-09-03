import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { stringify } from "yaml";
import type { SourceAnalysisReport, TranscriptCue } from "./analyze.js";
import { formatDuration } from "./duration.js";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";

export interface FirstCutSegment {
  id: string;
  sourceIn: string;
  sourceOut: string;
  disposition: "keep";
  beginsAfter: "source-start" | "visual-transition";
  confidence?: number;
  transcriptCueCount: number;
  transcriptExcerpt?: string;
}

export interface FirstCutReviewAction {
  id: string;
  type: "review-transition" | "consider-remove-silence";
  status: "pending";
  sourceAt?: string;
  sourceIn?: string;
  sourceOut?: string;
  confidence?: number;
  reason: string;
}

export interface FirstCutSceneProposal {
  sceneId: string;
  source: string;
  sourceRange: { in: string; out: string };
  segments: FirstCutSegment[];
  reviewActions: FirstCutReviewAction[];
}

export interface FirstCutProposal {
  version: 1;
  kind: "intentcut-first-cut-proposal";
  project: string;
  authority: { state: "proposed-only"; applied: false };
  scenes: FirstCutSceneProposal[];
}

function overlappingCues(cues: TranscriptCue[], start: number, end: number): TranscriptCue[] {
  return cues.filter((cue) => cue.endMilliseconds > start && cue.startMilliseconds < end);
}

export function createFirstCutProposal(report: SourceAnalysisReport): FirstCutProposal {
  const scenes = report.contactSheets.map((sheet): FirstCutSceneProposal => {
    const cuts = report.cutCandidates
      .filter((candidate) => candidate.sceneId === sheet.sceneId)
      .filter((candidate) => candidate.sourceTimeMilliseconds > sheet.sourceStartMilliseconds && candidate.sourceTimeMilliseconds < sheet.sourceEndMilliseconds)
      .sort((a, b) => a.sourceTimeMilliseconds - b.sourceTimeMilliseconds);
    const transcript = report.transcripts.find((item) => item.sceneId === sheet.sceneId);
    const boundaries = [sheet.sourceStartMilliseconds, ...cuts.map((cut) => cut.sourceTimeMilliseconds), sheet.sourceEndMilliseconds];
    const segments = boundaries.slice(0, -1).map((start, index): FirstCutSegment => {
      const end = boundaries[index + 1] ?? sheet.sourceEndMilliseconds;
      const cues = overlappingCues(transcript?.cues ?? [], start, end);
      const excerpt = cues.map((cue) => cue.text).join(" ").slice(0, 160).trim();
      const precedingCut = index > 0 ? cuts[index - 1] : undefined;
      return {
        id: `${sheet.sceneId}-${String(index + 1).padStart(2, "0")}`,
        sourceIn: formatDuration(start),
        sourceOut: formatDuration(end),
        disposition: "keep",
        beginsAfter: index === 0 ? "source-start" : "visual-transition",
        transcriptCueCount: cues.length,
        ...(precedingCut ? { confidence: precedingCut.confidence } : {}),
        ...(excerpt ? { transcriptExcerpt: excerpt } : {}),
      };
    });
    const visualActions: FirstCutReviewAction[] = cuts.map((cut, index) => ({
      id: `${sheet.sceneId}-transition-${String(index + 1).padStart(2, "0")}`,
      type: "review-transition",
      status: "pending",
      sourceAt: formatDuration(cut.sourceTimeMilliseconds),
      confidence: cut.confidence,
      reason: "Visual discontinuity exceeded the declared confidence threshold.",
    }));
    const audio = report.audio.find((item) => item.sceneId === sheet.sceneId);
    const silenceActions: FirstCutReviewAction[] = (audio?.silenceRegions ?? []).map((silence, index) => ({
      id: `${sheet.sceneId}-silence-${String(index + 1).padStart(2, "0")}`,
      type: "consider-remove-silence",
      status: "pending",
      sourceIn: formatDuration(silence.sourceStartMilliseconds),
      sourceOut: formatDuration(silence.sourceEndMilliseconds),
      reason: `Silence lasts ${formatDuration(silence.durationMilliseconds)}; review pacing before removal.`,
    }));
    return {
      sceneId: sheet.sceneId,
      source: sheet.source,
      sourceRange: { in: formatDuration(sheet.sourceStartMilliseconds), out: formatDuration(sheet.sourceEndMilliseconds) },
      segments,
      reviewActions: [...visualActions, ...silenceActions],
    };
  });

  return {
    version: 1,
    kind: "intentcut-first-cut-proposal",
    project: report.project,
    authority: { state: "proposed-only", applied: false },
    scenes,
  };
}

export async function writeFirstCutProposal(project: LoadedProject, proposal: FirstCutProposal): Promise<{ yaml: string; json: string }> {
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  const yaml = path.join(reportDirectory, "first-cut.proposal.yaml");
  const json = path.join(reportDirectory, "first-cut.proposal.json");
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(yaml, stringify(proposal, { lineWidth: 100 }), "utf8"),
    writeFile(json, `${JSON.stringify(proposal, null, 2)}\n`, "utf8"),
  ]);
  return { yaml, json };
}

export function formatFirstCutProposal(proposal: FirstCutProposal): string {
  const segmentCount = proposal.scenes.reduce((total, scene) => total + scene.segments.length, 0);
  const actionCount = proposal.scenes.reduce((total, scene) => total + scene.reviewActions.length, 0);
  return `PASS  First-cut proposal     ${segmentCount} segment(s) · ${actionCount} pending review action(s) · not applied`;
}
