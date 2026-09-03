import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { formatDuration, parseDuration } from "./duration.js";
import type { MediaInspection } from "./inspect.js";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import { runProcess } from "./process.js";
import type { TimelinePlan } from "./timeline.js";

export interface ContactSheetPlan {
  sceneId: string;
  source: string;
  outputPath: string;
  sourceStartMilliseconds: number;
  sourceEndMilliseconds: number;
  sampleTimesMilliseconds: number[];
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
}

export interface SourceAnalysisReport {
  project: string;
  generatedAt: string;
  contactSheets: ContactSheetPlan[];
  cutCandidates: CutCandidate[];
}

export interface CutCandidate {
  sceneId: string;
  source: string;
  sourceTimeMilliseconds: number;
  confidence: number;
}

function evenlySpacedTimes(start: number, end: number, count: number): number[] {
  const span = end - start;
  return Array.from({ length: count }, (_, index) => (
    Math.round(start + (span * ((index + 0.5) / count)))
  ));
}

export function createContactSheetPlans(
  project: LoadedProject,
  timeline: TimelinePlan,
  inspections: Map<string, MediaInspection>,
): ContactSheetPlan[] {
  const config = project.manifest.inspection?.contactSheets ?? { samples: 12, columns: 4, frameWidth: 480 };
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);

  return project.manifest.scenes.flatMap((scene, index) => {
    if (scene.type !== "video") return [];
    const inspection = inspections.get(scene.source);
    const timelineScene = timeline.scenes[index];
    if (!inspection || !timelineScene) throw new Error(`Missing inspection data for scene "${scene.id}".`);

    const sourceStartMilliseconds = scene.trim?.in ? parseDuration(scene.trim.in) : 0;
    const sourceEndMilliseconds = scene.trim?.out
      ? parseDuration(scene.trim.out)
      : inspection.durationMilliseconds;
    const aspectRatio = (inspection.video?.width ?? 16) / (inspection.video?.height ?? 9);
    const frameHeight = Math.round(config.frameWidth / aspectRatio);
    const rows = Math.ceil(config.samples / config.columns);

    return [{
      sceneId: scene.id,
      source: scene.source,
      outputPath: path.join(reportDirectory, "contact-sheets", `${scene.id}.jpg`),
      sourceStartMilliseconds,
      sourceEndMilliseconds,
      sampleTimesMilliseconds: evenlySpacedTimes(sourceStartMilliseconds, sourceEndMilliseconds, config.samples),
      columns: config.columns,
      rows,
      frameWidth: config.frameWidth,
      frameHeight,
    }];
  });
}

async function extractFrame(sourcePath: string, timeMilliseconds: number): Promise<Buffer> {
  const { stdout } = await runProcess("ffmpeg", [
    "-v", "error",
    "-ss", (timeMilliseconds / 1_000).toFixed(3),
    "-i", sourcePath,
    "-frames:v", "1",
    "-f", "image2pipe",
    "-vcodec", "png",
    "pipe:1",
  ], { encoding: "buffer" });
  return stdout;
}

async function renderContactSheet(project: LoadedProject, plan: ContactSheetPlan): Promise<void> {
  const sourcePath = resolveProjectPath(project, plan.source);
  const padding = 8;
  const labelHeight = 34;
  const cellHeight = plan.frameHeight + labelHeight;
  const width = (plan.columns * plan.frameWidth) + ((plan.columns + 1) * padding);
  const height = (plan.rows * cellHeight) + ((plan.rows + 1) * padding);
  const frames = await Promise.all(plan.sampleTimesMilliseconds.map((time) => extractFrame(sourcePath, time)));
  const composites: OverlayOptions[] = [];

  for (const [index, frame] of frames.entries()) {
    const column = index % plan.columns;
    const row = Math.floor(index / plan.columns);
    const left = padding + (column * (plan.frameWidth + padding));
    const top = padding + (row * (cellHeight + padding));
    const resized = await sharp(frame)
      .resize(plan.frameWidth, plan.frameHeight, { fit: "contain", background: "#07111a" })
      .jpeg({ quality: 88 })
      .toBuffer();
    const label = await sharp(Buffer.from(`<svg width="${plan.frameWidth}" height="${labelHeight}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#0b1822"/><text x="12" y="23" fill="#bceff0" font-family="Menlo, monospace" font-size="16">${formatDuration(plan.sampleTimesMilliseconds[index] ?? 0)}</text></svg>`))
      .png()
      .toBuffer();
    composites.push({ input: resized, left, top });
    composites.push({ input: label, left, top: top + plan.frameHeight });
  }

  await mkdir(path.dirname(plan.outputPath), { recursive: true });
  await sharp({ create: { width, height, channels: 3, background: "#030a10" } })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toFile(plan.outputPath);
}

