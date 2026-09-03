import { describe, expect, it } from "vitest";
import { ObsCaptureAdapter, type ObsConnectionOptions, type ObsRequestResult, type ObsTransport } from "../src/obs.js";
import type { LoadedProject } from "../src/manifest.js";

class FakeObsTransport implements ObsTransport {
  connections: ObsConnectionOptions[] = [];
  requests: string[] = [];
  recording = false;

  async connect(options: ObsConnectionOptions): Promise<void> { this.connections.push(options); }
  async request(requestType: string): Promise<ObsRequestResult> {
    this.requests.push(requestType);
    if (requestType === "GetRecordStatus") return { outputActive: this.recording };
    if (requestType === "StartRecord") { this.recording = true; return {}; }
    if (requestType === "StopRecord") { this.recording = false; return { outputPath: "/obs/demo.mov" }; }
    return {};
  }
  async close(): Promise<void> {}
}

function project(enabled = true): LoadedProject {
  return {
    baseDirectory: "/production", manifestPath: "/production/intentcut.yaml",
    manifest: {
      version: 1,
      project: { title: "OBS", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "30s" },
      scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", speed: 1 }], annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      capture: {
        preflight: [],
        takes: [{ scene: "demo", objective: "Show it.", startState: "Ready.", actions: ["Act."], visibleProof: ["Visible."], endState: "Done.", privacyNotes: [] }],
        obs: { enabled, url: "ws://127.0.0.1:4455", passwordEnvironmentVariable: "INTENTCUT_OBS_PASSWORD" },
      },
      output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

describe("OBS capture adapter", () => {
  it("requires explicit enablement before connecting", async () => {
    const transport = new FakeObsTransport();
    const adapter = new ObsCaptureAdapter(project(false), transport, { INTENTCUT_OBS_PASSWORD: "secret" });
    await expect(adapter.connect()).rejects.toThrow("explicitly");
    expect(transport.connections).toHaveLength(0);
  });

  it("resolves credentials from the environment and captures only a declared take", async () => {
    const transport = new FakeObsTransport();
    const adapter = new ObsCaptureAdapter(project(), transport, { INTENTCUT_OBS_PASSWORD: "secret" });
    await adapter.connect();
    expect(transport.connections).toEqual([{ url: "ws://127.0.0.1:4455", password: "secret" }]);
    await adapter.startTake("demo");
    expect(await adapter.status()).toMatchObject({ connected: true, recording: true, activeTakeId: "take-demo" });
    await expect(adapter.close()).rejects.toThrow("while take");
    await expect(adapter.startTake("missing")).rejects.toThrow("already active");
    await expect(adapter.stopTake()).resolves.toEqual({
      takeId: "take-demo", sceneId: "demo", expectedSource: "recordings/demo.mov",
      outputPath: "/obs/demo.mov", state: "captured-uningested",
    });
    expect(transport.requests).toEqual(["GetRecordStatus", "StartRecord", "GetRecordStatus", "StopRecord"]);
  });

  it("refuses an undeclared take before sending a start request", async () => {
    const transport = new FakeObsTransport();
    const adapter = new ObsCaptureAdapter(project(), transport, { INTENTCUT_OBS_PASSWORD: "secret" });
    await adapter.connect();
    await expect(adapter.startTake("missing")).rejects.toThrow("No declared capture take");
    expect(transport.requests).toHaveLength(0);
  });

  it("refuses to adopt a recording started outside IntentCut", async () => {
    const transport = new FakeObsTransport();
    transport.recording = true;
    const adapter = new ObsCaptureAdapter(project(), transport, { INTENTCUT_OBS_PASSWORD: "secret" });
    await adapter.connect();
    await expect(adapter.startTake("demo")).rejects.toThrow("already recording outside");
    expect(transport.requests).toEqual(["GetRecordStatus"]);
  });

  it("never reads a password from the manifest", async () => {
    const transport = new FakeObsTransport();
    const adapter = new ObsCaptureAdapter(project(), transport, {});
    await expect(adapter.connect()).rejects.toThrow("environment variable");
    expect(transport.connections).toHaveLength(0);
  });
});
