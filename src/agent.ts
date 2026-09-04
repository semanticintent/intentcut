import { createHash } from "node:crypto";
import type { LoadedProject } from "./manifest.js";

export type AgentCapabilityEffect = "read" | "propose" | "execute" | "consequential";
export type AgentCapabilityAvailability = "available" | "unavailable" | "human-only";

export interface AgentCapability {
  name: string;
  effect: AgentCapabilityEffect;
  availability: AgentCapabilityAvailability;
  reason: string;
}

export interface AgentProjectContext {
  kind: "intentcut-agent-context";
  version: 1;
  project: {
    title: string;
    manifestVersion: number;
    revision: string;
    target: {
      width: number;
      height: number;
      fps: number;
      maximumDuration: string;
    };
  };
  scenes: Array<{
    id: string;
    type: "image" | "video";
    source: string;
    captureDeclared: boolean;
    narrationSections: string[];
  }>;
  authority: {
    state: "read-only";
    manifestWrites: false;
    recordingControl: false;
    ingestionControl: false;
    renderingControl: false;
    approval: "human-only";
    release: "human-only";
  };
  capabilities: AgentCapability[];
}

function revisionFor(project: LoadedProject): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(project.manifest)).digest("hex")}`;
}

export function createAgentProjectContext(project: LoadedProject): AgentProjectContext {
  const narration = project.manifest.audio?.narration;
  const narrationByScene = new Map<string, string[]>();
  if (narration && "sections" in narration) {
    for (const section of narration.sections) {
      const ids = narrationByScene.get(section.scene) ?? [];
      ids.push(section.id);
      narrationByScene.set(section.scene, ids);
    }
  }
  const captureScenes = new Set(project.manifest.capture?.takes.map((take) => take.scene) ?? []);

  return {
    kind: "intentcut-agent-context",
    version: 1,
    project: {
      title: project.manifest.project.title,
      manifestVersion: project.manifest.version,
      revision: revisionFor(project),
      target: {
        width: project.manifest.project.resolution.width,
        height: project.manifest.project.resolution.height,
        fps: project.manifest.project.fps,
        maximumDuration: project.manifest.project.maximumDuration,
      },
    },
    scenes: project.manifest.scenes.map((scene) => ({
      id: scene.id,
      type: scene.type,
      source: scene.source,
      captureDeclared: captureScenes.has(scene.id),
      narrationSections: narrationByScene.get(scene.id) ?? [],
    })),
    authority: {
      state: "read-only",
      manifestWrites: false,
      recordingControl: false,
      ingestionControl: false,
      renderingControl: false,
      approval: "human-only",
      release: "human-only",
    },
    capabilities: [
      { name: "project.read", effect: "read", availability: "available", reason: "Returns validated declarative project context." },
      { name: "capture.topology.read", effect: "read", availability: "available", reason: "Returns which scenes have declared capture intent without connecting to capture software." },
      { name: "edit.propose", effect: "propose", availability: "unavailable", reason: "A revision-bound proposal protocol is not yet enabled." },
      { name: "preview.render", effect: "execute", availability: "unavailable", reason: "This interface grants no process execution." },
      { name: "recording.control", effect: "execute", availability: "unavailable", reason: "OBS authority is not exposed to agents." },
      { name: "media.ingest", effect: "execute", availability: "unavailable", reason: "Ingestion requires a separate human-invoked command." },
      { name: "release.approve", effect: "consequential", availability: "human-only", reason: "Only the creator can approve a candidate." },
      { name: "release.publish", effect: "consequential", availability: "human-only", reason: "IntentCut does not grant publication authority to agents." },
    ],
  };
}
