import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatDuration } from "./duration.js";
import { inspectMedia } from "./inspect.js";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import { runProcess } from "./process.js";
import type { TimelinePlan } from "./timeline.js";
import type { NarrationPlan } from "./narration.js";
import type { CaptionPlan } from "./captions.js";

export interface CheckResult {
  name: string;
  passed: boolean;
  actual: string;
  expected: string;
}

export interface BuildReport {
  project: string;
  output: string;
  generatedAt: string;
  mode: "preview" | "final";
  passed: boolean;
  checks: CheckResult[];
}

interface LoudnessMeasurement {
  integrated: number;
  truePeak: number;
}

function frameRateValue(frameRate: string | undefined): number {
  if (!frameRate) return Number.NaN;
  const [numerator, denominator] = frameRate.split("/").map(Number);
  return denominator ? (numerator ?? 0) / denominator : Number(frameRate);
}

async function measureLoudness(filePath: string): Promise<LoudnessMeasurement> {
  const { stderr } = await runProcess("ffmpeg", [
    "-hide_banner", "-i", filePath,
    "-af", "loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
    "-f", "null", "-",
  ]);
  const matches = [...stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  const json = matches.at(-1)?.[0];
  if (!json) {
    throw new Error("FFmpeg did not return a loudness measurement.");
  }
  const parsed = JSON.parse(json) as { input_i: string; input_tp: string };
  return { integrated: Number(parsed.input_i), truePeak: Number(parsed.input_tp) };
}

function markdownReport(report: BuildReport): string {
  const lines = [
    `# IntentCut build report — ${report.project}`,
    "",
    `**Result:** ${report.passed ? "PASS" : "FAIL"}`,
    "",
    `**Output:** \`${report.output}\``,
    "",
    "| Check | Result | Actual | Expected |",
    "| --- | --- | --- | --- |",
    ...report.checks.map((check) =>
      `| ${check.name} | ${check.passed ? "PASS" : "FAIL"} | ${check.actual} | ${check.expected} |`,
    ),
    "",
  ];
  return lines.join("\n");
}

export async function checkBuild(
  project: LoadedProject,
  timeline: TimelinePlan,
  narrationPlan?: NarrationPlan,
  final = false,
  captionPlan?: CaptionPlan,
): Promise<BuildReport> {
  const outputPath = resolveProjectPath(project, project.manifest.output.file);
  const inspection = await inspectMedia(project.manifest.output.file, outputPath);
  const checks: CheckResult[] = [];
  const width = inspection.video?.width;
  const height = inspection.video?.height;
  checks.push({
    name: "Resolution",
    passed: width === timeline.canvas.width && height === timeline.canvas.height,
    actual: `${width ?? "?"}x${height ?? "?"}`,
    expected: `${timeline.canvas.width}x${timeline.canvas.height}`,
  });

  const actualFps = frameRateValue(inspection.video?.frameRate);
  checks.push({
    name: "Frame rate",
    passed: Math.abs(actualFps - timeline.canvas.fps) < 0.02,
    actual: Number.isFinite(actualFps) ? `${actualFps.toFixed(3)} fps` : "unknown",
    expected: `${timeline.canvas.fps} fps`,
  });

  checks.push({
    name: "Maximum duration",
    passed: inspection.durationMilliseconds <= timeline.maximumDurationMilliseconds + 50,
    actual: formatDuration(inspection.durationMilliseconds),
    expected: `<= ${formatDuration(timeline.maximumDurationMilliseconds)}`,
  });

  checks.push({
    name: "Planned duration",
    passed: Math.abs(inspection.durationMilliseconds - timeline.durationMilliseconds) < 150,
    actual: formatDuration(inspection.durationMilliseconds),
    expected: `${formatDuration(timeline.durationMilliseconds)} +/- 150ms`,
  });

  checks.push({
    name: "Audio stream",
    passed: project.manifest.audio ? Boolean(inspection.audio) : true,
    actual: inspection.audio ? `${inspection.audio.channels ?? "?"} channels` : "none",
    expected: project.manifest.audio ? "present" : "optional",
  });

  if (project.manifest.audio && inspection.audio) {
    const measured = await measureLoudness(outputPath);
    const target = project.manifest.audio.loudness;
    checks.push({
      name: "Integrated loudness",
      passed: Math.abs(measured.integrated - target.integrated) <= 1,
      actual: `${measured.integrated.toFixed(1)} LUFS`,
      expected: `${target.integrated.toFixed(1)} +/- 1 LUFS`,
    });
    checks.push({
      name: "True peak",
      passed: measured.truePeak <= target.truePeak + 0.3,
      actual: `${measured.truePeak.toFixed(2)} dBTP`,
      expected: `<= ${(target.truePeak + 0.3).toFixed(2)} dBTP`,
    });
    const narration = project.manifest.audio.narration;
    const syntheticCount = narrationPlan?.syntheticCount ?? (!("sections" in narration) && narration.mode === "synthetic-prototype" ? 1 : 0);
    checks.push({
      name: "Narration mode",
      passed: !final || syntheticCount === 0,
      actual: syntheticCount === 0 ? "human-final" : `${syntheticCount} synthetic-prototype section(s)`,
      expected: final ? "human-final" : "prototype or human-final",
    });
    if (narrationPlan) {
      checks.push({
        name: "Narration timing",
        passed: narrationPlan.allFit,
        actual: narrationPlan.allFit ? "all sections fit" : "one or more sections overflow",
        expected: "all sections fit assigned capacity",
      });
    }
  }

  if ((project.manifest.annotations?.length ?? 0) > 0) {
    checks.push({
      name: "Annotations",
      passed: true,
      actual: `${project.manifest.annotations?.length ?? 0} timed overlay(s)`,
      expected: "within timeline",
    });
  }

  if (project.manifest.output.captions) {
    checks.push({
      name: "Captions",
      passed: Boolean(captionPlan?.cues.length),
      actual: captionPlan ? `${captionPlan.cues.length} WebVTT cue(s)` : "missing",
      expected: "generated from narration sections",
    });
  }

  const report: BuildReport = {
    project: project.manifest.project.title,
    output: outputPath,
    generatedAt: new Date().toISOString(),
    mode: final ? "final" : "preview",
    passed: checks.every((check) => check.passed),
    checks,
  };
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(reportDirectory, "build-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(path.join(reportDirectory, "build-report.md"), markdownReport(report), "utf8"),
  ]);
  return report;
}

export function formatBuildReport(report: BuildReport): string {
  const lines = [`IntentCut Check — ${report.project}`, ""];
  for (const check of report.checks) {
    lines.push(`${check.passed ? "PASS" : "FAIL"}  ${check.name.padEnd(22)} ${check.actual} · ${check.expected}`);
  }
  lines.push("", `Result: ${report.passed ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}
