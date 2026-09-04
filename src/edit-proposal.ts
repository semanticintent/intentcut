import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { createAgentProjectContext } from "./agent.js";
import { parseDuration } from "./duration.js";
import type { LoadedProject } from "./manifest.js";

const duration = z.string().regex(/^(\d+(?:\.\d+)?)(ms|s|m)$/, "Use a duration such as 500ms, 4s, or 2.5m.");
const identifier = z.string().min(1).regex(/^[a-z0-9][a-z0-9-]*$/);

const setTrim = z.object({
  id: identifier,
  operation: z.literal("scene.set-trim"),
  sceneId: identifier,
  trim: z.object({ in: duration.optional(), out: duration.optional() }).strict(),
}).strict().refine((value) => value.trim.in !== undefined || value.trim.out !== undefined, {
  message: "A trim proposal must provide in, out, or both.", path: ["trim"],
});

const setSpeed = z.object({
  id: identifier,
  operation: z.literal("scene.set-speed"),
  sceneId: identifier,
  speed: z.number().positive().max(100),
}).strict();

const camera = z.object({
  at: duration,
  duration,
  transition: duration.default("500ms"),
  zoom: z.number().min(1.01).max(3),
  center: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).strict(),
}).strict();

const setCamera = z.object({
  id: identifier,
  operation: z.literal("scene.set-camera"),
  sceneId: identifier,
  camera: camera.nullable(),
}).strict();

const annotation = z.object({
  id: identifier,
  at: duration,
  duration,
  text: z.string().min(1).max(120),
  position: z.enum(["top-left", "top-right", "bottom-left", "bottom-right", "center"]),
  tone: z.enum(["neutral", "accent", "warning"]).default("neutral"),
}).strict();

const upsertAnnotation = z.object({
  id: identifier,
  operation: z.literal("annotation.upsert"),
  annotation,
}).strict();

const removeAnnotation = z.object({
  id: identifier,
  operation: z.literal("annotation.remove"),
  annotationId: identifier,
}).strict();

const setNarrationScript = z.object({
  id: identifier,
  operation: z.literal("narration.set-script"),
  sectionId: identifier,
  script: z.string().min(1),
}).strict();

export const agentEditOperationSchema = z.discriminatedUnion("operation", [
  setTrim, setSpeed, setCamera, upsertAnnotation, removeAnnotation, setNarrationScript,
]);

export const agentEditProposalSchema = z.object({
  kind: z.literal("intentcut-edit-proposal"),
  version: z.literal(1),
  expectedRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  summary: z.string().min(1).max(500),
  operations: z.array(agentEditOperationSchema).min(1).max(50),
  authority: z.object({ state: z.literal("proposed-only"), applied: z.literal(false) }).strict(),
}).strict();

export type AgentEditOperation = z.infer<typeof agentEditOperationSchema>;
export type AgentEditProposal = z.infer<typeof agentEditProposalSchema>;

export interface EditProposalIssue {
  path: string;
  message: string;
}

export interface EditProposalValidation {
  kind: "intentcut-edit-proposal-validation";
  version: 1;
  valid: boolean;
  actualRevision: string;
  expectedRevision?: string;
  operationCount: number;
  authority: { state: "validation-only"; applied: false; manifestWritten: false };
  issues: EditProposalIssue[];
}

function issue(pathSegments: PropertyKey[], message: string): EditProposalIssue {
  return { path: pathSegments.map(String).join("."), message };
}

function validateOperation(project: LoadedProject, operation: AgentEditOperation, index: number): EditProposalIssue[] {
  const prefix = ["operations", index];
  const issues: EditProposalIssue[] = [];
  if (operation.operation === "scene.set-trim" || operation.operation === "scene.set-speed" || operation.operation === "scene.set-camera") {
    const scene = project.manifest.scenes.find((candidate) => candidate.id === operation.sceneId);
    if (!scene) return [issue([...prefix, "sceneId"], `Unknown scene "${operation.sceneId}".`)];
    if (scene.type !== "video") return [issue([...prefix, "sceneId"], `Scene "${operation.sceneId}" is not a video scene.`)];
    if (operation.operation === "scene.set-trim") {
      const input = operation.trim.in ?? scene.trim?.in ?? "0s";
      const output = operation.trim.out ?? scene.trim?.out;
      if (output && parseDuration(output) <= parseDuration(input)) {
        issues.push(issue([...prefix, "trim"], "Trim out must be later than trim in."));
      }
    }
    return issues;
  }
  if (operation.operation === "annotation.remove") {
    if (!project.manifest.annotations.some((annotationValue) => annotationValue.id === operation.annotationId)) {
      issues.push(issue([...prefix, "annotationId"], `Unknown annotation "${operation.annotationId}".`));
    }
    return issues;
  }
  if (operation.operation === "narration.set-script") {
    const narration = project.manifest.audio?.narration;
    if (!narration || !("sections" in narration) || !narration.sections.some((section) => section.id === operation.sectionId)) {
      issues.push(issue([...prefix, "sectionId"], `Unknown narration section "${operation.sectionId}".`));
    }
  }
  return issues;
}

export function validateAgentEditProposal(project: LoadedProject, input: unknown): EditProposalValidation {
  const actualRevision = createAgentProjectContext(project).project.revision;
  const parsed = agentEditProposalSchema.safeParse(input);
  if (!parsed.success) {
    return {
      kind: "intentcut-edit-proposal-validation", version: 1, valid: false, actualRevision,
      operationCount: 0, authority: { state: "validation-only", applied: false, manifestWritten: false },
      issues: parsed.error.issues.map((entry) => issue(entry.path, entry.message)),
    };
  }

  const issues: EditProposalIssue[] = [];
  if (parsed.data.expectedRevision !== actualRevision) {
    issues.push(issue(["expectedRevision"], "Proposal revision does not match the current validated manifest."));
  }
  const operationIds = new Set<string>();
  parsed.data.operations.forEach((operation, index) => {
    if (operationIds.has(operation.id)) issues.push(issue(["operations", index, "id"], `Duplicate operation id "${operation.id}".`));
    operationIds.add(operation.id);
    issues.push(...validateOperation(project, operation, index));
  });

  return {
    kind: "intentcut-edit-proposal-validation", version: 1, valid: issues.length === 0,
    actualRevision, expectedRevision: parsed.data.expectedRevision,
    operationCount: parsed.data.operations.length,
    authority: { state: "validation-only", applied: false, manifestWritten: false }, issues,
  };
}

export async function loadAgentEditProposal(proposalPath: string): Promise<unknown> {
  return JSON.parse(await readFile(path.resolve(proposalPath), "utf8")) as unknown;
}
