import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ingestCapturedRecording, loadRecordingReceipt, type CapturedRecordingReceipt } from "../src/ingest.js";
import type { LoadedProject } from "../src/manifest.js";

function project(baseDirectory: string): LoadedProject {
  return {
    baseDirectory,
    manifestPath: path.join(baseDirectory, "intentcut.yaml"),
    manifest: {
      version: 1,
      project: { title: "Ingest", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "30s" },
      scenes: [{ id: "demo", type: "video", source: "recordings/demo.mov", speed: 1 }],
      annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      capture: { preflight: [], takes: [{ scene: "demo", objective: "Show it.", startState: "Ready.", actions: ["Act."], visibleProof: ["Visible."], endState: "Done.", privacyNotes: [] }] },
      output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

function receipt(outputPath: string): CapturedRecordingReceipt {
  return { takeId: "take-demo", sceneId: "demo", expectedSource: "recordings/demo.mov", outputPath, state: "captured-uningested" };
}

describe("captured recording ingestion", () => {
  it("copies a declared take without removing the OBS original", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-ingest-"));
    const captured = path.join(directory, "obs.mov");
    await writeFile(captured, "recording");

    const result = await ingestCapturedRecording(project(directory), receipt(captured));

    expect(result).toMatchObject({ sceneId: "demo", operation: "copy", state: "ingested", bytes: 9 });
    expect(await readFile(captured, "utf8")).toBe("recording");
    expect(await readFile(path.join(directory, "recordings/demo.mov"), "utf8")).toBe("recording");
  });

  it("refuses to overwrite an existing project source", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-ingest-"));
    const captured = path.join(directory, "obs.mov");
    const destination = path.join(directory, "recordings/demo.mov");
    await writeFile(captured, "new recording");
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, "existing recording", { flag: "wx" });

    await expect(ingestCapturedRecording(project(directory), receipt(captured))).rejects.toThrow("Refusing to overwrite");
    expect(await readFile(destination, "utf8")).toBe("existing recording");
  });

  it("rejects a receipt whose destination differs from the manifest", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-ingest-"));
    const captured = path.join(directory, "obs.mov");
    await writeFile(captured, "recording");
    await expect(ingestCapturedRecording(project(directory), { ...receipt(captured), expectedSource: "recordings/other.mov" })).rejects.toThrow("does not match declared source");
  });

  it("rejects missing captures and relative OBS paths", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-ingest-"));
    await expect(ingestCapturedRecording(project(directory), receipt("relative.mov"))).rejects.toThrow("must be absolute");
    await expect(ingestCapturedRecording(project(directory), receipt(path.join(directory, "missing.mov")))).rejects.toThrow("does not exist");
  });

  it("loads only strict captured-uningested receipt JSON", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-ingest-"));
    const receiptPath = path.join(directory, "receipt.json");
    const value = receipt(path.join(directory, "obs.mov"));
    await writeFile(receiptPath, JSON.stringify(value));
    await expect(loadRecordingReceipt(receiptPath)).resolves.toEqual(value);
    await writeFile(receiptPath, JSON.stringify({ ...value, state: "ingested" }));
    await expect(loadRecordingReceipt(receiptPath)).rejects.toThrow();
  });
});
