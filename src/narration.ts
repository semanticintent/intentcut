import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { formatDuration, parseDuration } from "./duration.js";
import { inspectMedia } from "./inspect.js";
import type { LoadedProject, NarrationMode, NarrationSection } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import { runProcess } from "./process.js";
import type { TimelinePlan, TimelineScene } from "./timeline.js";

export interface NarrationSectionPlan {
  id: string;
  scene: string;
  mode: NarrationMode;
  scriptPath: string;
  audioPath: string;
  startMilliseconds: number;
  capacityMilliseconds: number;
  durationMilliseconds: number;
  fits: boolean;
}
export interface NarrationPlan {
  sections: NarrationSectionPlan[];
  /** Scratch sections only. A final render refuses while this is non-zero. */
  syntheticCount: number;
  /** Declared synthesised voices the creator has chosen to ship. */
  syntheticFinalCount: number;
  humanCount: number;
  allFit: boolean;
}

function sectionAudioPath(project: LoadedProject, section: NarrationSection): string {
  if (section.source) return resolveProjectPath(project, section.source);
  const narration = project.manifest.audio?.narration;
  if (!narration || !("sections" in narration)) {
    throw new Error("Sectioned narration is not configured.");
  }
  return resolveProjectPath(project, path.join(narration.generatedDirectory, `${section.id}.aiff`));
}

/** Synthesises every section whose voice is generated, whether scratch or final. */
export async function generateSyntheticNarration(project: LoadedProject): Promise<string[]> {
  const narration = project.manifest.audio?.narration;
  if (!narration || !("sections" in narration)) {
    throw new Error("Generated narration requires a sectioned narration manifest.");
  }

  const generated: string[] = [];
  for (const section of narration.sections) {
    if (section.mode === "human-final") continue;
    const scriptPath = resolveProjectPath(project, section.script);
    const outputPath = sectionAudioPath(project, section);
    const script = (await readFile(scriptPath, "utf8")).trim();
    if (!script) throw new Error(`Narration script "${section.script}" is empty.`);
    await mkdir(path.dirname(outputPath), { recursive: true });
    const argumentsList: string[] = [];
    if (section.voice) argumentsList.push("-v", section.voice);
    if (section.rate) argumentsList.push("-r", String(section.rate));
    // Read the script from its file rather than argv, so text beginning with "-" is never parsed as an option.
    argumentsList.push("-o", outputPath, "-f", scriptPath);
    await runProcess("say", argumentsList);
    generated.push(outputPath);
  }
  return generated;
}

/**
 * Narration audio is probed by ffprobe, whose failure text says nothing about how to
 * produce the missing file. A freshly scaffolded project has scripts but no audio yet,
 * so name the command that makes it rather than surfacing the probe error.
 */
async function assertSectionAudioExists(section: NarrationSection, audioPath: string): Promise<void> {
  const exists = await stat(audioPath).then((entry) => entry.isFile()).catch(() => false);
  if (exists) return;
  if (section.mode === "human-final") {
    throw new Error(
      `Narration section "${section.id}" is marked human-final but its source is missing: ${audioPath}\n`
      + `Record it, then run: intentcut replace-voice <manifest> ${section.id} <path-to-recording>`,
    );
  }
  throw new Error(
    `Narration section "${section.id}" has no generated audio yet: ${audioPath}\n`
    + "Run: intentcut narrate <manifest> --temporary",
  );
}

function timelineScene(timeline: TimelinePlan, sceneId: string): TimelineScene {
  const scene = timeline.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Unknown timeline scene "${sceneId}".`);
  return scene;
}

export async function planNarration(
  project: LoadedProject,
  timeline: TimelinePlan,
): Promise<NarrationPlan> {
  const narration = project.manifest.audio?.narration;
  if (!narration || !("sections" in narration)) {
    throw new Error("Narration planning requires sectioned narration.");
  }

  const positioned = narration.sections.map((section) => {
    const scene = timelineScene(timeline, section.scene);
    const startMilliseconds = scene.startMilliseconds + parseDuration(section.offset);
    if (startMilliseconds >= scene.endMilliseconds) {
      throw new Error(`Narration section "${section.id}" starts outside scene "${section.scene}".`);
    }
    return { section, scene, startMilliseconds };
  }).sort((left, right) => left.startMilliseconds - right.startMilliseconds);

  const sections: NarrationSectionPlan[] = [];
  for (let index = 0; index < positioned.length; index += 1) {
    const current = positioned[index];
    if (!current) continue;
    const next = positioned[index + 1];
    const boundary = next && next.startMilliseconds < current.scene.endMilliseconds
      ? next.startMilliseconds
      : current.scene.endMilliseconds;
    const capacityMilliseconds = boundary - current.startMilliseconds;
    const audioPath = sectionAudioPath(project, current.section);
    await assertSectionAudioExists(current.section, audioPath);
    const inspection = await inspectMedia(current.section.id, audioPath);
    sections.push({
      id: current.section.id,
      scene: current.section.scene,
      mode: current.section.mode,
      scriptPath: resolveProjectPath(project, current.section.script),
      audioPath,
      startMilliseconds: current.startMilliseconds,
      capacityMilliseconds,
      durationMilliseconds: inspection.durationMilliseconds,
      fits: inspection.durationMilliseconds <= capacityMilliseconds,
    });
  }

  return {
    sections,
    syntheticCount: sections.filter((section) => section.mode === "synthetic-prototype").length,
    syntheticFinalCount: sections.filter((section) => section.mode === "synthetic-final").length,
    humanCount: sections.filter((section) => section.mode === "human-final").length,
    allFit: sections.every((section) => section.fits),
  };
}

export function formatNarrationPlan(plan: NarrationPlan): string {
  const lines = ["IntentCut Narration Plan", ""];
  for (const section of plan.sections) {
    lines.push(section.id);
    lines.push(`  Mode:       ${section.mode}`);
    lines.push(`  Starts:     ${formatDuration(section.startMilliseconds)}`);
    lines.push(`  Capacity:   ${formatDuration(section.capacityMilliseconds)}`);
    lines.push(`  Narration:  ${formatDuration(section.durationMilliseconds)}`);
    lines.push(`  Remaining:  ${formatDuration(section.capacityMilliseconds - section.durationMilliseconds)}`);
    lines.push(`  Result:     ${section.fits ? "PASS" : "OVERFLOW"}`);
    lines.push("");
  }
  lines.push(`Prototype sections: ${plan.syntheticCount}`);
  lines.push(`Synthesised final:  ${plan.syntheticFinalCount}`);
  lines.push(`Human sections:     ${plan.humanCount}`);
  lines.push(`Result:             ${plan.allFit ? "PASS" : "REVISE"}`);
  return lines.join("\n");
}

export async function writeNarrationReport(project: LoadedProject, plan: NarrationPlan): Promise<void> {
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  await writeFile(
    path.join(reportDirectory, "narration-report.json"),
    `${JSON.stringify(plan, null, 2)}\n`,
    "utf8",
  );
  await writeFile(path.join(reportDirectory, "narration-report.md"), `\`\`\`text\n${formatNarrationPlan(plan)}\n\`\`\`\n`, "utf8");
}
