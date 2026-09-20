/**
 * The QA gate is the single trusted input to the whole release ceremony: candidate,
 * approval, and seal all re-validate against `report.passed`. Every other test in this
 * repository fabricates a BuildReport, so these exercise the thing that produces one,
 * against media FFmpeg actually rendered.
 */
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkBuild } from "../src/check.js";
import { projectManifestSchema, type LoadedProject } from "../src/manifest.js";
import type { NarrationPlan } from "../src/narration.js";
import type { TimelinePlan } from "../src/timeline.js";
import { runProcess } from "../src/process.js";

const CANVAS = { width: 320, height: 180, fps: 30 };

/** Render a real clip so the checks read a genuine probe rather than a stubbed one. */
async function renderClip(
  directory: string,
  { seconds = 2, audio = true, width = CANVAS.width, height = CANVAS.height, volume = 1 } = {},
): Promise<string> {
  const output = path.join(directory, `clip-${width}x${height}-${seconds}s-${audio ? "a" : "silent"}-${volume}.mp4`);
  const args = [
    "-hide_banner", "-y",
    "-f", "lavfi", "-i", `color=c=teal:s=${width}x${height}:d=${seconds}:r=${CANVAS.fps}`,
  ];
  if (audio) args.push("-f", "lavfi", "-i", `sine=frequency=300:duration=${seconds}:sample_rate=48000`);
  args.push("-af", `volume=${volume}`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p");
  if (audio) args.push("-c:a", "aac", "-shortest"); else args.push("-an");
  args.push(output);
  await runProcess("ffmpeg", audio ? args : args.filter((value) => value !== "-af" && !value.startsWith("volume=")));
  return output;
}

function projectFor(directory: string, file: string, options: { audio?: boolean } = {}): LoadedProject {
  const manifest = projectManifestSchema.parse({
    version: 1,
    project: { title: "Gate", resolution: { width: CANVAS.width, height: CANVAS.height }, fps: CANVAS.fps, maximumDuration: "10s" },
    scenes: [{ id: "only", type: "image", source: "only.png", duration: "2s" }],
    ...(options.audio === false ? {} : {
      audio: { narration: { sections: [{ id: "voice", scene: "only", script: "voice.md" }] }, loudness: { integrated: -16, truePeak: -1.5, range: 7 } },
    }),
    output: { file: path.basename(file), codec: "h264", reportDirectory: "reports" },
  });
  return { manifest, manifestPath: path.join(directory, "intentcut.yaml"), baseDirectory: directory };
}

const timelineFor = (milliseconds: number): TimelinePlan => ({
  title: "Gate",
  durationMilliseconds: milliseconds,
  maximumDurationMilliseconds: 10_000,
  withinMaximumDuration: true,
  canvas: CANVAS,
  scenes: [{ id: "only", type: "image", source: "only.png", startMilliseconds: 0, endMilliseconds: milliseconds, durationMilliseconds: milliseconds, speed: 1 }],
  annotations: [],
});

const planFor = (mode: "synthetic-prototype" | "synthetic-final" | "human-final"): NarrationPlan => ({
  sections: [{
    id: "voice", scene: "only", mode, scriptPath: "/voice.md", audioPath: "/human/voice.wav",
    startMilliseconds: 0, capacityMilliseconds: 2_000, durationMilliseconds: 1_000, fits: true,
  }],
  syntheticCount: mode === "synthetic-prototype" ? 1 : 0,
  syntheticFinalCount: mode === "synthetic-final" ? 1 : 0,
  humanCount: mode === "human-final" ? 1 : 0,
  allFit: true,
});

const named = (report: { checks: { name: string; passed: boolean; actual: string }[] }, name: string) =>
  report.checks.find((check) => check.name === name);

describe("the build gate, against real rendered media", () => {
  it("passes a render that matches its manifest and timeline", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory);
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("human-final"), true);
    expect(named(report, "Resolution")?.passed).toBe(true);
    expect(named(report, "Frame rate")?.passed).toBe(true);
    expect(named(report, "Audio stream")?.passed).toBe(true);
    expect(report.mode).toBe("final");
  }, 60_000);

  it("fails when the rendered resolution does not match the canvas", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory, { width: 640, height: 360 });
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("human-final"), true);
    expect(named(report, "Resolution")?.passed).toBe(false);
    expect(report.passed).toBe(false);
  }, 60_000);

  it("fails when the render is not the duration the timeline planned", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory, { seconds: 4 });
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("human-final"), true);
    expect(named(report, "Planned duration")?.passed).toBe(false);
    expect(report.passed).toBe(false);
  }, 60_000);

  it("fails when the manifest declares narration but the render carries no audio", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory, { audio: false });
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("human-final"), true);
    expect(named(report, "Audio stream")?.passed).toBe(false);
    expect(report.passed).toBe(false);
  }, 60_000);

  it("refuses a scratch voice in final mode and allows it in preview", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory);
    const project = projectFor(directory, clip);
    const asFinal = await checkBuild(project, timelineFor(2_000), planFor("synthetic-prototype"), true);
    expect(named(asFinal, "Narration mode")?.passed).toBe(false);
    const asPreview = await checkBuild(project, timelineFor(2_000), planFor("synthetic-prototype"), false);
    expect(named(asPreview, "Narration mode")?.passed).toBe(true);
  }, 60_000);

  it("refuses a synthesised final voice that the manifest never declared", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory);
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("synthetic-final"), true);
    expect(named(report, "Narration mode")?.passed).toBe(false);
  }, 60_000);

  it("refuses to answer for sectioned narration it was given no plan for", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory);
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), undefined, true);
    const check = named(report, "Narration mode");
    expect(check?.passed).toBe(false);
    expect(check?.actual).toContain("not planned");
  }, 60_000);

  it("fails rather than passes when loudness cannot be measured as a number", async () => {
    // Digital silence measures as -inf, which parses to NaN. Every comparison against
    // NaN is false, so the checks must fail rather than quietly read as satisfied.
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-gate-"));
    const clip = await renderClip(directory, { volume: 0 });
    const report = await checkBuild(projectFor(directory, clip), timelineFor(2_000), planFor("human-final"), true);
    expect(named(report, "Integrated loudness")?.passed).toBe(false);
    expect(report.passed).toBe(false);
  }, 60_000);
});
