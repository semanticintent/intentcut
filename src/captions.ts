import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import type { NarrationPlan } from "./narration.js";

export interface CaptionCue {
  id: string;
  startMilliseconds: number;
  endMilliseconds: number;
  text: string;
}

export interface CaptionPlan {
  outputPath: string;
  cues: CaptionCue[];
}

function timestamp(milliseconds: number): string {
  const total = Math.max(0, Math.round(milliseconds));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1_000);
  const remainder = total % 1_000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(remainder).padStart(3, "0")}`;
}

export async function createCaptionPlan(project: LoadedProject, narration: NarrationPlan): Promise<CaptionPlan | undefined> {
  const captionConfig = project.manifest.output.captions;
  if (!captionConfig) return undefined;

  const cues = await Promise.all(narration.sections.map(async (section): Promise<CaptionCue> => ({
    id: section.id,
    startMilliseconds: section.startMilliseconds,
    endMilliseconds: section.startMilliseconds + section.durationMilliseconds,
    text: (await readFile(section.scriptPath, "utf8")).trim().replace(/\s+/g, " "),
  })));

  return { outputPath: resolveProjectPath(project, captionConfig.file), cues };
}

export async function writeCaptions(plan: CaptionPlan): Promise<void> {
  const lines = ["WEBVTT", ""];
  plan.cues.forEach((cue) => {
    lines.push(cue.id);
    lines.push(`${timestamp(cue.startMilliseconds)} --> ${timestamp(cue.endMilliseconds)}`);
    lines.push(cue.text);
    lines.push("");
  });
  await mkdir(path.dirname(plan.outputPath), { recursive: true });
  await writeFile(plan.outputPath, lines.join("\n"), "utf8");
}
