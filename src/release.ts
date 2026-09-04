import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createAgentProjectContext } from "./agent.js";
import type { BuildReport } from "./check.js";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const releaseCandidateSchema = z.object({
  kind: z.literal("intentcut-release-candidate"), version: z.literal(1), project: z.string().min(1),
  manifestRevision: digest,
  media: z.object({ source: z.string().min(1), sha256: digest, bytes: z.number().int().nonnegative() }).strict(),
  validation: z.object({ mode: z.literal("final"), passed: z.literal(true), report: z.string().min(1) }).strict(),
  authority: z.object({ state: z.literal("release-candidate"), approved: z.literal(false), released: z.literal(false) }).strict(),
}).strict();

export const releaseApprovalSchema = z.object({
  kind: z.literal("intentcut-release-approval"), version: z.literal(1), project: z.string().min(1),
  candidateDigest: digest, manifestRevision: digest, mediaSha256: digest,
  approvedBy: z.string().min(1).max(200), approvedAt: z.string().datetime(),
  authority: z.object({ state: z.literal("human-approved"), approved: z.literal(true), released: z.literal(false) }).strict(),
}).strict();

export type ReleaseCandidate = z.infer<typeof releaseCandidateSchema>;
export type ReleaseApproval = z.infer<typeof releaseApprovalSchema>;

async function sha256File(filePath: string): Promise<string> {
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return `sha256:${hash.digest("hex")}`;
}

export function releaseCandidateDigest(candidate: ReleaseCandidate): string {
  const validated = releaseCandidateSchema.parse(candidate);
  return `sha256:${createHash("sha256").update(JSON.stringify(validated)).digest("hex")}`;
}

export function releaseCandidateToken(candidate: ReleaseCandidate): string {
  return releaseCandidateDigest(candidate).slice("sha256:".length, "sha256:".length + 12);
}

export async function createReleaseCandidate(project: LoadedProject, report: BuildReport): Promise<ReleaseCandidate> {
  if (!report.passed) throw new Error("Release candidate blocked: the current build report failed.");
  if (report.mode !== "final") throw new Error("Release candidate blocked: run validation in final mode.");
  const outputPath = resolveProjectPath(project, project.manifest.output.file);
  if (path.resolve(report.output) !== outputPath) throw new Error("Release candidate blocked: build report output does not match the manifest.");
  const media = await stat(outputPath);
  if (!media.isFile()) throw new Error("Release candidate blocked: rendered output is not a regular file.");
  return {
    kind: "intentcut-release-candidate", version: 1, project: project.manifest.project.title,
    manifestRevision: createAgentProjectContext(project).project.revision,
    media: { source: project.manifest.output.file, sha256: await sha256File(outputPath), bytes: media.size },
    validation: { mode: "final", passed: true, report: path.join(project.manifest.output.reportDirectory, "build-report.json") },
    authority: { state: "release-candidate", approved: false, released: false },
  };
}

export async function writeReleaseCandidate(project: LoadedProject, candidate: ReleaseCandidate): Promise<string> {
  const validated = releaseCandidateSchema.parse(candidate);
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  const output = path.join(reportDirectory, "release-candidate.json");
  await writeFile(output, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
  return output;
}

export async function loadReleaseCandidate(candidatePath: string): Promise<ReleaseCandidate> {
  return releaseCandidateSchema.parse(JSON.parse(await readFile(path.resolve(candidatePath), "utf8")) as unknown);
}

export async function approveReleaseCandidate(
  project: LoadedProject,
  candidate: ReleaseCandidate,
  approvedBy: string,
  confirmationToken: string,
  now = new Date(),
): Promise<ReleaseApproval> {
  const validated = releaseCandidateSchema.parse(candidate);
  if (!approvedBy.trim()) throw new Error("Approval requires the human approver's name.");
  if (confirmationToken !== releaseCandidateToken(validated)) throw new Error("Approval token does not match this exact release candidate.");
  const currentRevision = createAgentProjectContext(project).project.revision;
  if (validated.manifestRevision !== currentRevision) throw new Error("Release candidate is stale: project intent changed after candidate creation.");
  if (validated.project !== project.manifest.project.title) throw new Error("Release candidate project does not match the current manifest.");
  if (validated.media.source !== project.manifest.output.file) throw new Error("Release candidate media source does not match the current manifest.");
  const outputPath = resolveProjectPath(project, project.manifest.output.file);
  const media = await stat(outputPath);
  const currentSha256 = await sha256File(outputPath);
  if (currentSha256 !== validated.media.sha256 || media.size !== validated.media.bytes) {
    throw new Error("Release candidate is stale: rendered media changed after candidate creation.");
  }
  return {
    kind: "intentcut-release-approval", version: 1, project: validated.project,
    candidateDigest: releaseCandidateDigest(validated), manifestRevision: validated.manifestRevision,
    mediaSha256: validated.media.sha256, approvedBy: approvedBy.trim(), approvedAt: now.toISOString(),
    authority: { state: "human-approved", approved: true, released: false },
  };
}

export async function writeReleaseApproval(project: LoadedProject, approval: ReleaseApproval): Promise<string> {
  const validated = releaseApprovalSchema.parse(approval);
  const reportDirectory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  await mkdir(reportDirectory, { recursive: true });
  const output = path.join(reportDirectory, "release-approval.json");
  await writeFile(output, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return output;
}
