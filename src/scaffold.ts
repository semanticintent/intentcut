import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const manifest = `version: 1

project:
  title: My IntentCut Production
  resolution:
    width: 1920
    height: 1080
  fps: 30
  maximumDuration: 3m

scenes:
  - id: opening
    type: image
    source: assets/opening.png
    duration: 8s
    motion:
      type: push-in
      from: 1
      to: 1.04

  - id: closing
    type: image
    source: assets/closing.png
    duration: 8s

audio:
  narration:
    generatedDirectory: narration/generated
    sections:
      - id: opening
        scene: opening
        script: narration/scripts/01-opening.md
        mode: synthetic-prototype
      - id: closing
        scene: closing
        script: narration/scripts/02-closing.md
        mode: synthetic-prototype
  loudness:
    integrated: -16
    truePeak: -1.5
    range: 7

output:
  file: renders/preview.mp4
  codec: h264
  reportDirectory: reports
`;

const readme = `# IntentCut production

1. Add \`assets/opening.png\` and \`assets/closing.png\`.
2. Edit the scene timing and narration scripts.
3. Run \`intentcut narrate intentcut.yaml --temporary\`.
4. Run \`intentcut render intentcut.yaml --preview\`.
5. Replace prototype sections with final human narration before a final render.
`;

export async function initializeProject(directory: string): Promise<string> {
  const root = path.resolve(directory);
  const directories = [
    "assets",
    "recordings",
    "narration/generated",
    "narration/human",
    "narration/scripts",
    "renders",
    "reports",
  ];
  await Promise.all(directories.map((child) => mkdir(path.join(root, child), { recursive: true })));
  await Promise.all([
    writeFile(path.join(root, "intentcut.yaml"), manifest, { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "README.md"), readme, { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "narration/scripts/01-opening.md"), "Introduce the project and the problem it solves.\n", { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "narration/scripts/02-closing.md"), "State the result and close with the central idea.\n", { encoding: "utf8", flag: "wx" }),
  ]);
  return root;
}
