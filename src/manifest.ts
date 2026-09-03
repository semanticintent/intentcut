import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
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
  output: z.object({
    file: z.string().min(1),
    codec: z.literal("h264").default("h264"),
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
});

export type ProjectManifest = z.infer<typeof projectManifestSchema>;
export type ProjectScene = ProjectManifest["scenes"][number];

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
