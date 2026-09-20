import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const manifest = `version: 1

project:
  title: My IntentCut Production
  resolution:
    width: 1920
    height: 1080
  fps: 30
  maximumDuration: 3m

inspection:
  contactSheets:
    samples: 12
    columns: 4
    frameWidth: 480
  cutDetection:
    threshold: 0.18
    minimumGap: 1s
    maximumCandidates: 20
  silenceDetection:
    thresholdDb: -35
    minimumDuration: 500ms
  transcripts: []

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

This workspace renders as it stands. The opening and closing cards are
placeholders so that the first render works before you have made anything;
replace them with your own artwork when you have it.

1. Run \`intentcut narrate intentcut.yaml --temporary\`.
2. Run \`intentcut render intentcut.yaml --preview\`.
3. Edit the scene timing and the narration scripts, then render again.
4. Replace \`assets/opening.png\` and \`assets/closing.png\` with your own cards.
5. Add recordings, declare them as scenes, and run \`intentcut analyze intentcut.yaml\`.
6. Choose the final voice — record it, or declare a synthesised one — before a
   final render.
`;

/**
 * A scaffold that cannot render is a scaffold nobody can try. These are deliberately
 * plain: enough for the first render to succeed and obvious enough that nobody would
 * mistake them for finished artwork.
 */
async function placeholderCard(file: string, title: string, subtitle: string): Promise<void> {
  const svg = `<svg width="1920" height="1080" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#07141f"/>
  <rect x="160" y="470" width="180" height="8" rx="4" fill="#67e2e5"/>
  <text x="160" y="580" fill="#f4f7f6" font-family="Helvetica, Arial, sans-serif" font-size="84" font-weight="600">${title}</text>
  <text x="160" y="648" fill="#8ca5ad" font-family="Helvetica, Arial, sans-serif" font-size="36">${subtitle}</text>
</svg>`;
  await sharp(Buffer.from(svg)).png().toFile(file);
}

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
    placeholderCard(path.join(root, "assets/opening.png"), "Your title here", "replace assets/opening.png"),
    placeholderCard(path.join(root, "assets/closing.png"), "Closing card", "replace assets/closing.png"),
    writeFile(path.join(root, "intentcut.yaml"), manifest, { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "README.md"), readme, { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "narration/scripts/01-opening.md"), "Introduce the project and the problem it solves.\n", { encoding: "utf8", flag: "wx" }),
    writeFile(path.join(root, "narration/scripts/02-closing.md"), "State the result and close with the central idea.\n", { encoding: "utf8", flag: "wx" }),
  ]);
  return root;
}
