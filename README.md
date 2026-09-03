# IntentCut

Declarative, agent-assisted video production.

IntentCut explores a local-first workflow in which recordings are inputs,
editorial intent is versioned source, rendering is compilation, technical QA is
automated, and the human retains release authority.

The initial use case is a repeatable series of concise software demonstrations
combining authentic screen recordings, opening and closing cards, annotations,
camera movement, captions, narration, and generated visual assets.

Read the complete [concept](./CONCEPT.md).

## Status

Milestone 4 is complete. IntentCut validates YAML manifests, inspects media,
resolves an exact timeline, compiles it through FFmpeg, and validates the
rendered artifact with JSON and Markdown reports. Its visual grammar now
includes timed annotations, portable WebVTT captions, and bounded camera moves.

The first proving experiment successfully reconstructed the completed
Orbweaver WebMCP Challenge sequence from a declarative manifest and its existing
production assets.

## Current commands

```bash
npm install
npm run dev -- validate examples/orbweaver/intentcut.yaml
npm run dev -- inspect examples/orbweaver/intentcut.yaml
npm run dev -- analyze examples/orbweaver/intentcut.yaml
npm run dev -- plan examples/orbweaver/intentcut.yaml
npm run dev -- render examples/orbweaver/intentcut.yaml --preview
npm run dev -- check examples/orbweaver/intentcut.yaml
```

Declare editorial emphasis in the manifest rather than editing keyframes:

```yaml
scenes:
  - id: workspace
    kind: video
    source: media/workspace.mov
    camera:
      - at: 2s
        duration: 4s
        transition: 1s
        zoom: 1.35
        center: { x: 0.75, y: 0.55 }

annotations:
  - id: focus-meaning
    at: 3s
    duration: 4s
    text: Focus follows meaning
    position: top-left
    tone: accent

output:
  captions:
    file: reports/captions.vtt
```

Camera moves are bounded to their scene and annotations are rendered as
designed image overlays, so they do not depend on optional FFmpeg text filters.
Sectioned narration can also compile into a portable WebVTT sidecar.

Source analysis produces deterministic, timecoded contact sheets without
changing the manifest or timeline. Sampling is configurable in the manifest:

```yaml
inspection:
  contactSheets:
    samples: 12
    columns: 4
    frameWidth: 480
```

The generated JPEG plus JSON and Markdown reports remain review artifacts under
the configured report directory.

Create a narration-ready production workspace with:

```bash
npm run dev -- init ../my-project-video
```

Generate local temporary narration, inspect its timing, and render a prototype:

```bash
npm run dev -- narrate examples/narration-demo/intentcut.yaml --temporary
npm run dev -- render examples/narration-demo/intentcut.yaml --preview
```

Temporary narration is valid for previews. A final render is structurally
blocked until every section is explicitly replaced with human-final audio:

```bash
npm run dev -- replace-voice intentcut.yaml opening narration/human/01-opening.wav
npm run dev -- render intentcut.yaml --final
```

Run all compiler and test checks with:

```bash
npm run check
```

See [MVP](./docs/MVP.md) for the bounded first release and
[progress](./docs/PROGRESS.md) for the live implementation record.
