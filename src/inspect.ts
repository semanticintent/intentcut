import { spawn } from "node:child_process";
import type { LoadedProject, ProjectScene } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  sample_rate?: string;
  channels?: number;
}

interface FfprobeOutput {
  format?: {
    filename?: string;
    duration?: string;
  };
  streams?: FfprobeStream[];
}

export interface MediaInspection {
  source: string;
  absolutePath: string;
  durationMilliseconds: number;
  video?: {
    codec?: string;
    width?: number;
    height?: number;
    frameRate?: string;
  };
  audio?: {
    codec?: string;
    sampleRate?: number;
    channels?: number;
  };
}

function runFfprobe(filePath: string): Promise<FfprobeOutput> {
  const argumentsList = [
    "-v", "error",
    "-show_entries", "format=filename,duration",
    "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    filePath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("ffprobe", argumentsList, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr.on("data", (chunk: string) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe failed for ${filePath}: ${stderr.trim()}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout) as FfprobeOutput);
      } catch (error) {
        reject(new Error(`Could not parse ffprobe output for ${filePath}: ${String(error)}`));
      }
    });
  });
}

export async function inspectMedia(source: string, absolutePath: string): Promise<MediaInspection> {
  const result = await runFfprobe(absolutePath);
  const durationSeconds = Number(result.format?.duration);

  if (!Number.isFinite(durationSeconds)) {
    throw new Error(`ffprobe did not report a valid duration for ${absolutePath}.`);
  }

  const videoStream = result.streams?.find((stream) => stream.codec_type === "video");
  const audioStream = result.streams?.find((stream) => stream.codec_type === "audio");
  const inspection: MediaInspection = {
    source,
    absolutePath,
    durationMilliseconds: durationSeconds * 1_000,
  };

  if (videoStream) {
    inspection.video = {
      ...(videoStream.codec_name ? { codec: videoStream.codec_name } : {}),
      ...(videoStream.width ? { width: videoStream.width } : {}),
      ...(videoStream.height ? { height: videoStream.height } : {}),
      ...(videoStream.r_frame_rate ? { frameRate: videoStream.r_frame_rate } : {}),
    };
  }

  if (audioStream) {
    inspection.audio = {
      ...(audioStream.codec_name ? { codec: audioStream.codec_name } : {}),
      ...(audioStream.sample_rate ? { sampleRate: Number(audioStream.sample_rate) } : {}),
      ...(audioStream.channels ? { channels: audioStream.channels } : {}),
    };
  }

  return inspection;
}

export async function inspectProjectMedia(project: LoadedProject): Promise<Map<string, MediaInspection>> {
  const sources = new Map<string, ProjectScene>();
  project.manifest.scenes.forEach((scene) => {
    if (scene.type === "video") {
      sources.set(scene.source, scene);
    }
  });

  const inspections = await Promise.all(
    [...sources.keys()].map(async (source) => [
      source,
      await inspectMedia(source, resolveProjectPath(project, source)),
    ] as const),
  );

  return new Map(inspections);
}
