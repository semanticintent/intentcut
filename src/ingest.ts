import { constants } from "node:fs";
import { copyFile, mkdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LoadedProject } from "./manifest.js";
import { isWithin, resolveProjectPath } from "./manifest.js";

export const obsRecordingReceiptSchema = z.object({
  takeId: z.string().min(1),
  sceneId: z.string().min(1),
  expectedSource: z.string().min(1),
  outputPath: z.string().min(1),
  state: z.literal("captured-uningested"),
}).strict();

export type CapturedRecordingReceipt = z.infer<typeof obsRecordingReceiptSchema>;

export interface RecordingIngestResult {
  takeId: string;
  sceneId: string;
  capturedSource: string;
  projectSource: string;
  bytes: number;
  operation: "copy";
  state: "ingested";
}

const RECORDING_EXTENSIONS = new Set([".mov", ".mp4", ".m4v", ".mkv", ".webm", ".flv", ".ts"]);

/** Refuse destinations that escape the project, lexically (../, absolute) or through a symlinked directory. */
async function assertInsideProject(project: LoadedProject, destination: string): Promise<void> {
  if (!isWithin(project.baseDirectory, destination)) {
    throw new Error(`Refusing to ingest outside the project directory: ${destination}`);
  }
  const projectRoot = await realpath(project.baseDirectory);
  let ancestor = path.dirname(destination);
  for (;;) {
    const resolved = await realpath(ancestor).catch((error: unknown) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    });
    if (resolved !== undefined) {
      if (!isWithin(projectRoot, resolved)) throw new Error(`Refusing to ingest through a directory that resolves outside the project: ${ancestor}`);
      return;
    }
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return;
    ancestor = parent;
  }
}

export async function loadRecordingReceipt(receiptPath: string): Promise<CapturedRecordingReceipt> {
  const source = await readFile(path.resolve(receiptPath), "utf8");
  return obsRecordingReceiptSchema.parse(JSON.parse(source) as unknown);
}

export async function ingestCapturedRecording(
  project: LoadedProject,
  receipt: CapturedRecordingReceipt,
): Promise<RecordingIngestResult> {
  const validated = obsRecordingReceiptSchema.parse(receipt);
  const scene = project.manifest.scenes.find((candidate) => candidate.id === validated.sceneId);
  if (!scene) throw new Error(`Recording receipt references unknown scene "${validated.sceneId}".`);
  if (scene.type !== "video") throw new Error(`Recording receipt scene "${validated.sceneId}" is not a video scene.`);
  if (!project.manifest.capture?.takes.some((take) => take.scene === validated.sceneId)) {
    throw new Error(`Recording receipt scene "${validated.sceneId}" has no declared capture take.`);
  }
  if (validated.takeId !== `take-${validated.sceneId}`) {
    throw new Error(`Recording receipt take id does not match scene "${validated.sceneId}".`);
  }
  if (validated.expectedSource !== scene.source) {
    throw new Error(`Recording receipt destination does not match declared source for scene "${validated.sceneId}".`);
  }
  if (!path.isAbsolute(validated.outputPath)) {
    throw new Error("Recording receipt output path must be absolute.");
  }

  const capturedSource = path.resolve(validated.outputPath);
  if (!RECORDING_EXTENSIONS.has(path.extname(capturedSource).toLowerCase())) {
    throw new Error(`Captured recording must be a video file (${[...RECORDING_EXTENSIONS].join(", ")}): ${capturedSource}`);
  }
  const projectSource = resolveProjectPath(project, scene.source);
  await assertInsideProject(project, projectSource);
  if (capturedSource === projectSource) {
    throw new Error("Captured recording is already at the declared project source.");
  }

  const captured = await stat(capturedSource).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Captured recording does not exist: ${capturedSource}`);
    }
    throw error;
  });
  if (!captured.isFile()) throw new Error(`Captured recording is not a regular file: ${capturedSource}`);

  await mkdir(path.dirname(projectSource), { recursive: true });
  await copyFile(capturedSource, projectSource, constants.COPYFILE_EXCL).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(`Refusing to overwrite existing project source: ${projectSource}`);
    }
    throw error;
  });

  return {
    takeId: validated.takeId,
    sceneId: validated.sceneId,
    capturedSource,
    projectSource,
    bytes: captured.size,
    operation: "copy",
    state: "ingested",
  };
}
