import { createHash } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";
import { parseDuration } from "./duration.js";
import { z } from "zod";

const durationSchema = z.string().regex(
  /^(\d+(?:\.\d+)?)(ms|s|m)$/,
  "Use a duration such as 500ms, 4s, or 2.5m.",
);

const baseSceneSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
});

const imageSceneSchema = baseSceneSchema.extend({
  type: z.literal("image"),
  source: z.string().min(1),
  duration: durationSchema,
  motion: z.object({
    type: z.enum(["none", "push-in", "pull-out"]),
    from: z.number().positive().optional(),
    to: z.number().positive().optional(),
  }).strict().optional(),
}).strict();

const videoSceneSchema = baseSceneSchema.extend({
  type: z.literal("video"),
  source: z.string().min(1),
  trim: z.object({
    in: durationSchema.default("0s"),
    out: durationSchema.optional(),
  }).strict().optional(),
  speed: z.number().positive().max(100).default(1),
  camera: z.array(z.object({
    at: durationSchema,
    duration: durationSchema,
    transition: durationSchema.default("500ms"),
    zoom: z.number().min(1.01).max(3),
    center: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }).strict(),
  }).strict()).max(8, "A video scene supports at most eight focus movements.").optional(),
}).strict().superRefine((scene, context) => {
  // Focus movements are compiled into a single ordered zoompan expression, so they
  // must be declared in order and must not overlap one another.
  let previousEnd = -1;
  scene.camera?.forEach((focus, index) => {
    const start = parseDuration(focus.at);
    const end = start + parseDuration(focus.duration) + (2 * parseDuration(focus.transition));
    if (start < previousEnd) {
      context.addIssue({
        code: "custom",
        message: "Focus movements must be declared in order and must not overlap the previous movement.",
        path: ["camera", index, "at"],
      });
    }
    previousEnd = end;
  });
});

const annotationSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  at: durationSchema,
  duration: durationSchema,
  text: z.string().min(1).max(120),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
  tone: z.enum(["neutral", "accent", "warning"]).default("neutral"),
}).strict();

/**
 * `synthetic-prototype` is scratch: a timing instrument that a final render refuses.
 * `synthetic-final` is a deliberate editorial decision — a declared voice the creator
 * has chosen to ship — and CONCEPT.md always listed that choice as the human's to make.
 * The distinction the final render enforces is therefore not "is it a person?" but
 * "was this voice declared and chosen?", so a scratch track can never ship by accident.
 */
const narrationModeSchema = z.enum(["human-final", "synthetic-prototype", "synthetic-final"]);

/** Which voice synthesised the narration. Required before any section may ship. */
const narrationSynthesisSchema = z.object({
  provider: z.string().min(1).max(60),
  model: z.string().min(1).max(120).optional(),
  voice: z.string().min(1).max(120).optional(),
}).strict();

const singleNarrationSchema = z.object({
  source: z.string().min(1),
  mode: narrationModeSchema,
  synthesis: narrationSynthesisSchema.optional(),
}).strict().superRefine((narration, context) => {
  if (narration.mode === "synthetic-final" && !narration.synthesis) {
    context.addIssue({
      code: "custom",
      message: "Shipping a synthesised voice requires declaring it: add synthesis with at least a provider.",
      path: ["synthesis"],
    });
  }
});

const narrationSectionSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  scene: z.string().min(1),
  script: z.string().min(1),
  offset: durationSchema.default("0s"),
  mode: narrationModeSchema.default("synthetic-prototype"),
  source: z.string().min(1).optional(),
  voice: z.string().min(1).optional(),
  rate: z.number().int().min(80).max(450).optional(),
}).strict().superRefine((section, context) => {
  if (section.mode === "human-final" && !section.source) {
    context.addIssue({
      code: "custom",
      message: "Human-final narration requires a source file.",
      path: ["source"],
    });
  }
});

