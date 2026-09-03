import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";
import { runProcess } from "./process.js";

export interface CaptureProbeFacts {
  platform: NodeJS.Platform;
  obsApplicationPath?: string;
  obsVersion?: string;
  obsConfigurationDetected: boolean;
  ffmpegVersion?: string;
  ffprobeVersion?: string;
}

export interface CaptureEnvironmentStatus {
  version: 1;
  kind: "intentcut-capture-status";
  project: string;
  authority: {
    state: "diagnostic-only";
    connectionAttempted: false;
    recordingControl: "none";
    credentialsRead: false;
  };
  target: { width: number; height: number; fps: number };
  platform: NodeJS.Platform;
  mediaEngine: {
    ffmpeg: { status: "available" | "not-found"; version?: string };
    ffprobe: { status: "available" | "not-found"; version?: string };
  };
  obs: {
    status: "available" | "not-found";
    applicationPath?: string;
    version?: string;
    configurationDetected: boolean;
    websocket: { status: "not-checked"; reason: string };
  };
  readyForManualCapture: boolean;
  readyForObsAdapter: false;
}

async function exists(candidate: string): Promise<boolean> {
  try {
    await access(candidate, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function commandVersion(command: string): Promise<string | undefined> {
  try {
    const { stdout } = await runProcess(command, ["-version"]);
    const match = stdout.split("\n")[0]?.match(/version\s+([^\s]+)/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

async function detectMacObs(): Promise<{ applicationPath?: string; version?: string }> {
  const candidates = [
    "/Applications/OBS.app",
    path.join(os.homedir(), "Applications", "OBS.app"),
  ];
  const applicationPath = (await Promise.all(candidates.map(async (candidate) => (
    await exists(candidate) ? candidate : undefined
  )))).find(Boolean);
  if (!applicationPath) return {};
  try {
    const plist = await readFile(path.join(applicationPath, "Contents", "Info.plist"), "utf8");
    const version = plist.match(/<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    return { applicationPath, ...(version ? { version } : {}) };
  } catch {
    return { applicationPath };
  }
}

async function detectCommandObs(): Promise<{ applicationPath?: string; version?: string }> {
  const locator = process.platform === "win32" ? "where" : "which";
  try {
    const { stdout } = await runProcess(locator, [process.platform === "win32" ? "obs64.exe" : "obs"]);
    const applicationPath = stdout.split(/\r?\n/).find(Boolean)?.trim();
    if (!applicationPath) return {};
    const version = await commandVersion(applicationPath);
    return { applicationPath, ...(version ? { version } : {}) };
  } catch {
    return {};
  }
}

export async function detectCaptureProbeFacts(): Promise<CaptureProbeFacts> {
  const platform = process.platform;
  const obs = platform === "darwin" ? await detectMacObs() : await detectCommandObs();
  const configurationCandidates = platform === "darwin"
    ? [path.join(os.homedir(), "Library", "Application Support", "obs-studio")]
    : platform === "win32"
      ? [path.join(process.env.APPDATA ?? "", "obs-studio")]
      : [path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "obs-studio")];
  const obsConfigurationDetected = (await Promise.all(configurationCandidates.filter(Boolean).map(exists))).some(Boolean);
  const [ffmpegVersion, ffprobeVersion] = await Promise.all([
    commandVersion("ffmpeg"),
    commandVersion("ffprobe"),
  ]);
  return {
    platform,
    obsConfigurationDetected,
    ...(obs.applicationPath ? { obsApplicationPath: obs.applicationPath } : {}),
    ...(obs.version ? { obsVersion: obs.version } : {}),
    ...(ffmpegVersion ? { ffmpegVersion } : {}),
    ...(ffprobeVersion ? { ffprobeVersion } : {}),
  };
}

export function buildCaptureStatus(project: LoadedProject, facts: CaptureProbeFacts): CaptureEnvironmentStatus {
  const ffmpeg = facts.ffmpegVersion
    ? { status: "available" as const, version: facts.ffmpegVersion }
    : { status: "not-found" as const };
  const ffprobe = facts.ffprobeVersion
    ? { status: "available" as const, version: facts.ffprobeVersion }
    : { status: "not-found" as const };
  const obs = facts.obsApplicationPath
    ? {
        status: "available" as const,
        applicationPath: facts.obsApplicationPath,
        ...(facts.obsVersion ? { version: facts.obsVersion } : {}),
        configurationDetected: facts.obsConfigurationDetected,
        websocket: { status: "not-checked" as const, reason: "Connection is outside diagnostic-only scope." },
      }
    : {
        status: "not-found" as const,
        configurationDetected: facts.obsConfigurationDetected,
        websocket: { status: "not-checked" as const, reason: "OBS is not installed." },
      };
  return {
    version: 1,
    kind: "intentcut-capture-status",
    project: project.manifest.project.title,
    authority: { state: "diagnostic-only", connectionAttempted: false, recordingControl: "none", credentialsRead: false },
    target: { width: project.manifest.project.resolution.width, height: project.manifest.project.resolution.height, fps: project.manifest.project.fps },
    platform: facts.platform,
    mediaEngine: { ffmpeg, ffprobe },
    obs,
    readyForManualCapture: true,
    readyForObsAdapter: false,
  };
}

export async function writeCaptureStatus(project: LoadedProject, status: CaptureEnvironmentStatus): Promise<{ json: string; markdown: string }> {
  const directory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  const json = path.join(directory, "capture-status.json");
  const markdown = path.join(directory, "capture-status.md");
  const lines = [
    `# IntentCut Capture Status — ${status.project}`,
    "",
    `- Platform: ${status.platform}`,
    `- Target: ${status.target.width}×${status.target.height} · ${status.target.fps} fps`,
    `- FFmpeg: ${status.mediaEngine.ffmpeg.status}${status.mediaEngine.ffmpeg.version ? ` · ${status.mediaEngine.ffmpeg.version}` : ""}`,
    `- ffprobe: ${status.mediaEngine.ffprobe.status}${status.mediaEngine.ffprobe.version ? ` · ${status.mediaEngine.ffprobe.version}` : ""}`,
    `- OBS: ${status.obs.status}${status.obs.version ? ` · ${status.obs.version}` : ""}`,
    `- OBS configuration: ${status.obs.configurationDetected ? "detected" : "not detected"}`,
    `- WebSocket: ${status.obs.websocket.status} · ${status.obs.websocket.reason}`,
    `- Manual capture: ${status.readyForManualCapture ? "ready" : "not ready"}`,
    `- OBS adapter: ${status.readyForObsAdapter ? "ready" : "not ready"}`,
    "",
    "No application was opened, no connection was attempted, and no credentials were read.",
    "",
  ];
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(json, `${JSON.stringify(status, null, 2)}\n`, "utf8"),
    writeFile(markdown, lines.join("\n"), "utf8"),
  ]);
  return { json, markdown };
}

export function formatCaptureStatus(status: CaptureEnvironmentStatus): string {
  return [
    `IntentCut Capture Status — ${status.project}`,
    "",
    `${status.mediaEngine.ffmpeg.status === "available" ? "PASS" : "MISS"}  FFmpeg                 ${status.mediaEngine.ffmpeg.version ?? "not found"}`,
    `${status.mediaEngine.ffprobe.status === "available" ? "PASS" : "MISS"}  ffprobe                ${status.mediaEngine.ffprobe.version ?? "not found"}`,
    `${status.obs.status === "available" ? "PASS" : "INFO"}  OBS                     ${status.obs.version ?? status.obs.status}`,
    `INFO  OBS configuration       ${status.obs.configurationDetected ? "detected" : "not detected"}`,
    "INFO  WebSocket               not checked · no connection attempted",
    "PASS  Manual capture          ready",
    "INFO  OBS adapter             not ready",
  ].join("\n");
}
