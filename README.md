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

Milestone 2 is complete. IntentCut validates YAML manifests, inspects media,
resolves an exact timeline, compiles it through FFmpeg, and validates the
rendered artifact with JSON and Markdown reports.

The first proving experiment successfully reconstructed the completed
Orbweaver WebMCP Challenge sequence from a declarative manifest and its existing
production assets.

## Current commands

```bash
npm install
npm run dev -- validate examples/orbweaver/intentcut.yaml
npm run dev -- inspect examples/orbweaver/intentcut.yaml
npm run dev -- plan examples/orbweaver/intentcut.yaml
npm run dev -- render examples/orbweaver/intentcut.yaml --preview
npm run dev -- check examples/orbweaver/intentcut.yaml
```

Run all compiler and test checks with:

```bash
npm run check
```

See [MVP](./docs/MVP.md) for the bounded first release and
[progress](./docs/PROGRESS.md) for the live implementation record.
