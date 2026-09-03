import { parseDuration } from "./duration.js";
import type { LoadedProject, ProjectScene } from "./manifest.js";
import type { MediaInspection } from "./inspect.js";

export interface TimelineScene {
  id: string;
  type: ProjectScene["type"];
  source: string;
  startMilliseconds: number;
  endMilliseconds: number;
  durationMilliseconds: number;
  speed: number;
}

export interface TimelinePlan {
  title: string;
  durationMilliseconds: number;
  maximumDurationMilliseconds: number;
  withinMaximumDuration: boolean;
  canvas: {
    width: number;
    height: number;
    fps: number;
  };
  scenes: TimelineScene[];
  annotations: TimelineAnnotation[];
}

export interface TimelineAnnotation {
  id: string;
  text: string;
  position: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center";
  tone: "neutral" | "accent" | "warning";
  startMilliseconds: number;
  endMilliseconds: number;
}

function resolveSceneDuration(
  scene: ProjectScene,
  inspections: ReadonlyMap<string, MediaInspection>,
): number {
  if (scene.type === "image") {
    return parseDuration(scene.duration);
  }

  const inspection = inspections.get(scene.source);
  if (!inspection) {
    throw new Error(`No media inspection is available for video scene "${scene.id}".`);
  }

  const trimIn = scene.trim ? parseDuration(scene.trim.in) : 0;
  const trimOut = scene.trim?.out
    ? parseDuration(scene.trim.out)
    : inspection.durationMilliseconds;

  if (trimIn >= trimOut) {
    throw new Error(`Scene "${scene.id}" trim.in must be earlier than trim.out.`);
  }

  if (trimOut > inspection.durationMilliseconds + 1) {
    throw new Error(`Scene "${scene.id}" trim.out exceeds the source duration.`);
  }

  return (trimOut - trimIn) / scene.speed;
}

export function compileTimeline(
  project: LoadedProject,
  inspections: ReadonlyMap<string, MediaInspection>,
): TimelinePlan {
  let cursor = 0;

  const scenes = project.manifest.scenes.map((scene): TimelineScene => {
    const durationMilliseconds = resolveSceneDuration(scene, inspections);
    const startMilliseconds = cursor;
    const endMilliseconds = startMilliseconds + durationMilliseconds;
    cursor = endMilliseconds;

    return {
      id: scene.id,
      type: scene.type,
      source: scene.source,
      startMilliseconds,
      endMilliseconds,
      durationMilliseconds,
      speed: scene.type === "video" ? scene.speed : 1,
    };
  });

  const maximumDurationMilliseconds = parseDuration(project.manifest.project.maximumDuration);
  const annotations = (project.manifest.annotations ?? []).map((annotation): TimelineAnnotation => {
    const startMilliseconds = parseDuration(annotation.at);
    const endMilliseconds = startMilliseconds + parseDuration(annotation.duration);
    if (endMilliseconds > cursor) {
      throw new Error(`Annotation "${annotation.id}" exceeds the planned timeline.`);
    }
    return {
      id: annotation.id,
      text: annotation.text,
      position: annotation.position,
      tone: annotation.tone,
      startMilliseconds,
      endMilliseconds,
    };
  });

  project.manifest.scenes.forEach((scene, index) => {
    if (scene.type !== "video" || !scene.camera?.length) return;
    const timelineScene = scenes[index];
    const focus = scene.camera[0];
    if (!timelineScene || !focus) return;
    const extent = parseDuration(focus.at) + parseDuration(focus.duration) + (2 * parseDuration(focus.transition));
    if (extent > timelineScene.durationMilliseconds) {
      throw new Error(`Camera movement in scene "${scene.id}" exceeds the scene duration.`);
    }
  });

  return {
    title: project.manifest.project.title,
    durationMilliseconds: cursor,
    maximumDurationMilliseconds,
    withinMaximumDuration: cursor <= maximumDurationMilliseconds,
    canvas: {
      width: project.manifest.project.resolution.width,
      height: project.manifest.project.resolution.height,
      fps: project.manifest.project.fps,
    },
    scenes,
    annotations,
  };
}
