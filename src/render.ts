import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { parseDuration } from "./duration.js";
import type { LoadedProject, ProjectScene } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import type { NarrationPlan } from "./narration.js";
import { runProcess } from "./process.js";
import type { TimelinePlan } from "./timeline.js";

export interface AnnotationAsset {
  path: string;
  width: number;
  height: number;
  text: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  tone: "neutral" | "accent" | "warning";
  startMilliseconds: number;
  endMilliseconds: number;
}

export interface RenderPlan {
  outputPath: string;
  reportDirectory: string;
  arguments: string[];
  narrationMode?: "human-final" | "synthetic-prototype";
  syntheticNarrationSections: number;
  annotationAssets: AnnotationAsset[];
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
  if (!scene.motion || scene.motion.type === "none") return "";
  const frames = Math.max(2, Math.round((parseDuration(scene.duration) / 1_000) * fps));
  const defaultFrom = scene.motion.type === "push-in" ? 1 : 1.05;
  const defaultTo = scene.motion.type === "push-in" ? 1.05 : 1;
  const from = scene.motion.from ?? defaultFrom;
  const to = scene.motion.to ?? defaultTo;
  const zoom = `${from}+(${to - from})*on/${frames - 1}`;
  return `,zoompan=z='${zoom}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${width}x${height}:fps=${fps}`;
}

function videoCameraFilter(
  scene: Extract<ProjectScene, { type: "video" }>,
  fps: number,
  width: number,
  height: number,
): string {
  const focus = scene.camera?.[0];
  if (!focus) return "";
  const start = Math.round((parseDuration(focus.at) / 1_000) * fps);
  const transition = Math.max(1, Math.round((parseDuration(focus.transition) / 1_000) * fps));
  const hold = Math.max(1, Math.round((parseDuration(focus.duration) / 1_000) * fps));
  const peakStart = start + transition;
  const peakEnd = peakStart + hold;
  const finish = peakEnd + transition;
  const delta = focus.zoom - 1;
  const zoom = `if(lt(on,${start}),1,if(lt(on,${peakStart}),1+${delta}*(on-${start})/${transition},if(lt(on,${peakEnd}),${focus.zoom},if(lt(on,${finish}),${focus.zoom}-${delta}*(on-${peakEnd})/${transition},1))))`;
  const x = `max(0,min(iw-iw/zoom,${focus.center.x}*iw-iw/(2*zoom)))`;
  const y = `max(0,min(ih-ih/zoom,${focus.center.y}*ih-ih/(2*zoom)))`;
  return `,zoompan=z='${zoom}':x='${x}':y='${y}':d=1:s=${width}x${height}:fps=${fps}`;
}

function sceneInputArguments(scene: ProjectScene, project: LoadedProject, fps: number): string[] {
  const source = resolveProjectPath(project, scene.source);
  if (scene.type === "image") {
    return ["-loop", "1", "-framerate", String(fps), "-t", seconds(parseDuration(scene.duration)), "-i", source];
  }
  return ["-i", source];
}

