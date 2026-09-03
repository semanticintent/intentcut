#!/usr/bin/env node

import { formatDuration } from "./duration.js";
import { checkBuild, formatBuildReport } from "./check.js";
import { inspectProjectMedia } from "./inspect.js";
import { loadProject, replaceNarrationSection } from "./manifest.js";
import { formatNarrationPlan, generateTemporaryNarration, planNarration, writeNarrationReport } from "./narration.js";
import { compileTimeline } from "./timeline.js";
import { createRenderPlan, renderPreview } from "./render.js";
import { initializeProject } from "./scaffold.js";

function usage(): string {
  return [
    "IntentCut — declarative video production",
    "",
    "Usage:",
    "  intentcut init <directory>",
    "  intentcut validate <manifest>",
    "  intentcut inspect <manifest>",
    "  intentcut plan <manifest>",
    "  intentcut render <manifest> --preview",
    "  intentcut render <manifest> --final",
    "  intentcut check <manifest>",
    "  intentcut narrate <manifest> --temporary",
    "  intentcut replace-voice <manifest> <section> <source>",
  ].join("\n");
}

async function main(): Promise<void> {
  const [command, manifestPath] = process.argv.slice(2);

  if (!command || !manifestPath || !["init", "validate", "inspect", "plan", "render", "check", "narrate", "replace-voice"].includes(command)) {
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  if (command === "init") {
    const directory = await initializeProject(manifestPath);
    console.log(`Initialized IntentCut production at ${directory}`);
    console.log("Add opening.png and closing.png under assets, then edit intentcut.yaml.");
    return;
  }

  if (command === "replace-voice") {
    const [, , sectionId, source] = process.argv.slice(2);
    if (!sectionId || !source) throw new Error("replace-voice requires a section id and source path.");
    await replaceNarrationSection(manifestPath, sectionId, source);
    console.log(`Updated ${sectionId} to human-final narration from ${source}.`);
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

  const narration = project.manifest.audio?.narration;
  let narrationPlan;
  if (narration && "sections" in narration) {
    if (command === "narrate") {
      if (!process.argv.includes("--temporary")) throw new Error("Pass --temporary to generate prototype narration.");
      const generated = await generateTemporaryNarration(project);
      console.log(`Generated ${generated.length} temporary narration section(s).`);
    }
    narrationPlan = await planNarration(project, timeline);
    await writeNarrationReport(project, narrationPlan);
  }

  if (command === "narrate") {
    if (!narrationPlan) throw new Error("The project does not use sectioned narration.");
    console.log(formatNarrationPlan(narrationPlan));
    if (!narrationPlan.allFit) process.exitCode = 2;
    return;
  }

  if (command === "render") {
    const final = process.argv.includes("--final");
    const preview = process.argv.includes("--preview");
    if (!preview && !final) throw new Error("Pass --preview or --final.");
    if (preview && final) throw new Error("Choose either --preview or --final.");
    const syntheticCount = narrationPlan?.syntheticCount ?? (
      narration && !("sections" in narration) && narration.mode === "synthetic-prototype" ? 1 : 0
    );
    if (final && syntheticCount > 0) {
      throw new Error(`Final render blocked: ${syntheticCount} synthetic prototype narration section(s) remain.`);
    }
    if (final && narrationPlan && !narrationPlan.allFit) {
      throw new Error("Final render blocked: one or more narration sections exceed their assigned capacity.");
    }
    if (!timeline.withinMaximumDuration) {
      throw new Error("The planned timeline exceeds the configured maximum duration.");
    }
    const renderPlan = createRenderPlan(project, timeline, narrationPlan);
    console.log(`Rendering ${renderPlan.outputPath}`);
    await renderPreview(renderPlan);
    const report = await checkBuild(project, timeline, narrationPlan, final);
    console.log(formatBuildReport(report));
    if (!report.passed) process.exitCode = 2;
    return;
  }

  if (command === "check") {
    const report = await checkBuild(project, timeline, narrationPlan, process.argv.includes("--final"));
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
