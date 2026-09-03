import { describe, expect, it } from "vitest";
import { buildCaptureStatus } from "../src/capture-status.js";
import type { LoadedProject } from "../src/manifest.js";

const project = {
  baseDirectory: "/production",
  manifestPath: "/production/intentcut.yaml",
  manifest: {
    version: 1,
    project: { title: "Capture status", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "30s" },
    scenes: [{ id: "demo", type: "video", source: "demo.mov", speed: 1 }], annotations: [],
    inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
    output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
  },
} satisfies LoadedProject;

describe("capture environment status", () => {
  it("reports a missing OBS installation without treating manual capture as blocked", () => {
    const status = buildCaptureStatus(project, { platform: "darwin", obsConfigurationDetected: false, ffmpegVersion: "8.1.2", ffprobeVersion: "8.1.2" });
    expect(status.obs.status).toBe("not-found");
    expect(status.readyForManualCapture).toBe(true);
    expect(status.readyForObsAdapter).toBe(false);
    expect(status.authority).toEqual({ state: "diagnostic-only", connectionAttempted: false, recordingControl: "none", credentialsRead: false });
  });

  it("reports OBS metadata without claiming a WebSocket connection", () => {
    const status = buildCaptureStatus(project, { platform: "darwin", obsApplicationPath: "/Applications/OBS.app", obsVersion: "32.0.0", obsConfigurationDetected: true, ffmpegVersion: "8.1.2", ffprobeVersion: "8.1.2" });
    expect(status.obs).toMatchObject({ status: "available", version: "32.0.0", configurationDetected: true, websocket: { status: "not-checked" } });
    expect(status.authority.connectionAttempted).toBe(false);
  });
});
