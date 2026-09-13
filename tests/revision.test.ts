import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createAgentProjectContext } from "../src/agent.js";
import { loadProject } from "../src/manifest.js";

const manifest = `version: 1
project:
  title: Revision
  resolution: { width: 1920, height: 1080 }
  fps: 30
  maximumDuration: 20s
scenes:
  - { id: opening, type: image, source: opening.png, duration: 8s }
audio:
  narration:
    sections:
      - { id: voice, scene: opening, script: narration/voice.md, mode: synthetic-prototype }
output: { file: renders/preview.mp4 }
`;

async function revision(manifestPath: string): Promise<string> {
  return createAgentProjectContext(await loadProject(manifestPath)).project.revision;
}

describe("semantic revision", () => {
  it("changes when a referenced narration script is rewritten, not only when YAML changes", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "intentcut-revision-"));
    const manifestPath = path.join(directory, "intentcut.yaml");
    await writeFile(manifestPath, manifest, "utf8");
    const missing = await revision(manifestPath);

    await mkdir(path.join(directory, "narration"));
    await writeFile(path.join(directory, "narration/voice.md"), "First wording.");
    const first = await revision(manifestPath);
    expect(first).not.toBe(missing);
    expect(await revision(manifestPath)).toBe(first);

    await writeFile(path.join(directory, "narration/voice.md"), "Rewritten wording.");
    expect(await revision(manifestPath)).not.toBe(first);
  });
});
