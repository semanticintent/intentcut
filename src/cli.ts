#!/usr/bin/env node

import { formatDuration } from "./duration.js";
import { checkBuild, formatBuildReport } from "./check.js";
import { inspectProjectMedia } from "./inspect.js";
import { loadProject } from "./manifest.js";
import { compileTimeline } from "./timeline.js";
import { createRenderPlan, renderPreview } from "./render.js";

function usage(): string {
  return [
    "IntentCut — declarative video production",
    "",
    "Usage:",
    "  intentcut validate <manifest>",
    "  intentcut inspect <manifest>",
    "  intentcut plan <manifest>",
    "  intentcut render <manifest> --preview",
    "  intentcut check <manifest>",
  ].join("\n");
}

async function main(): Promise<void> {
  const [command, manifestPath] = process.argv.slice(2);

  if (!command || !manifestPath || !["validate", "inspect", "plan", "render", "check"].includes(command)) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  const project = await loadProject(manifestPath);

  if (command === "validate") {
    console.log(`PASS  ${project.manifest.project.title}`);
    console.log(`      ${project.manifest.scenes.length} scenes · manifest version ${project.manifest.version}`);
    return;
  }

  const inspections = await inspectProjectMedia(project);

  if (command === "inspect") {
    console.log(`IntentCut Inspect — ${project.manifest.project.title}\n`);
    for (const inspection of inspections.values()) {
      const video = inspection.video;
      const audio = inspection.audio;
      console.log(inspection.source);
      console.log(`  Duration: ${formatDuration(inspection.durationMilliseconds)}`);
      if (video) {
        console.log(`  Video:    ${video.width ?? "?"}x${video.height ?? "?"} · ${video.frameRate ?? "?"} fps · ${video.codec ?? "?"}`);
      }
      if (audio) {
        console.log(`  Audio:    ${audio.sampleRate ?? "?"} Hz · ${audio.channels ?? "?"} channels · ${audio.codec ?? "?"}`);
      }
    }
    return;
  }

  const timeline = compileTimeline(project, inspections);

  if (command === "render") {
    if (!process.argv.includes("--preview")) {
      throw new Error("Milestone 2 supports preview renders only. Pass --preview.");
    }
    if (!timeline.withinMaximumDuration) {
      throw new Error("The planned timeline exceeds the configured maximum duration.");
    }
    const renderPlan = createRenderPlan(project, timeline);
    console.log(`Rendering ${renderPlan.outputPath}`);
    await renderPreview(renderPlan);
    const report = await checkBuild(project, timeline);
    console.log(formatBuildReport(report));
    if (!report.passed) process.exitCode = 2;
    return;
  }

  if (command === "check") {
    const report = await checkBuild(project, timeline);
    console.log(formatBuildReport(report));
    if (!report.passed) process.exitCode = 2;
    return;
  }

  console.log(`IntentCut Plan — ${timeline.title}\n`);
  for (const scene of timeline.scenes) {
    const speed = scene.speed === 1 ? "" : ` · ${scene.speed}x`;
    console.log(`${formatDuration(scene.startMilliseconds)} -> ${formatDuration(scene.endMilliseconds)}  ${scene.id}${speed}`);
  }
  console.log(`\nPredicted runtime: ${formatDuration(timeline.durationMilliseconds)}`);
  console.log(`Maximum runtime:   ${formatDuration(timeline.maximumDurationMilliseconds)}`);
  console.log(`Result:            ${timeline.withinMaximumDuration ? "PASS" : "FAIL"}`);

  if (!timeline.withinMaximumDuration) {
    process.exitCode = 2;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