export function parseCutCandidates(
  stderr: string,
  sceneId: string,
  source: string,
  sourceStartMilliseconds: number,
  minimumConfidence: number,
  minimumGapMilliseconds: number,
  maximumCandidates: number,
): CutCandidate[] {
  const detected = [...stderr.matchAll(/pts_time:([0-9.]+)[\s\S]*?lavfi\.scd\.score=([0-9.]+)/g)]
    .map((match): CutCandidate => ({
      sceneId,
      source,
      sourceTimeMilliseconds: sourceStartMilliseconds + Math.round(Number(match[1]) * 1_000),
      confidence: Number((Number(match[2]) / 100).toFixed(4)),
    }))
    .filter((candidate) => (
      Number.isFinite(candidate.sourceTimeMilliseconds)
      && Number.isFinite(candidate.confidence)
      && candidate.confidence >= minimumConfidence
    ));

  const deduplicated: CutCandidate[] = [];
  for (const candidate of detected.sort((a, b) => a.sourceTimeMilliseconds - b.sourceTimeMilliseconds)) {
    const previous = deduplicated.at(-1);
    if (previous && candidate.sourceTimeMilliseconds - previous.sourceTimeMilliseconds < minimumGapMilliseconds) {
      if (candidate.confidence > previous.confidence) deduplicated[deduplicated.length - 1] = candidate;
      continue;
    }
    deduplicated.push(candidate);
  }

  return deduplicated
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maximumCandidates)
    .sort((a, b) => a.sourceTimeMilliseconds - b.sourceTimeMilliseconds);
}

async function detectCuts(project: LoadedProject, plan: ContactSheetPlan): Promise<CutCandidate[]> {
  const config = project.manifest.inspection?.cutDetection ?? {
    threshold: 0.18,
    minimumGap: "1s",
    maximumCandidates: 20,
  };
  const sourcePath = resolveProjectPath(project, plan.source);
  const durationMilliseconds = plan.sourceEndMilliseconds - plan.sourceStartMilliseconds;
  const { stderr } = await runProcess("ffmpeg", [
    "-v", "info",
    "-ss", (plan.sourceStartMilliseconds / 1_000).toFixed(3),
    "-t", (durationMilliseconds / 1_000).toFixed(3),
    "-i", sourcePath,
    "-vf", `fps=10,scale=320:-2,scdet=threshold=${config.threshold * 100},metadata=print`,
    "-an",
    "-f", "null",
    "-",
  ]);
  return parseCutCandidates(
    stderr,
    plan.sceneId,
    plan.source,
    plan.sourceStartMilliseconds,
    config.threshold,
    parseDuration(config.minimumGap),
    config.maximumCandidates,
  );
}

function markdownReport(report: SourceAnalysisReport): string {
  const lines = [
    `# IntentCut Source Analysis — ${report.project}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "## Contact sheets",
    "",
  ];
  for (const sheet of report.contactSheets) {
    lines.push(`### ${sheet.sceneId}`);
    lines.push("");
    lines.push(`- Source: \`${sheet.source}\``);
    lines.push(`- Range: ${formatDuration(sheet.sourceStartMilliseconds)} → ${formatDuration(sheet.sourceEndMilliseconds)}`);
    lines.push(`- Samples: ${sheet.sampleTimesMilliseconds.map(formatDuration).join(", ")}`);
    lines.push(`- Artifact: \`${path.relative(path.dirname(path.dirname(sheet.outputPath)), sheet.outputPath)}\``);
    lines.push("");
  }
  lines.push("## Likely cut regions", "");
  if (report.cutCandidates.length === 0) {
    lines.push("No visual discontinuities exceeded the configured threshold.", "");
  } else {
    lines.push("| Scene | Source time | Confidence |", "| --- | ---: | ---: |");
    for (const candidate of report.cutCandidates) {
      lines.push(`| ${candidate.sceneId} | ${formatDuration(candidate.sourceTimeMilliseconds)} | ${candidate.confidence.toFixed(4)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

export async function analyzeSources(
  project: LoadedProject,
  timeline: TimelinePlan,
  inspections: Map<string, MediaInspection>,
): Promise<SourceAnalysisReport> {
  const contactSheets = createContactSheetPlans(project, timeline, inspections);
  await Promise.all(contactSheets.map((plan) => renderContactSheet(project, plan)));
  const cutCandidates = (await Promise.all(contactSheets.map((plan) => detectCuts(project, plan)))).flat();
  const report: SourceAnalysisReport = {
    project: project.manifest.project.title,
    generatedAt: new Date().toISOString(),
    contactSheets,
    cutCandidates,
  };
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportDirectory, "source-analysis.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(reportDirectory, "source-analysis.md"), markdownReport(report), "utf8"),
  ]);
  return report;
}

export function formatSourceAnalysis(report: SourceAnalysisReport): string {
  const lines = [`IntentCut Analyze — ${report.project}`, ""];
  for (const sheet of report.contactSheets) {
    lines.push(`PASS  ${sheet.sceneId.padEnd(22)} ${sheet.sampleTimesMilliseconds.length} frames · ${sheet.columns}x${sheet.rows}`);
    lines.push(`      ${sheet.outputPath}`);
  }
  lines.push(`PASS  ${"Likely cuts".padEnd(22)} ${report.cutCandidates.length} bounded candidate(s)`);
  for (const candidate of report.cutCandidates) {
    lines.push(`      ${candidate.sceneId} · ${formatDuration(candidate.sourceTimeMilliseconds)} · confidence ${candidate.confidence.toFixed(4)}`);
  }
  lines.push("", `Result: ${report.contactSheets.length > 0 ? "PASS" : "NO VIDEO SCENES"}`);
  return lines.join("\n");
}
