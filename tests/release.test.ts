import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { BuildReport } from "../src/check.js";
import type { LoadedProject } from "../src/manifest.js";
import { approveReleaseCandidate, createReleaseCandidate, releaseCandidateToken, writeReleaseApproval } from "../src/release.js";

function project(baseDirectory: string, title = "Release"): LoadedProject {
  return {
    baseDirectory, manifestPath: path.join(baseDirectory, "intentcut.yaml"),
    manifest: {
      version: 1,
      project: { title, resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "3m" },
      scenes: [{ id: "demo", type: "video", source: "demo.mov", speed: 1 }],
      annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      output: { file: "renders/final.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

function report(projectValue: LoadedProject, overrides: Partial<BuildReport> = {}): BuildReport {
  return {
    project: projectValue.manifest.project.title,
    output: path.join(projectValue.baseDirectory, projectValue.manifest.output.file),
    generatedAt: "2026-09-03T00:00:00.000Z",
    mode: "final", passed: true, checks: [], ...overrides,
  };
}

async function fixture(): Promise<{ directory: string; project: LoadedProject }> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-release-"));
  const current = project(directory);
  const output = path.join(directory, current.manifest.output.file);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, "approved media candidate");
  return { directory, project: current };
}

describe("human release approval", () => {
  it("binds a candidate and approval to exact intent and media", async () => {
    const { project: current } = await fixture();
    const candidate = await createReleaseCandidate(current, report(current));
    const token = releaseCandidateToken(candidate);
    const approval = await approveReleaseCandidate(current, candidate, "Michael Shatny", token, new Date("2026-09-03T20:00:00.000Z"));
    expect(candidate.authority).toEqual({ state: "release-candidate", approved: false, released: false });
    expect(token).toMatch(/^[a-f0-9]{12}$/);
    expect(approval).toMatchObject({
      approvedBy: "Michael Shatny", approvedAt: "2026-09-03T20:00:00.000Z",
      manifestRevision: candidate.manifestRevision, mediaSha256: candidate.media.sha256,
      authority: { state: "human-approved", approved: true, released: false },
    });
  });

  it("blocks candidates from preview or failed validation", async () => {
    const { project: current } = await fixture();
    await expect(createReleaseCandidate(current, report(current, { mode: "preview" }))).rejects.toThrow("final mode");
    await expect(createReleaseCandidate(current, report(current, { passed: false }))).rejects.toThrow("failed");
  });

  it("rejects a wrong confirmation token or unnamed approver", async () => {
    const { project: current } = await fixture();
    const candidate = await createReleaseCandidate(current, report(current));
    await expect(approveReleaseCandidate(current, candidate, "Michael", "wrong-token")).rejects.toThrow("token");
    await expect(approveReleaseCandidate(current, candidate, " ", releaseCandidateToken(candidate))).rejects.toThrow("name");
  });

  it("rejects approval after project intent changes", async () => {
    const { directory, project: current } = await fixture();
    const candidate = await createReleaseCandidate(current, report(current));
    await expect(approveReleaseCandidate(project(directory, "Changed"), candidate, "Michael", releaseCandidateToken(candidate))).rejects.toThrow("intent changed");
  });

  it("rejects approval after rendered media changes", async () => {
    const { directory, project: current } = await fixture();
    const candidate = await createReleaseCandidate(current, report(current));
    await writeFile(path.join(directory, current.manifest.output.file), "different media");
    await expect(approveReleaseCandidate(current, candidate, "Michael", releaseCandidateToken(candidate))).rejects.toThrow("media changed");
  });

  it("refuses to replace an existing human approval record", async () => {
    const { directory, project: current } = await fixture();
    const candidate = await createReleaseCandidate(current, report(current));
    const approval = await approveReleaseCandidate(current, candidate, "Michael", releaseCandidateToken(candidate));
    const output = await writeReleaseApproval(current, approval);
    await expect(writeReleaseApproval(current, approval)).rejects.toMatchObject({ code: "EEXIST" });
    expect(JSON.parse(await readFile(output, "utf8"))).toMatchObject({ approvedBy: "Michael" });
    expect(output).toBe(path.join(directory, "reports/release-approval.json"));
  });
});
