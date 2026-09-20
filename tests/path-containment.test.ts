/**
 * A manifest is source: it gets shared, copied between machines, and written by tools.
 * Left unchecked a relative path reaches anywhere the process can, and FFmpeg runs with
 * -y. These fix how far a manifest is allowed to reach.
 */
import { mkdtemp, mkdir, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadProject } from "../src/manifest.js";

const manifest = (body: string) => `version: 1
${body}
project:
  title: Reach
  resolution: { width: 1920, height: 1080 }
  fps: 30
  maximumDuration: 1m
scenes:
  - id: opening
    type: image
    source: SCENE_SOURCE
    duration: 4s
output:
  file: OUTPUT_FILE
  reportDirectory: REPORT_DIR
`;

async function project(
  { scene = "media/opening.png", output = "renders/out.mp4", reports = "reports", sources = "" } = {},
): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "intentcut-reach-"));
  const body = manifest(sources)
    .replace("SCENE_SOURCE", scene)
    .replace("OUTPUT_FILE", output)
    .replace("REPORT_DIR", reports);
  const file = path.join(directory, "intentcut.yaml");
  await writeFile(file, body, "utf8");
  return file;
}

const ALLOW = "sources:\n  outsideProject: allow";

describe("how far a manifest may reach", () => {
  it("loads a production that stays inside itself", async () => {
    await expect(loadProject(await project())).resolves.toMatchObject({ manifest: { project: { title: "Reach" } } });
  });

  it("refuses to render outside the project, with no way to permit it", async () => {
    await expect(loadProject(await project({ output: "../../escaped/out.mp4" })))
      .rejects.toThrow(/output\.file writes outside the project, which is never allowed/);
    // Even the declaration that permits outside reads does not permit outside writes.
    await expect(loadProject(await project({ output: "../../escaped/out.mp4", sources: ALLOW })))
      .rejects.toThrow(/never allowed/);
  });

  it("refuses to write reports or captions outside the project", async () => {
    await expect(loadProject(await project({ reports: "../../elsewhere" })))
      .rejects.toThrow(/output\.reportDirectory writes outside the project/);
  });

  it("refuses to read media from outside until that is declared", async () => {
    const file = await project({ scene: "../../../../etc/hosts.png" });
    await expect(loadProject(file)).rejects.toThrow(/reads 1 file\(s\) from outside its own directory/);
    await expect(loadProject(file)).rejects.toThrow(/outsideProject: allow/);
  });

  it("allows outside reads once the manifest states it", async () => {
    await expect(loadProject(await project({ scene: "../shared/opening.png", sources: ALLOW })))
      .resolves.toMatchObject({ manifest: { sources: { outsideProject: "allow" } } });
  });

  it("names every offending path, so one pass fixes them all", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-reach-"));
    await writeFile(path.join(directory, "intentcut.yaml"), `version: 1
project:
  title: Reach
  resolution: { width: 1920, height: 1080 }
  fps: 30
  maximumDuration: 1m
scenes:
  - id: a
    type: image
    source: ../outside-a.png
    duration: 2s
  - id: b
    type: image
    source: ../outside-b.png
    duration: 2s
output:
  file: renders/out.mp4
`, "utf8");
    await expect(loadProject(path.join(directory, "intentcut.yaml")))
      .rejects.toThrow(/reads 2 file\(s\)[\s\S]*outside-a\.png[\s\S]*outside-b\.png/);
  });

  it("refuses a write that escapes through a symlinked directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-reach-"));
    const outside = await mkdtemp(path.join(tmpdir(), "intentcut-outside-"));
    await mkdir(path.join(directory, "renders"), { recursive: true });
    await symlink(outside, path.join(directory, "escape"), "dir");
    await writeFile(path.join(directory, "intentcut.yaml"), `version: 1
project:
  title: Reach
  resolution: { width: 1920, height: 1080 }
  fps: 30
  maximumDuration: 1m
scenes:
  - id: opening
    type: image
    source: media/opening.png
    duration: 4s
output:
  file: escape/out.mp4
`, "utf8");
    await expect(loadProject(path.join(directory, "intentcut.yaml")))
      .rejects.toThrow(/resolves outside the project through a link/);
  });
});
