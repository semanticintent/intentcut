import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml, parseDocument } from "yaml";
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
  }).optional(),
});

const videoSceneSchema = baseSceneSchema.extend({
  type: z.literal("video"),
  source: z.string().min(1),
  trim: z.object({
    in: durationSchema.default("0s"),
    out: durationSchema.optional(),
  }).optional(),
  speed: z.number().positive().max(100).default(1),
  camera: z.array(z.object({
    at: durationSchema,
    duration: durationSchema,
    transition: durationSchema.default("500ms"),
    zoom: z.number().min(1.01).max(3),
    center: z.object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    }),
  })).max(1, "Milestone 4 supports one focus movement per video scene.").optional(),
});

const annotationSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/),
  at: durationSchema,
  duration: durationSchema,
  text: z.string().min(1).max(120),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
  tone: z.enum(["neutral", "accent", "warning"]).default("neutral"),
});

const narrationModeSchema = z.enum(["human-final", "synthetic-prototype"]);

const singleNarrationSchema = z.object({
  source: z.string().min(1),
  mode: narrationModeSchema,
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
}).superRefine((section, context) => {
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
}).superRefine((narration, context) => {
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
    }),
    fps: z.number().positive().max(240),
    maximumDuration: durationSchema,
  }),
  scenes: z.array(z.discriminatedUnion("type", [imageSceneSchema, videoSceneSchema])).min(1),
  annotations: z.array(annotationSchema).default([]),
  audio: z.object({
    narration: z.union([singleNarrationSchema, sectionedNarrationSchema]),
    loudness: z.object({
      integrated: z.number().min(-70).max(-5).default(-16),
      truePeak: z.number().min(-9).max(0).default(-1.5),
      range: z.number().min(1).max(50).default(7),
    }).default({ integrated: -16, truePeak: -1.5, range: 7 }),
  }).optional(),
  output: z.object({
    file: z.string().min(1),
    codec: z.literal("h264").default("h264"),
    reportDirectory: z.string().min(1).default("reports"),
    captions: z.object({
      file: z.string().min(1).default("captions.vtt"),
    }).optional(),
  }),
}).superRefine((manifest, context) => {
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
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type ProjectScene = ProjectManifest["scenes"][number];
export type Narration = NonNullable<ProjectManifest["audio"]>["narration"];
export type NarrationSection = Extract<Narration, { sections: unknown }>["sections"][number];

export interface LoadedProject {
  manifest: ProjectManifest;
  manifestPath: string;
  baseDirectory: string;
}

export async function loadProject(manifestPath: string): Promise<LoadedProject> {
  const absolutePath = path.resolve(manifestPath);
  const source = await readFile(absolutePath, "utf8");
  const parsed = parseYaml(source) as unknown;
  const manifest = projectManifestSchema.parse(parsed);

  return {
    manifest,
    manifestPath: absolutePath,
    baseDirectory: path.dirname(absolutePath),
  };
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
  const parsed = projectManifestSchema.parse(document.toJS() as unknown);
  const narration = parsed.audio?.narration;

  if (!narration || !("sections" in narration)) {
    throw new Error("The project does not use sectioned narration.");
  }

  const index = narration.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) {
    throw new Error(`Unknown narration section "${sectionId}".`);
  }

  document.setIn(["audio", "narration", "sections", index, "mode"], "human-final");
  document.setIn(["audio", "narration", "sections", index, "source"], source);
  const updated = document.toString({ lineWidth: 0 });
  projectManifestSchema.parse(parseYaml(updated) as unknown);
  await writeFile(absolutePath, updated, "utf8");
}
