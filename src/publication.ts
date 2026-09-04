import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LoadedProject } from "./manifest.js";
import { releaseReceiptDigest, releaseReceiptSchema, type ReleaseReceipt } from "./release.js";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^release-[a-f0-9]{12}$/);

export const publicationIntentSchema = z.object({
  kind: z.literal("intentcut-publication-intent"), version: z.literal(1), project: z.string().min(1),
  releaseId, releaseReceiptDigest: digest,
  adapter: z.object({ id: z.literal("directory"), target: z.string().min(1) }).strict(),
  authorizedBy: z.string().min(1).max(200), authorizedAt: z.string().datetime(),
  authority: z.object({ state: z.literal("publication-authorized"), published: z.literal(false) }).strict(),
}).strict();

export const publicationReceiptSchema = z.object({
  kind: z.literal("intentcut-publication-receipt"), version: z.literal(1), project: z.string().min(1),
  releaseId, releaseReceiptDigest: digest, publicationIntentDigest: digest,
  adapter: z.object({ id: z.literal("directory"), target: z.string().min(1), location: z.string().min(1) }).strict(),
  media: z.object({ sha256: digest, bytes: z.number().int().nonnegative() }).strict(),
  publishedBy: z.string().min(1), publishedAt: z.string().datetime(),
  authority: z.object({ state: z.literal("published"), published: z.literal(true) }).strict(),
}).strict();

export type PublicationIntent = z.infer<typeof publicationIntentSchema>;
export type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;
export type PublicationAdapterResult = { location: string; sha256: string; bytes: number; rollback: () => Promise<void> };
export interface PublicationAdapter {
  readonly id: "directory";
  publish(source: string, release: ReleaseReceipt, target: string): Promise<PublicationAdapterResult>;
}

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

function releaseDirectory(project: LoadedProject, release: ReleaseReceipt): string {
  return path.join(project.baseDirectory, "releases", release.releaseId);
}

async function verifySealedArtifact(project: LoadedProject, release: ReleaseReceipt): Promise<string> {
  const validated = releaseReceiptSchema.parse(release);
  if (validated.project !== project.manifest.project.title) throw new Error("Publication blocked: release project does not match the manifest.");
  const directory = releaseDirectory(project, validated);
  const artifact = path.resolve(project.baseDirectory, validated.media.artifact);
  const relative = path.relative(directory, artifact);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Publication blocked: release artifact is outside its sealed bundle.");
  const media = await stat(artifact);
  const sha256 = await sha256File(artifact);
  if (!media.isFile() || media.size !== validated.media.bytes || sha256 !== validated.media.sha256) {
    throw new Error("Publication blocked: sealed release artifact changed.");
  }
  return artifact;
}

export function publicationIntentDigest(intent: PublicationIntent): string {
  const validated = publicationIntentSchema.parse(intent);
  return `sha256:${createHash("sha256").update(JSON.stringify(validated)).digest("hex")}`;
}

export async function authorizePublication(
  project: LoadedProject,
  release: ReleaseReceipt,
  target: string,
  authorizedBy: string,
  confirmation: string,
  now = new Date(),
): Promise<PublicationIntent> {
  const validated = releaseReceiptSchema.parse(release);
  if (!authorizedBy.trim()) throw new Error("Publication authorization requires the human publisher's name.");
  if (confirmation !== validated.releaseId) throw new Error("Publication confirmation must match the exact release id.");
  if (!target.trim()) throw new Error("Publication authorization requires an explicit directory target.");
  await verifySealedArtifact(project, validated);
  return publicationIntentSchema.parse({
    kind: "intentcut-publication-intent", version: 1, project: validated.project,
    releaseId: validated.releaseId, releaseReceiptDigest: releaseReceiptDigest(validated),
    adapter: { id: "directory", target: path.resolve(target) },
    authorizedBy: authorizedBy.trim(), authorizedAt: now.toISOString(),
    authority: { state: "publication-authorized", published: false },
  });
}

export async function writePublicationIntent(project: LoadedProject, release: ReleaseReceipt, intent: PublicationIntent): Promise<string> {
  const validated = publicationIntentSchema.parse(intent);
  if (validated.releaseId !== release.releaseId || validated.releaseReceiptDigest !== releaseReceiptDigest(release)) {
    throw new Error("Publication authorization does not name this exact release receipt.");
  }
  const output = path.join(releaseDirectory(project, release), "publication-intent-directory.json");
  await writeFile(output, `${JSON.stringify(validated, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return output;
}

export async function loadPublicationIntent(intentPath: string): Promise<PublicationIntent> {
  return publicationIntentSchema.parse(JSON.parse(await readFile(path.resolve(intentPath), "utf8")) as unknown);
}

export class DirectoryPublicationAdapter implements PublicationAdapter {
  readonly id = "directory" as const;

  async publish(source: string, release: ReleaseReceipt, target: string): Promise<PublicationAdapterResult> {
    const directory = path.join(path.resolve(target), release.releaseId);
    await mkdir(path.dirname(directory), { recursive: true });
    await mkdir(directory);
    const location = path.join(directory, path.basename(source));
    try {
      await copyFile(source, location, constants.COPYFILE_EXCL);
      const media = await stat(location);
      const sha256 = await sha256File(location);
      if (!media.isFile() || media.size !== release.media.bytes || sha256 !== release.media.sha256) {
        throw new Error("Publication failed: exported artifact identity does not match the sealed release.");
      }
      return { location, sha256, bytes: media.size, rollback: () => rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

export async function publishAuthorizedRelease(
  project: LoadedProject,
  release: ReleaseReceipt,
  intent: PublicationIntent,
  adapter: PublicationAdapter,
  now = new Date(),
): Promise<{ receipt: PublicationReceipt; receiptPath: string }> {
  const validatedRelease = releaseReceiptSchema.parse(release);
  const validatedIntent = publicationIntentSchema.parse(intent);
  if (validatedIntent.releaseId !== validatedRelease.releaseId || validatedIntent.project !== validatedRelease.project) {
    throw new Error("Publication blocked: intent does not name this release.");
  }
  if (validatedIntent.releaseReceiptDigest !== releaseReceiptDigest(validatedRelease)) throw new Error("Publication blocked: release receipt changed after authorization.");
  if (validatedIntent.adapter.id !== adapter.id) throw new Error("Publication blocked: authorized adapter does not match the selected adapter.");
  const source = await verifySealedArtifact(project, validatedRelease);
  const receiptPath = path.join(releaseDirectory(project, validatedRelease), "publication-receipt-directory.json");
  try {
    await stat(receiptPath);
    throw new Error("Publication blocked: a completion receipt already exists for this adapter.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const result = await adapter.publish(source, validatedRelease, validatedIntent.adapter.target);
  try {
    const receipt = publicationReceiptSchema.parse({
      kind: "intentcut-publication-receipt", version: 1, project: validatedRelease.project,
      releaseId: validatedRelease.releaseId, releaseReceiptDigest: releaseReceiptDigest(validatedRelease),
      publicationIntentDigest: publicationIntentDigest(validatedIntent),
      adapter: { id: adapter.id, target: validatedIntent.adapter.target, location: result.location },
      media: { sha256: result.sha256, bytes: result.bytes },
      publishedBy: validatedIntent.authorizedBy, publishedAt: now.toISOString(),
      authority: { state: "published", published: true },
    });
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    return { receipt, receiptPath };
  } catch (error) {
    await result.rollback();
    throw error;
  }
}
