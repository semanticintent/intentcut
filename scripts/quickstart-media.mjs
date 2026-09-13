#!/usr/bin/env node
// Generates the placeholder media for examples/quickstart with FFmpeg's built-in
// test sources, so the example runs from a fresh clone without committed binaries.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const media = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "examples", "quickstart", "media");
mkdirSync(media, { recursive: true });

function ffmpeg(args, output) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, path.join(media, output)], { stdio: "inherit" });
  if (result.error?.code === "ENOENT") {
    console.error("FFmpeg was not found. Install it first (macOS: brew install ffmpeg).");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
  console.log(`  ${path.join("examples/quickstart/media", output)}`);
}

const card = (color, accent) => [
  "-f", "lavfi", "-i", `color=c=${color}:s=1280x720`,
  "-vf", `drawbox=x=96:y=300:w=520:h=24:color=${accent}:t=fill,drawbox=x=96:y=348:w=320:h=12:color=${accent}@0.5:t=fill`,
  "-frames:v", "1",
];

console.log("Generating quickstart media:");
ffmpeg(card("0x121821", "0x4fd1c5"), "opening.png");
ffmpeg(card("0x121821", "0xf6ad55"), "closing.png");
ffmpeg([
  "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30",
  "-t", "8", "-c:v", "libx264", "-pix_fmt", "yuv420p",
], "screen.mp4");
