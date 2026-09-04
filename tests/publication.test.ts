import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildReport } from "../src/check.js";
import type { LoadedProject } from "../src/manifest.js";
import { authorizePublication, DirectoryPublicationAdapter, publishAuthorizedRelease, writePublicationIntent } from "../src/publication.js";
import { approveReleaseCandidate, createReleaseCandidate, releaseCandidateToken, sealApprovedRelease } from "../src/release.js";

function project(baseDirectory: string): LoadedProject {
  return {
    baseDirectory, manifestPath: path.join(baseDirectory, "intentcut.yaml"),
    manifest: {
      version: 1,
      project: { title: "Publication", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "3m" },
      scenes: [{ id: "demo", type: "video", source: "demo.mov", speed: 1 }], annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      output: { file: "renders/final.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-publication-"));
  const current = project(directory);
  const source = path.join(directory, current.manifest.output.file);
  await mkdir(path.dirname(source), { recursive: true });
  await writeFile(source, "approved release media");
  const report: BuildReport = { project: "Publication", output: source, generatedAt: "2026-09-03T00:00:00.000Z", mode: "final", passed: true, checks: [] };
  const candidate = await createReleaseCandidate(current, report);
  const approval = await approveReleaseCandidate(current, candidate, "Michael", releaseCandidateToken(candidate), new Date("2026-09-03T20:00:00.000Z"));
  const sealed = await sealApprovedRelease(current, candidate, approval, new Date("2026-09-03T21:00:00.000Z"));
  return { directory, project: current, release: sealed.receipt, releaseArtifact: sealed.artifact };
}

describe("separately authorized publication", () => {
  it("binds a named human, adapter, and target to one exact sealed release", async () => {
    const item = await fixture();
    const target = path.join(item.directory, "published");
    const intent = await authorizePublication(item.project, item.release, target, "Michael Shatny", item.release.releaseId, new Date("2026-09-03T22:00:00.000Z"));
    expect(intent).toMatchObject({
      releaseId: item.release.releaseId,
      adapter: { id: "directory", target },
      authorizedBy: "Michael Shatny", authorizedAt: "2026-09-03T22:00:00.000Z",
      authority: { state: "publication-authorized", published: false },
    });
  });

  it("requires the exact release id and a named publisher", async () => {
    const item = await fixture();
    await expect(authorizePublication(item.project, item.release, "target", "Michael", "wrong-release")).rejects.toThrow("exact release id");
    await expect(authorizePublication(item.project, item.release, "target", " ", item.release.releaseId)).rejects.toThrow("name");
  });

  it("writes publication intent exclusively", async () => {
    const item = await fixture();
    const intent = await authorizePublication(item.project, item.release, path.join(item.directory, "target"), "Michael", item.release.releaseId);
    const output = await writePublicationIntent(item.project, item.release, intent);
    await expect(writePublicationIntent(item.project, item.release, intent)).rejects.toMatchObject({ code: "EEXIST" });
    expect(JSON.parse(await readFile(output, "utf8"))).toEqual(intent);
  });

  it("publishes through the authorized directory adapter and records completion", async () => {
    const item = await fixture();
    const target = path.join(item.directory, "target");
    const intent = await authorizePublication(item.project, item.release, target, "Michael", item.release.releaseId);
    const result = await publishAuthorizedRelease(item.project, item.release, intent, new DirectoryPublicationAdapter(), new Date("2026-09-03T23:00:00.000Z"));
    expect(await readFile(result.receipt.adapter.location, "utf8")).toBe("approved release media");
    expect(result.receipt).toMatchObject({
      publishedBy: "Michael", publishedAt: "2026-09-03T23:00:00.000Z",
      authority: { state: "published", published: true },
      media: { sha256: item.release.media.sha256, bytes: item.release.media.bytes },
    });
    expect(JSON.parse(await readFile(result.receiptPath, "utf8"))).toEqual(result.receipt);
  });

  it("rejects a changed release receipt or sealed artifact after authorization", async () => {
    const item = await fixture();
    const intent = await authorizePublication(item.project, item.release, path.join(item.directory, "target"), "Michael", item.release.releaseId);
    const changedReceipt = { ...item.release, sealedAt: "2026-09-03T23:30:00.000Z" };
    await expect(publishAuthorizedRelease(item.project, changedReceipt, intent, new DirectoryPublicationAdapter())).rejects.toThrow("receipt changed");
    await writeFile(item.releaseArtifact, "tampered sealed media");
    await expect(publishAuthorizedRelease(item.project, item.release, intent, new DirectoryPublicationAdapter())).rejects.toThrow("artifact changed");
  });

  it("refuses to publish the same adapter twice and preserves the first receipt", async () => {
    const item = await fixture();
    const intent = await authorizePublication(item.project, item.release, path.join(item.directory, "target"), "Michael", item.release.releaseId);
    const first = await publishAuthorizedRelease(item.project, item.release, intent, new DirectoryPublicationAdapter());
    await expect(publishAuthorizedRelease(item.project, item.release, intent, new DirectoryPublicationAdapter())).rejects.toThrow("completion receipt already exists");
    expect(JSON.parse(await readFile(first.receiptPath, "utf8"))).toEqual(first.receipt);
  });
});
