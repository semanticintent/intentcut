import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseDuration } from "./duration.js";
import type { LoadedProject, ProjectScene } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import { runProcess } from "./process.js";
import type { TimelinePlan } from "./timeline.js";

export interface RenderPlan {
  outputPath: string;
  reportDirectory: string;
  arguments: string[];
  narrationMode?: "human-final" | "synthetic-prototype";
}

function seconds(milliseconds: number): string {
  return (milliseconds / 1_000).toFixed(6);
}

function scaleFilter(width: number, height: number, fps: number): string {
  return [
    `scale=${width}:${height}:force_original_aspect_ratio=decrease`,
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "setsar=1",
    `fps=${fps}`,
    "format=yuv420p",
  ].join(",");
}

function imageMotionFilter(
  scene: Extract<ProjectScene, { type: "image" }>,
  width: number,
  height: number,
  fps: number,
): string {
  if (!scene.motion || scene.motion.type === "none") {
    return "";
  }

  const durationMilliseconds = parseDuration(scene.duration);
  const frames = Math.max(2, Math.round((durationMilliseconds / 1_000) * fps));
  const defaultFrom = scene.motion.type === "push-in" ? 1 : 1.05;
  const defaultTo = scene.motion.type === "push-in" ? 1.05 : 1;
  const from = scene.motion.from ?? defaultFrom;
  const to = scene.motion.to ?? defaultTo;
  const delta = to - from;
  const zoom = `${from}+(${delta})*on/${frames - 1}`;

  return `,zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
}

function sceneInputArguments(scene: ProjectScene, project: LoadedProject, fps: number): string[] {
  const source = resolveProjectPath(project, scene.source);
  if (scene.type === "image") {
    return ["-loop", "1", "-framerate", String(fps), "-t", seconds(parseDuration(scene.duration)), "-i", source];
  }
  return ["-i", source];
}

export function createRenderPlan(project: LoadedProject, timeline: TimelinePlan): RenderPlan {
  const { width, height, fps } = timeline.canvas;
  const argumentsList: string[] = ["-hide_banner", "-y"];
  const filters: string[] = [];

  project.manifest.scenes.forEach((scene) => {
    argumentsList.push(...sceneInputArguments(scene, project, fps));
  });

  project.manifest.scenes.forEach((scene, index) => {
    const normalized = scaleFilter(width, height, fps);
    if (scene.type === "image") {
      const motion = imageMotionFilter(scene, width, height, fps);
      filters.push(`[${index}:v]${normalized}${motion},trim=duration=${seconds(parseDuration(scene.duration))},setpts=PTS-STARTPTS[v${index}]`);
      return;
    }

    const trimIn = scene.trim ? parseDuration(scene.trim.in) : 0;
    const trimOut = scene.trim?.out ? parseDuration(scene.trim.out) : undefined;
    const trim = trimOut === undefined
      ? `trim=start=${seconds(trimIn)}`
      : `trim=start=${seconds(trimIn)}:end=${seconds(trimOut)}`;
    filters.push(`[${index}:v]${trim},setpts=(PTS-STARTPTS)/${scene.speed},${normalized}[v${index}]`);
  });

  const videoLabels = project.manifest.scenes.map((_, index) => `[v${index}]`).join("");
  filters.push(`${videoLabels}concat=n=${project.manifest.scenes.length}:v=1:a=0[vout]`);

  if (project.manifest.audio) {
    const audioInput = project.manifest.scenes.length;
    const narrationPath = resolveProjectPath(project, project.manifest.audio.narration.source);
    argumentsList.push("-i", narrationPath);
    const loudness = project.manifest.audio.loudness;
    filters.push(
      `[${audioInput}:a]atrim=duration=${seconds(timeline.durationMilliseconds)},asetpts=PTS-STARTPTS,` +
      `loudnorm=I=${loudness.integrated}:TP=${loudness.truePeak}:LRA=${loudness.range}[aout]`,
    );
  }

  argumentsList.push("-filter_complex", filters.join(";"), "-map", "[vout]");
  if (project.manifest.audio) {
    argumentsList.push("-map", "[aout]", "-c:a", "aac", "-b:a", "192k");
  } else {
    argumentsList.push("-an");
  }

  const outputPath = resolveProjectPath(project, project.manifest.output.file);
  argumentsList.push(
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-r", String(fps),
    "-movflags", "+faststart",
    outputPath,
  );

  return {
    outputPath,
    reportDirectory: resolveProjectPath(project, project.manifest.output.reportDirectory),
    arguments: argumentsList,
    ...(project.manifest.audio ? { narrationMode: project.manifest.audio.narration.mode } : {}),
  };
}

export async function renderPreview(plan: RenderPlan): Promise<void> {
  await mkdir(path.dirname(plan.outputPath), { recursive: true });
  await mkdir(plan.reportDirectory, { recursive: true });
  await writeFile(
    path.join(plan.reportDirectory, "ffmpeg-command.json"),
    `${JSON.stringify({ command: "ffmpeg", arguments: plan.arguments }, null, 2)}\n`,
    "utf8",
  );

  await runProcess("ffmpeg", plan.arguments, {
    onStderr: (chunk) => {
      const progress = chunk.match(/time=\s*([0-9:.]+)/g)?.at(-1);
      if (progress) {
        process.stderr.write(`\rRendering ${progress.replace(/\s+/g, " ")}`);
      }
    },
  });
  process.stderr.write("\n");
}