function annotationPosition(
  position: AnnotationAsset["position"],
  width: number,
  height: number,
  boxWidth: number,
): { x: number; y: number } {
  const margin = 72;
  const boxHeight = 78;
  switch (position) {
    case "top-left": return { x: margin, y: margin };
    case "top-right": return { x: width - boxWidth - margin, y: margin };
    case "bottom-left": return { x: margin, y: height - boxHeight - margin };
    case "bottom-right": return { x: width - boxWidth - margin, y: height - boxHeight - margin };
    case "center": return { x: (width - boxWidth) / 2, y: (height - boxHeight) / 2 };
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

async function renderAnnotationAsset(asset: AnnotationAsset): Promise<void> {
  const fontSize = 38;
  const boxWidth = Math.min(asset.width - 144, Math.max(300, Math.ceil(asset.text.length * fontSize * 0.59) + 72));
  const { x, y } = annotationPosition(asset.position, asset.width, asset.height, boxWidth);
  const colors = asset.tone === "warning"
    ? { border: "#f0a66a", text: "#fff5ec" }
    : asset.tone === "accent"
      ? { border: "#67e2e5", text: "#dfffff" }
      : { border: "#8ca5ad", text: "#f4f7f6" };
  const svg = `<svg width="${asset.width}" height="${asset.height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="none"/>
  <rect x="${x}" y="${y}" width="${boxWidth}" height="78" rx="18" fill="#07141f" fill-opacity="0.92" stroke="${colors.border}" stroke-width="2"/>
  <text x="${x + 36}" y="${y + 51}" fill="${colors.text}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="600">${escapeXml(asset.text)}</text>
</svg>`;
  await mkdir(path.dirname(asset.path), { recursive: true });
  await sharp(Buffer.from(svg)).png().toFile(asset.path);
}

export function createRenderPlan(
  project: LoadedProject,
  timeline: TimelinePlan,
  narrationPlan?: NarrationPlan,
): RenderPlan {
  const { width, height, fps } = timeline.canvas;
  const argumentsList: string[] = ["-hide_banner", "-y"];
  const filters: string[] = [];

  project.manifest.scenes.forEach((scene) => {
    argumentsList.push(...sceneInputArguments(scene, project, fps));
  });

  const narration = project.manifest.audio?.narration;
  if (project.manifest.audio && narration) {
    if ("sections" in narration) {
      if (!narrationPlan) throw new Error("Sectioned narration requires a narration plan.");
      narrationPlan.sections.forEach((section) => argumentsList.push("-i", section.audioPath));
    } else {
      argumentsList.push("-i", resolveProjectPath(project, narration.source));
    }
  }

  const audioInputCount = project.manifest.audio && narration
    ? ("sections" in narration ? (narrationPlan?.sections.length ?? 0) : 1)
    : 0;
  const annotationAssets: AnnotationAsset[] = (timeline.annotations ?? []).map((annotation) => ({
    path: path.join(resolveProjectPath(project, project.manifest.output.reportDirectory), "annotations", `${annotation.id}.png`),
    width,
    height,
    text: annotation.text,
    position: annotation.position,
    tone: annotation.tone,
    startMilliseconds: annotation.startMilliseconds,
    endMilliseconds: annotation.endMilliseconds,
  }));
  annotationAssets.forEach((asset) => {
    argumentsList.push("-loop", "1", "-framerate", String(fps), "-i", asset.path);
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
    const camera = videoCameraFilter(scene, fps, width, height);
    filters.push(`[${index}:v]${trim},setpts=(PTS-STARTPTS)/${scene.speed},${normalized}${camera}[v${index}]`);
  });

  const videoLabels = project.manifest.scenes.map((_, index) => `[v${index}]`).join("");
  filters.push(`${videoLabels}concat=n=${project.manifest.scenes.length}:v=1:a=0[vbase]`);

  let videoOutput = "vbase";
  annotationAssets.forEach((asset, index) => {
    const input = project.manifest.scenes.length + audioInputCount + index;
    const next = `vannotation${index}`;
    filters.push(`[${videoOutput}][${input}:v]overlay=0:0:enable='between(t,${seconds(asset.startMilliseconds)},${seconds(asset.endMilliseconds)})':shortest=1[${next}]`);
    videoOutput = next;
  });

  if (project.manifest.audio && narration) {
    const firstAudioInput = project.manifest.scenes.length;
    if ("sections" in narration) {
      if (!narrationPlan) throw new Error("Sectioned narration requires a narration plan.");
      const delayedLabels = narrationPlan.sections.map((section, index) => {
        const label = `na${index}`;
        filters.push(`[${firstAudioInput + index}:a]aresample=48000,adelay=${Math.round(section.startMilliseconds)}:all=1[${label}]`);
        return `[${label}]`;
      }).join("");
      filters.push(`${delayedLabels}amix=inputs=${narrationPlan.sections.length}:duration=longest:normalize=0[narration]`);
    } else {
      filters.push(`[${firstAudioInput}:a]aresample=48000[narration]`);
    }
    const loudness = project.manifest.audio.loudness;
    filters.push(
      `[narration]apad,atrim=duration=${seconds(timeline.durationMilliseconds)},asetpts=PTS-STARTPTS,` +
      `loudnorm=I=${loudness.integrated}:TP=${loudness.truePeak}:LRA=${loudness.range}[aout]`,
    );
  }

  argumentsList.push("-filter_complex", filters.join(";"), "-map", `[${videoOutput}]`);
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
    syntheticNarrationSections: narrationPlan?.syntheticCount ?? (narration && !("sections" in narration) && narration.mode === "synthetic-prototype" ? 1 : 0),
    annotationAssets,
    ...(narration && !("sections" in narration) ? { narrationMode: narration.mode } : {}),
  };
}

export async function renderPreview(plan: RenderPlan): Promise<void> {
  await mkdir(path.dirname(plan.outputPath), { recursive: true });
  await mkdir(plan.reportDirectory, { recursive: true });
  await Promise.all(plan.annotationAssets.map(renderAnnotationAsset));
  await writeFile(
    path.join(plan.reportDirectory, "ffmpeg-command.json"),
    `${JSON.stringify({ command: "ffmpeg", arguments: plan.arguments }, null, 2)}\n`,
    "utf8",
  );

  await runProcess("ffmpeg", plan.arguments, {
    onStderr: (chunk) => {
      const progress = chunk.match(/time=\s*([0-9:.]+)/g)?.at(-1);
      if (progress) process.stderr.write(`\rRendering ${progress.replace(/\s+/g, " ")}`);
    },
  });
  process.stderr.write("\n");
}
