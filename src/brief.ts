import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LoadedProject } from "./manifest.js";
import { resolveProjectPath } from "./manifest.js";

export interface CaptureTake {
  id: string;
  sceneId: string;
  filename: string;
  objective: string;
  startState: string;
  actions: string[];
  visibleProof: string[];
  endState: string;
  privacyNotes: string[];
}

export interface CaptureBrief {
  version: 1;
  kind: "intentcut-capture-brief";
  project: string;
  authority: { state: "brief-only"; recordingControl: "manual" };
  captureTarget: { width: number; height: number; fps: number };
  preflight: Array<{ text: string; status: "pending" }>;
  takes: CaptureTake[];
}

export function createCaptureBrief(project: LoadedProject): CaptureBrief {
  const configured = new Map((project.manifest.capture?.takes ?? []).map((take) => [take.scene, take]));
  const takes = project.manifest.scenes.flatMap((scene): CaptureTake[] => {
    if (scene.type !== "video") return [];
    const take = configured.get(scene.id);
    if (!take) {
      return [{
        id: `take-${scene.id}`,
        sceneId: scene.id,
        filename: scene.source,
        objective: `Capture the ${scene.id} interaction required by the edit.`,
        startState: "Declare the exact starting state before recording.",
        actions: ["Perform the intended interaction without unrelated navigation."],
        visibleProof: ["Confirm the required result remains visible long enough to inspect."],
        endState: "Hold on the completed state before stopping the recording.",
        privacyNotes: [],
      }];
    }
    return [{
      id: `take-${scene.id}`,
      sceneId: scene.id,
      filename: scene.source,
      objective: take.objective,
      startState: take.startState,
      actions: [...take.actions],
      visibleProof: [...take.visibleProof],
      endState: take.endState,
      privacyNotes: [...take.privacyNotes],
    }];
  });

  const defaultPreflight = [
    "Hide notifications and unrelated applications.",
    "Confirm the intended account and sample data are visible.",
    "Verify browser zoom and window placement.",
    "Perform one rehearsal before recording.",
  ];
  return {
    version: 1,
    kind: "intentcut-capture-brief",
    project: project.manifest.project.title,
    authority: { state: "brief-only", recordingControl: "manual" },
    captureTarget: {
      width: project.manifest.project.resolution.width,
      height: project.manifest.project.resolution.height,
      fps: project.manifest.project.fps,
    },
    preflight: (project.manifest.capture?.preflight ?? defaultPreflight).map((text) => ({ text, status: "pending" })),
    takes,
  };
}

function markdown(brief: CaptureBrief): string {
  const lines = [
    `# IntentCut Capture Brief — ${brief.project}`,
    "",
    `**Authority:** ${brief.authority.state} · recording control: ${brief.authority.recordingControl}`,
    "",
    `**Target:** ${brief.captureTarget.width}×${brief.captureTarget.height} · ${brief.captureTarget.fps} fps`,
    "",
    "## Preflight",
    "",
    ...brief.preflight.map((item) => `- [ ] ${item.text}`),
    "",
  ];
  for (const [index, take] of brief.takes.entries()) {
    lines.push(`## ${String(index + 1).padStart(2, "0")} · ${take.sceneId}`, "");
    lines.push(`**File:** \`${take.filename}\``, "");
    lines.push(`**Objective:** ${take.objective}`, "");
    lines.push(`**Start state:** ${take.startState}`, "");
    lines.push("**Actions:**", "", ...take.actions.map((action, actionIndex) => `${actionIndex + 1}. ${action}`), "");
    lines.push("**Visible proof:**", "", ...take.visibleProof.map((proof) => `- [ ] ${proof}`), "");
    lines.push(`**End state:** ${take.endState}`, "");
    if (take.privacyNotes.length) lines.push("**Privacy notes:**", "", ...take.privacyNotes.map((note) => `- [ ] ${note}`), "");
  }
  return `${lines.join("\n")}\n`;
}

export async function writeCaptureBrief(project: LoadedProject, brief: CaptureBrief): Promise<{ markdown: string; json: string }> {
  const directory = resolveProjectPath(project, project.manifest.output.reportDirectory);
  const markdownPath = path.join(directory, "capture-brief.md");
  const jsonPath = path.join(directory, "capture-brief.json");
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(markdownPath, markdown(brief), "utf8"),
    writeFile(jsonPath, `${JSON.stringify(brief, null, 2)}\n`, "utf8"),
  ]);
  return { markdown: markdownPath, json: jsonPath };
}

export function formatCaptureBrief(brief: CaptureBrief): string {
  return [
    `IntentCut Brief — ${brief.project}`,
    "",
    `PASS  Capture target         ${brief.captureTarget.width}x${brief.captureTarget.height} · ${brief.captureTarget.fps} fps`,
    `PASS  Preflight              ${brief.preflight.length} pending check(s)`,
    `PASS  Recording takes        ${brief.takes.length} manual take(s)`,
    "PASS  Authority              brief-only · recording control manual",
  ].join("\n");
}