const sectionedNarrationSchema = z.object({
  sections: z.array(narrationSectionSchema).min(1),
  generatedDirectory: z.string().min(1).default("narration/generated"),
  synthesis: narrationSynthesisSchema.optional(),
}).strict().superRefine((narration, context) => {
  narration.sections.forEach((section, index) => {
    if (section.mode === "synthetic-final" && !narration.synthesis) {
      context.addIssue({
        code: "custom",
        message: "Shipping a synthesised voice requires declaring it: add audio.narration.synthesis with at least a provider.",
        path: ["sections", index, "mode"],
      });
    }
  });
  const ids = new Set<string>();
  narration.sections.forEach((section, index) => {
    if (ids.has(section.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate narration section id "${section.id}".`,
        path: ["sections", index, "id"],
      });
    }
    ids.add(section.id);
  });
});

export const projectManifestSchema = z.object({
  version: z.literal(1),
  project: z.object({
    title: z.string().min(1),
    resolution: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }).strict(),
    fps: z.number().positive().max(240),
    maximumDuration: durationSchema,
  }).strict(),
  scenes: z.array(z.discriminatedUnion("type", [imageSceneSchema, videoSceneSchema])).min(1),
  annotations: z.array(annotationSchema).default([]),
  inspection: z.object({
    contactSheets: z.object({
      samples: z.number().int().min(4).max(36).default(12),
      columns: z.number().int().min(2).max(6).default(4),
      frameWidth: z.number().int().min(240).max(960).default(480),
    }).strict().default({ samples: 12, columns: 4, frameWidth: 480 }),
    cutDetection: z.object({
      threshold: z.number().min(0.01).max(1).default(0.18),
      minimumGap: durationSchema.default("1s"),
      maximumCandidates: z.number().int().min(1).max(100).default(20),
    }).strict().default({ threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }),
    silenceDetection: z.object({
      thresholdDb: z.number().min(-80).max(-10).default(-35),
      minimumDuration: durationSchema.default("500ms"),
    }).strict().default({ thresholdDb: -35, minimumDuration: "500ms" }),
    transcripts: z.array(z.object({
      scene: z.string().min(1),
      source: z.string().min(1),
      format: z.literal("webvtt").default("webvtt"),
      provider: z.string().min(1),
      model: z.string().min(1).optional(),
      provenance: z.enum(["human", "local-model", "hosted-model"]),
    }).strict()).default([]),
  }).strict().default({
    contactSheets: { samples: 12, columns: 4, frameWidth: 480 },
    cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 },
    silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" },
    transcripts: [],
  }),
  capture: z.object({
    preflight: z.array(z.string().min(1)).default([
      "Hide notifications and unrelated applications.",
      "Confirm the intended account and sample data are visible.",
      "Verify browser zoom and window placement.",
      "Perform one rehearsal before recording.",
    ]),
    takes: z.array(z.object({
      scene: z.string().min(1),
      objective: z.string().min(1),
      startState: z.string().min(1),
      actions: z.array(z.string().min(1)).min(1),
      visibleProof: z.array(z.string().min(1)).min(1),
      endState: z.string().min(1),
      privacyNotes: z.array(z.string().min(1)).default([]),
    }).strict()).default([]),
    obs: z.object({
      enabled: z.boolean().default(false),
      url: z.string().regex(/^wss?:\/\//, "OBS URL must use ws:// or wss://.").default("ws://127.0.0.1:4455"),
      passwordEnvironmentVariable: z.string().regex(/^[A-Z_][A-Z0-9_]*$/).optional(),
    }).strict().optional(),
  }).strict().optional(),
  audio: z.object({
    narration: z.union([singleNarrationSchema, sectionedNarrationSchema]),
    loudness: z.object({
      integrated: z.number().min(-70).max(-5).default(-16),
      truePeak: z.number().min(-9).max(0).default(-1.5),
      range: z.number().min(1).max(50).default(7),
    }).strict().default({ integrated: -16, truePeak: -1.5, range: 7 }),
  }).strict().optional(),
  output: z.object({
    file: z.string().min(1),
    codec: z.literal("h264").default("h264"),
    reportDirectory: z.string().min(1).default("reports"),
    captions: z.object({
      file: z.string().min(1).default("captions.vtt"),
    }).strict().optional(),
  }).strict(),
}).strict().superRefine((manifest, context) => {
  const ids = new Set<string>();

  manifest.scenes.forEach((scene, index) => {
    if (ids.has(scene.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate scene id "${scene.id}".`,
        path: ["scenes", index, "id"],
      });
    }
    ids.add(scene.id);
  });

  const narration = manifest.audio?.narration;
  if (narration && "sections" in narration) {
    const sceneIds = new Set(manifest.scenes.map((scene) => scene.id));
    narration.sections.forEach((section, index) => {
      if (!sceneIds.has(section.scene)) {
        context.addIssue({
          code: "custom",
          message: `Narration section references unknown scene "${section.scene}".`,
          path: ["audio", "narration", "sections", index, "scene"],
        });
      }
    });
  }

  const annotationIds = new Set<string>();
  manifest.annotations.forEach((annotation, index) => {
    if (annotationIds.has(annotation.id)) {
      context.addIssue({
        code: "custom",
        message: `Duplicate annotation id "${annotation.id}".`,
        path: ["annotations", index, "id"],
      });
    }
    annotationIds.add(annotation.id);
  });

  manifest.inspection.transcripts.forEach((transcript, index) => {
    if (!ids.has(transcript.scene)) {
      context.addIssue({
        code: "custom",
        message: `Transcript references unknown scene "${transcript.scene}".`,
        path: ["inspection", "transcripts", index, "scene"],
      });
    }
  });

  manifest.capture?.takes.forEach((take, index) => {
    const scene = manifest.scenes.find((candidate) => candidate.id === take.scene);
    if (!scene) {
      context.addIssue({ code: "custom", message: `Capture take references unknown scene "${take.scene}".`, path: ["capture", "takes", index, "scene"] });
    } else if (scene.type !== "video") {
      context.addIssue({ code: "custom", message: `Capture take must reference a video scene, not "${scene.type}".`, path: ["capture", "takes", index, "scene"] });
    }
  });
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type ProjectScene = ProjectManifest["scenes"][number];
export type Narration = NonNullable<ProjectManifest["audio"]>["narration"];
export type NarrationSection = Extract<Narration, { sections: unknown }>["sections"][number];
export type NarrationMode = z.infer<typeof narrationModeSchema>;
export type NarrationSynthesis = z.infer<typeof narrationSynthesisSchema>;

/** The declared voice for a section, whether narration is sectioned or a single track. */
export function declaredSynthesis(project: LoadedProject): NarrationSynthesis | undefined {
  return project.manifest.audio?.narration?.synthesis;
}

export interface LoadedProject {
  manifest: ProjectManifest;
  manifestPath: string;
  baseDirectory: string;
  /**
   * SHA-256 of small intent files the manifest references (narration scripts),
   * keyed by manifest-relative path; "missing" when absent. Folded into the
   * semantic revision so rewriting a script invalidates stale proposals and
   * approvals. Media contents are deliberately excluded — rendered media is
   * bound separately, by hash, at release time.
   */
  contentDigests?: Record<string, string>;
}

async function referencedContentDigests(manifest: ProjectManifest, baseDirectory: string): Promise<Record<string, string>> {
  const narration = manifest.audio?.narration;
  if (!narration || !("sections" in narration)) return {};
  const digests: Record<string, string> = {};
  for (const section of narration.sections) {
    try {
      const content = await readFile(path.resolve(baseDirectory, section.script));
      digests[section.script] = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      digests[section.script] = "missing";
    }
  }
  return digests;
}

/**
 * Zod reports a machine-readable issue list. A manifest author needs the file it came
 * from and a field path they can find by eye, so render one line per issue instead.
 */
export function formatManifestIssues(error: z.ZodError, manifestPath: string): string {
  const lines = error.issues.map((entry) => {
    const field = entry.path.reduce<string>((joined, segment) => (
      typeof segment === "number" ? `${joined}[${segment}]` : joined ? `${joined}.${String(segment)}` : String(segment)
    ), "");
    return `  ${field || "(root)"} — ${entry.message}`;
  });
  return [`${manifestPath} is not a valid IntentCut manifest:`, ...lines].join("\n");
}

function parseManifest(parsed: unknown, manifestPath: string): ProjectManifest {
  const result = projectManifestSchema.safeParse(parsed);
  if (result.success) return result.data;
  throw new Error(formatManifestIssues(result.error, manifestPath));
}

/**
 * Release and proposal artifacts live beside the project, but the CLI is usually run
 * from an IntentCut clone, so a bare `reports/...` argument would resolve against the
 * wrong directory. Prefer the project, fall back to the caller's own working directory.
 */
export async function resolveArtifactPath(project: LoadedProject, candidate: string): Promise<string> {
  if (path.isAbsolute(candidate)) return candidate;
  const projectRelative = path.resolve(project.baseDirectory, candidate);
  if (await stat(projectRelative).then((entry) => entry.isFile()).catch(() => false)) return projectRelative;
  const workingRelative = path.resolve(candidate);
  if (await stat(workingRelative).then((entry) => entry.isFile()).catch(() => false)) return workingRelative;
  throw new Error(`File not found, in the project or the working directory: ${candidate}\n  tried ${projectRelative}\n  tried ${workingRelative}`);
}

export async function loadProject(manifestPath: string): Promise<LoadedProject> {
  const absolutePath = path.resolve(manifestPath);
  const source = await readFile(absolutePath, "utf8");
  const parsed = parseYaml(source) as unknown;
  const manifest = parseManifest(parsed, absolutePath);
  const baseDirectory = path.dirname(absolutePath);

  return {
    manifest,
    manifestPath: absolutePath,
    baseDirectory,
    contentDigests: await referencedContentDigests(manifest, baseDirectory),
  };
}

/** True when `target` is `directory` itself or lies beneath it (lexically). */
export function isWithin(directory: string, target: string): boolean {
  const relative = path.relative(path.resolve(directory), path.resolve(target));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function resolveProjectPath(project: LoadedProject, source: string): string {
  return path.resolve(project.baseDirectory, source);
}

export async function replaceNarrationSection(
  manifestPath: string,
  sectionId: string,
  source: string,
): Promise<void> {
  const absolutePath = path.resolve(manifestPath);
  const text = await readFile(absolutePath, "utf8");
  const document = parseDocument(text);
  const parsed = parseManifest(document.toJS() as unknown, absolutePath);
  const narration = parsed.audio?.narration;

  if (!narration || !("sections" in narration)) {
    throw new Error("The project does not use sectioned narration.");
  }

  const index = narration.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) {
    throw new Error(`Unknown narration section "${sectionId}".`);
  }

  const baseDirectory = path.dirname(absolutePath);
  const sourcePath = path.resolve(baseDirectory, source);
  const sourceStat = await stat(sourcePath).catch(() => undefined);
  if (!sourceStat?.isFile()) throw new Error(`Human-final narration source does not exist: ${sourcePath}`);
  if (isWithin(path.resolve(baseDirectory, narration.generatedDirectory), sourcePath)) {
    throw new Error("Human-final narration cannot come from the generated temporary narration directory.");
  }

  document.setIn(["audio", "narration", "sections", index, "mode"], "human-final");
  document.setIn(["audio", "narration", "sections", index, "source"], source);
  const updated = document.toString({ lineWidth: 0 });
  parseManifest(parseYaml(updated) as unknown, absolutePath);
  await writeFile(absolutePath, updated, "utf8");
}
