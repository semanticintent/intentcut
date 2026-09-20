import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatManifestIssues,
  projectManifestSchema,
  resolveArtifactPath,
  type LoadedProject,
} from "../src/manifest.js";
import { createRenderPlan } from "../src/render.js";
import { planNarration } from "../src/narration.js";
import type { TimelinePlan } from "../src/timeline.js";

const videoScene = (camera: unknown[]) => ({
  id: "demo",
  type: "video" as const,
  source: "demo.mov",
  camera,
});

const base = {
  version: 1 as const,
  project: {
    title: "Dry run",
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    maximumDuration: "5m",
  },
  output: { file: "renders/preview.mp4", codec: "h264" as const },
};

const move = (at: string, x: number) => ({
  at, duration: "8s", transition: "1s", zoom: 1.4, center: { x, y: 0.5 },
});

describe("multiple focus movements per scene", () => {
  it("accepts several ordered, non-overlapping movements", () => {
    const manifest = projectManifestSchema.parse({
      ...base,
      scenes: [videoScene([move("6s", 0.5), move("24s", 0.78)])],
    });
    expect(manifest.scenes[0]).toMatchObject({ camera: [{ at: "6s" }, { at: "24s" }] });
  });

  it("rejects a movement that starts before the previous one ends", () => {
    expect(() => projectManifestSchema.parse({
      ...base,
      scenes: [videoScene([move("6s", 0.5), move("12s", 0.78)])],
    })).toThrow("must not overlap");
  });

  it("compiles every declared movement into the zoompan expression", () => {
    const manifest = projectManifestSchema.parse({
      ...base,
      scenes: [videoScene([move("6s", 0.5), move("24s", 0.78)])],
    });
    const project: LoadedProject = { manifest, manifestPath: "/work/p/intentcut.yaml", baseDirectory: "/work/p" };
    const timeline: TimelinePlan = {
      title: "Dry run",
      durationMilliseconds: 40_000,
      maximumDurationMilliseconds: 300_000,
      withinMaximumDuration: true,
      canvas: { width: 1920, height: 1080, fps: 30 },
      scenes: [{
        id: "demo", type: "video", source: "demo.mov",
        startMilliseconds: 0, endMilliseconds: 40_000, durationMilliseconds: 40_000, speed: 1,
      }],
      annotations: [],
    };
    const graph = createRenderPlan(project, timeline).arguments[
      createRenderPlan(project, timeline).arguments.indexOf("-filter_complex") + 1
    ] ?? "";
    expect(graph).toContain("0.5*iw");
    expect(graph).toContain("0.78*iw");
  });
});

describe("missing narration audio", () => {
  it("names the command that produces it instead of surfacing a probe failure", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-narration-"));
    await mkdir(path.join(directory, "narration"), { recursive: true });
    await writeFile(path.join(directory, "narration", "opening.md"), "Hello.", "utf8");
    const manifest = projectManifestSchema.parse({
      ...base,
      scenes: [{ id: "opening", type: "image", source: "opening.png", duration: "8s" }],
      audio: { narration: { sections: [{ id: "opening", scene: "opening", script: "narration/opening.md" }] } },
    });
    const project: LoadedProject = {
      manifest, manifestPath: path.join(directory, "intentcut.yaml"), baseDirectory: directory,
    };
    const timeline: TimelinePlan = {
      title: "Dry run",
      durationMilliseconds: 8_000,
      maximumDurationMilliseconds: 300_000,
      withinMaximumDuration: true,
      canvas: { width: 1920, height: 1080, fps: 30 },
      scenes: [{
        id: "opening", type: "image", source: "opening.png",
        startMilliseconds: 0, endMilliseconds: 8_000, durationMilliseconds: 8_000, speed: 1,
      }],
      annotations: [],
    };
    await expect(planNarration(project, timeline)).rejects.toThrow("narrate <manifest> --temporary");
  });
});

describe("project artifact paths", () => {
  const projectFor = (directory: string): LoadedProject => ({
    manifest: projectManifestSchema.parse({
      ...base,
      scenes: [{ id: "opening", type: "image", source: "opening.png", duration: "8s" }],
    }),
    manifestPath: path.join(directory, "intentcut.yaml"),
    baseDirectory: directory,
  });

  it("resolves a relative argument against the project, not the working directory", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-artifact-"));
    await mkdir(path.join(directory, "reports"), { recursive: true });
    const artifact = path.join(directory, "reports", "release-candidate-abc.json");
    await writeFile(artifact, "{}", "utf8");
    await expect(resolveArtifactPath(projectFor(directory), "reports/release-candidate-abc.json"))
      .resolves.toBe(artifact);
  });

  it("names both locations it tried when the file is absent", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "intentcut-artifact-"));
    await expect(resolveArtifactPath(projectFor(directory), "reports/missing.json"))
      .rejects.toThrow("tried");
  });
});

describe("manifest validation messages", () => {
  it("reports the file and a readable field path", () => {
    const result = projectManifestSchema.safeParse({
      ...base,
      scenes: [videoScene([move("6s", 0.5), move("12s", 0.78)])],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    const formatted = formatManifestIssues(result.error, "/work/p/intentcut.yaml");
    expect(formatted).toContain("/work/p/intentcut.yaml is not a valid IntentCut manifest:");
    expect(formatted).toContain("scenes[0].camera[1].at");
  });
});
