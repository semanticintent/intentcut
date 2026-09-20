import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { projectManifestSchema, type LoadedProject } from "../src/manifest.js";
import {
  authorizePublication,
  ExternalPublicationAdapter,
  publicationAdapterFor,
  publishAuthorizedRelease,
  writePublicationIntent,
} from "../src/publication.js";
import { releaseReceiptSchema, releaseReceiptDigest, type ReleaseReceipt } from "../src/release.js";

const MEDIA = "a sealed artifact\n";
const sha256 = `sha256:${createHash("sha256").update(MEDIA).digest("hex")}`;

async function sealed(): Promise<{ project: LoadedProject; release: ReleaseReceipt }> {
  const directory = await mkdtemp(path.join(tmpdir(), "intentcut-external-"));
  const manifest = projectManifestSchema.parse({
    version: 1,
    project: { title: "Reach", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "5m" },
    scenes: [{ id: "only", type: "image", source: "only.png", duration: "4s" }],
    output: { file: "renders/out.mp4", codec: "h264" },
  });
  const releaseId = "release-abcdef123456";
  await mkdir(path.join(directory, "releases", releaseId), { recursive: true });
  await writeFile(path.join(directory, "releases", releaseId, "out.mp4"), MEDIA, "utf8");
  const release = releaseReceiptSchema.parse({
    kind: "intentcut-release-receipt", version: 1, releaseId, project: "Reach",
    candidateDigest: sha256, approvalDigest: sha256, manifestRevision: sha256,
    media: { source: "renders/out.mp4", artifact: `releases/${releaseId}/out.mp4`, sha256, bytes: Buffer.byteLength(MEDIA) },
    approval: { approvedBy: "Michael Shatny", approvedAt: new Date().toISOString() },
    sealedAt: new Date().toISOString(),
    authority: { state: "released", approved: true, released: true, published: false },
  });
  return { project: { manifest, manifestPath: path.join(directory, "intentcut.yaml"), baseDirectory: directory }, release };
}

describe("recording a publication performed by hand", () => {
  it("binds a named person and a stated URL to the exact sealed artifact", async () => {
    const { project, release } = await sealed();
    const intent = await authorizePublication(project, release, "https://youtu.be/abc123", "Michael Shatny", release.releaseId, new Date(), "external");
    expect(intent.adapter).toEqual({ id: "external", target: "https://youtu.be/abc123" });
    await writePublicationIntent(project, release, intent);

    const { receipt } = await publishAuthorizedRelease(project, release, intent, publicationAdapterFor("external"));
    expect(receipt.adapter.id).toBe("external");
    expect(receipt.adapter.location).toBe("https://youtu.be/abc123");
    // The record must say the tool did not do this, or it implies that it did.
    expect(receipt.adapter.performed).toBe("by-hand");
    expect(receipt.media.sha256).toBe(release.media.sha256);
    expect(receipt.publishedBy).toBe("Michael Shatny");
  });

  it("refuses a target that is not an http(s) URL", async () => {
    const { project, release } = await sealed();
    for (const target of ["./delivery", "youtu.be/abc123", "ftp://example.com/x.mp4"]) {
      await expect(authorizePublication(project, release, target, "Michael Shatny", release.releaseId, new Date(), "external"))
        .rejects.toThrow(/http\(s\) URL/);
    }
  });

  it("refuses to record a publication of an artifact that has changed", async () => {
    const { project, release } = await sealed();
    const intent = await authorizePublication(project, release, "https://youtu.be/abc123", "Michael Shatny", release.releaseId, new Date(), "external");
    const tampered = { ...release, media: { ...release.media, bytes: release.media.bytes + 1 } };
    await expect(publishAuthorizedRelease(project, tampered, intent, publicationAdapterFor("external")))
      .rejects.toThrow(/changed after authorization|sealed release artifact changed/);
  });

  it("uploads nothing: the adapter only reports what it was told", async () => {
    const { project, release } = await sealed();
    const artifact = path.join(project.baseDirectory, release.media.artifact);
    const result = await new ExternalPublicationAdapter().publish(artifact, release, "https://example.com/watch");
    expect(result.location).toBe("https://example.com/watch");
    expect(result.performed).toBe("by-hand");
    // Nothing was written, so rolling back is a no-op rather than a deletion.
    await expect(result.rollback()).resolves.toBeUndefined();
  });

  it("still copies, and says so, for a directory target", async () => {
    const { project, release } = await sealed();
    const destination = path.join(project.baseDirectory, "delivery");
    const intent = await authorizePublication(project, release, destination, "Michael Shatny", release.releaseId, new Date(), "directory");
    await writePublicationIntent(project, release, intent);
    const { receipt } = await publishAuthorizedRelease(project, release, intent, publicationAdapterFor("directory"));
    expect(receipt.adapter.performed).toBe("by-intentcut");
    expect(receipt.adapter.location).toContain(destination);
  });

  it("keeps each adapter's records apart, so one does not block the other", async () => {
    const { project, release } = await sealed();
    const external = await authorizePublication(project, release, "https://youtu.be/abc123", "Michael Shatny", release.releaseId, new Date(), "external");
    const directory = await authorizePublication(project, release, path.join(project.baseDirectory, "delivery"), "Michael Shatny", release.releaseId, new Date(), "directory");
    await writePublicationIntent(project, release, external);
    await writePublicationIntent(project, release, directory);
    await publishAuthorizedRelease(project, release, external, publicationAdapterFor("external"));
    await publishAuthorizedRelease(project, release, directory, publicationAdapterFor("directory"));
    expect(releaseReceiptDigest(release)).toBe(external.releaseReceiptDigest);
  });
});
