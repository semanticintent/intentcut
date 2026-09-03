import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeAudio, createContactSheetPlans, parseCutCandidates, parseSilenceRegions, parseWebVtt } from "../src/analyze.js";
import { inspectMedia } from "../src/inspect.js";
import { runProcess } from "../src/process.js";
import type { MediaInspection } from "../src/inspect.js";
import type { LoadedProject } from "../src/manifest.js";
import type { TimelinePlan } from "../src/timeline.js";

describe("source analysis planning", () => {
  it("samples the declared source range at deterministic midpoints", () => {
    const project = {
      baseDirectory: "/production",
      manifestPath: "/production/intentcut.yaml",
      manifest: {
        version: 1,
        project: { title: "Analyze", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "20s" },
        scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", trim: { in: "2s", out: "10s" }, speed: 1 }],
        annotations: [],
        inspection: {
          contactSheets: { samples: 4, columns: 2, frameWidth: 480 },
          cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 },
          silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" },
          transcripts: [],
        },
        output: { file: "renders/preview.mp4", codec: "h264", reportDirectory: "reports" },
      },
    } satisfies LoadedProject;
    const inspection: MediaInspection = {
      source: "recordings/demo.mov",
      absolutePath: "/production/recordings/demo.mov",
      durationMilliseconds: 12_000,
      video: { width: 1920, height: 1080 },
    };
    const timeline: TimelinePlan = {
      title: "Analyze",
      durationMilliseconds: 8_000,
      maximumDurationMilliseconds: 20_000,
      withinMaximumDuration: true,
      output: { width: 1920, height: 1080, fps: 30 },
      annotations: [],
      scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", startMilliseconds: 0, endMilliseconds: 8_000, durationMilliseconds: 8_000, sourceDurationMilliseconds: 8_000, speed: 1 }],
    };

    const plans = createContactSheetPlans(project, timeline, new Map([[inspection.source, inspection]]));
    expect(plans).toHaveLength(1);
    expect(plans[0]?.sampleTimesMilliseconds).toEqual([3_000, 5_000, 7_000, 9_000]);
    expect(plans[0]).toMatchObject({ columns: 2, rows: 2, frameWidth: 480, frameHeight: 270 });
  });

  it("deduplicates nearby cut candidates and keeps the strongest score", () => {
    const stderr = [
      "frame:1 pts_time:2.000\nlavfi.scd.mafd=21.000\nlavfi.scd.score=21.000",
      "frame:2 pts_time:2.400\nlavfi.scd.mafd=44.000\nlavfi.scd.score=44.000",
      "frame:3 pts_time:7.000\nlavfi.scd.mafd=31.000\nlavfi.scd.score=31.000",
    ].join("\n");
    const candidates = parseCutCandidates(stderr, "demo", "demo.mov", 1_000, 0.18, 1_000, 20);
    expect(candidates).toEqual([
      { sceneId: "demo", source: "demo.mov", sourceTimeMilliseconds: 3_400, confidence: 0.44 },
      { sceneId: "demo", source: "demo.mov", sourceTimeMilliseconds: 8_000, confidence: 0.31 },
    ]);
  });

  it("parses source-relative silence regions", () => {
    const stderr = "silence_start: 1.25\nsilence_end: 3.75 | silence_duration: 2.5";
    expect(parseSilenceRegions(stderr, 2_000)).toEqual([{
      sourceStartMilliseconds: 3_250,
      sourceEndMilliseconds: 5_750,
      durationMilliseconds: 2_500,
    }]);
  });

  it("parses WebVTT cues without binding to a transcription provider", () => {
    const cues = parseWebVtt("WEBVTT\n\nopening\n00:00:01.250 --> 00:00:03.750\nMeaning, <b>not pixels</b>.\n");
    expect(cues).toEqual([{
      startMilliseconds: 1_250,
      endMilliseconds: 3_750,
      text: "Meaning, not pixels.",
    }]);
  });

  it("detects a real silence region through FFmpeg", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-silence-"));
    const source = path.join(directory, "silence.mp4");
    await runProcess("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "color=c=black:s=320x180:d=4:r=10",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=48000",
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono:d=2",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1:sample_rate=48000",
      "-filter_complex", "[1:a][2:a][3:a]concat=n=3:v=0:a=1[a]",
      "-map", "0:v", "-map", "[a]", "-c:v", "libx264", "-c:a", "aac", "-shortest", source,
    ]);
    const inspection = await inspectMedia("silence.mp4", source);
    const project = {
      baseDirectory: directory,
      manifestPath: path.join(directory, "intentcut.yaml"),
      manifest: {
        version: 1,
        project: { title: "Silence", resolution: { width: 320, height: 180 }, fps: 10, maximumDuration: "5s" },
        scenes: [{ id: "demo", type: "video", source: "silence.mp4", speed: 1 }],
        annotations: [],
        inspection: {
          contactSheets: { samples: 4, columns: 2, frameWidth: 240 },
          cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 },
          silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" },
          transcripts: [],
        },
        output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
      },
    } satisfies LoadedProject;
    const plan = createContactSheetPlans(project, {
      title: "Silence", durationMilliseconds: 4_000, maximumDurationMilliseconds: 5_000,
      withinMaximumDuration: true, output: { width: 320, height: 180, fps: 10 }, annotations: [],
      scenes: [{ id: "demo", type: "video", source: "silence.mp4", startMilliseconds: 0, endMilliseconds: 4_000, durationMilliseconds: 4_000, sourceDurationMilliseconds: 4_000, speed: 1 }],
    }, new Map([["silence.mp4", inspection]]))[0];
    expect(plan).toBeDefined();
    if (!plan) return;
    const result = await analyzeAudio(project, plan, inspection);
    expect(result.status).toBe("analyzed");
    expect(result.silenceRegions).toHaveLength(1);
    expect(result.silenceRegions[0]?.sourceStartMilliseconds).toBeGreaterThanOrEqual(950);
    expect(result.silenceRegions[0]?.sourceEndMilliseconds).toBeLessThanOrEqual(3_100);
  }, 15_000);
});
