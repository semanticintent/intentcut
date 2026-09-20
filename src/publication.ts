import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { LoadedProject } from "./manifest.js";
import { releaseReceiptDigest, releaseReceiptSchema, type ReleaseReceipt } from "./release.js";

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const releaseId = z.string().regex(/^release-[a-f0-9]{12}$/);
const adapterId = z.enum(["directory", "external"]);

/**
 * Who moved the bytes. `directory` copies the artifact itself and can verify what it
 * wrote; `external` performs no upload at all, and records that a named human published
 * this exact sealed artifact somewhere they state. Keeping the distinction in the record
 * stops a receipt implying the tool did something it did not do. Optional, so receipts
 * written before this existed still parse.
 */
const performedBy = z.enum(["by-intentcut", "by-hand"]);

export const publicationIntentSchema = z.object({
  kind: z.literal("intentcut-publication-intent"), version: z.literal(1), project: z.string().min(1),
  releaseId, releaseReceiptDigest: digest,
  adapter: z.object({ id: adapterId, target: z.string().min(1) }).strict(),
  authorizedBy: z.string().min(1).max(200), authorizedAt: z.string().datetime(),
  authority: z.object({ state: z.literal("publication-authorized"), published: z.literal(false) }).strict(),
}).strict();

export const publicationReceiptSchema = z.object({
  kind: z.literal("intentcut-publication-receipt"), version: z.literal(1), project: z.string().min(1),
  releaseId, releaseReceiptDigest: digest, publicationIntentDigest: digest,
  adapter: z.object({ id: adapterId, target: z.string().min(1), location: z.string().min(1), performed: performedBy.optional() }).strict(),
  media: z.object({ sha256: digest, bytes: z.number().int().nonnegative() }).strict(),
  publishedBy: z.string().min(1), publishedAt: z.string().datetime(),
  authority: z.object({ state: z.literal("published"), published: z.literal(true) }).strict(),
}).strict();

export type PublicationIntent = z.infer<typeof publicationIntentSchema>;
export type PublicationReceipt = z.infer<typeof publicationReceiptSchema>;
export type PublicationAdapterId = z.infer<typeof adapterId>;
export type PublicationAdapterResult = {
  location: string;
  sha256: string;
  bytes: number;
  performed: z.infer<typeof performedBy>;
  rollback: () => Promise<void>;
};
export interface PublicationAdapter {
  readonly id: PublicationAdapterId;
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

/** A directory target is a path on this machine; an external one is a stated location. */
function resolveTarget(adapter: PublicationAdapterId, target: string): string {
  if (adapter === "directory") return path.resolve(target);
  const trimmed = target.trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Publication authorization requires an absolute http(s) URL for an external target: ${trimmed}`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`An external publication target must be an http(s) URL: ${trimmed}`);
  }
  return url.toString();
}

export async function authorizePublication(
  project: LoadedProject,
  release: ReleaseReceipt,
  target: string,
  authorizedBy: string,
  confirmation: string,
  now = new Date(),
  adapter: PublicationAdapterId = "directory",
): Promise<PublicationIntent> {
  const validated = releaseReceiptSchema.parse(release);
  if (!authorizedBy.trim()) throw new Error("Publication authorization requires the human publisher's name.");
  if (confirmation !== validated.releaseId) throw new Error("Publication confirmation must match the exact release id.");
  if (!target.trim()) throw new Error("Publication authorization requires an explicit target.");
  await verifySealedArtifact(project, validated);
  return publicationIntentSchema.parse({
    kind: "intentcut-publication-intent", version: 1, project: validated.project,
    releaseId: validated.releaseId, releaseReceiptDigest: releaseReceiptDigest(validated),
    adapter: { id: adapter, target: resolveTarget(adapter, target) },
    authorizedBy: authorizedBy.trim(), authorizedAt: now.toISOString(),
    authority: { state: "publication-authorized", published: false },
  });
}

export async function writePublicationIntent(project: LoadedProject, release: ReleaseReceipt, intent: PublicationIntent): Promise<string> {
  const validated = publicationIntentSchema.parse(intent);
  if (validated.releaseId !== release.releaseId || validated.releaseReceiptDigest !== releaseReceiptDigest(release)) {
    throw new Error("Publication authorization does not name this exact release receipt.");
  }
  const output = path.join(releaseDirectory(project, release), `publication-intent-${validated.adapter.id}.json`);
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
      return { location, sha256, bytes: media.size, performed: "by-intentcut", rollback: () => rm(directory, { recursive: true, force: true }) };
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw error;
    }
  }
}

/**
 * Records a publication that a human performed, and performs none itself. It uploads
 * nothing, opens no socket, and does not check that the stated location resolves — it
 * cannot, without making the network request this tool has never made. What it asserts
 * is narrower and checkable: this exact sealed artifact, by this hash, is what the named
 * person says they put at that location. The claim is theirs; the binding is the record's.
 */
export class ExternalPublicationAdapter implements PublicationAdapter {
  readonly id = "external" as const;

  async publish(source: string, release: ReleaseReceipt, target: string): Promise<PublicationAdapterResult> {
    const media = await stat(source);
    const sha256 = await sha256File(source);
    if (!media.isFile() || media.size !== release.media.bytes || sha256 !== release.media.sha256) {
      throw new Error("Publication failed: the sealed artifact does not match its receipt.");
    }
    return { location: target, sha256, bytes: media.size, performed: "by-hand", rollback: async () => {} };
  }
}

export function publicationAdapterFor(id: PublicationAdapterId): PublicationAdapter {
  return id === "external" ? new ExternalPublicationAdapter() : new DirectoryPublicationAdapter();
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
  const receiptPath = path.join(releaseDirectory(project, validatedRelease), `publication-receipt-${adapter.id}.json`);
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
      adapter: { id: adapter.id, target: validatedIntent.adapter.target, location: result.location, performed: result.performed },
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
