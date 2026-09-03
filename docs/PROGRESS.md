# IntentCut progress

Last updated: 2026-09-03

## Current position

**Phase:** Milestone 2 — deterministic preview
**Status:** Complete
**Reference case:** Orbweaver WebMCP Challenge demo

## Progress legend

- `[ ]` Not started
- `[~]` In progress
- `[x]` Complete

## Foundation

- [x] Establish IntentCut as a separate Git repository.
- [x] Write the governing concept.
- [x] Define the MVP boundary and success condition.
- [x] Confirm local FFmpeg and ffprobe availability.
- [x] Inspect the Orbweaver reference media.
- [x] Scaffold the TypeScript package and CLI.

## Milestone 1 — Compiler front end

- [x] Define the versioned manifest schema.
- [x] Load and validate YAML manifests.
- [x] Parse human-readable durations.
- [x] Resolve file references relative to the manifest.
- [x] Inspect source media with ffprobe.
- [x] Compile scenes into a normalized timeline plan.
- [x] Report predicted and maximum runtime.
- [x] Add the Orbweaver reference manifest.
- [x] Add unit tests.
- [x] Verify all three initial CLI commands.

## Latest verified result

The Orbweaver reference manifest compiles to this predicted timeline:

```text
00:00.000 -> 00:05.000  opening
00:05.000 -> 00:50.697  create-proposal · 4x
00:50.697 -> 02:43.612  revise-and-undo
02:43.612 -> 02:49.612  closing

Predicted runtime: 02:49.612
Maximum runtime:   03:00.000
Result:            PASS
```

The compiler front end, CLI, media inspection, and six unit tests pass on
2026-09-03. Milestone 2 is ready to begin.

## Milestone 2 — Deterministic preview

- [x] Define the engine-neutral render plan.
- [x] Generate card segments from still images.
- [x] Trim and speed-adjust video scenes.
- [x] Normalize canvas size and frame rate.
- [x] Concatenate the visual timeline.
- [x] Mix final narration.
- [x] Normalize audio loudness.
- [x] Render a review-quality preview.
- [x] Produce JSON and Markdown validation reports.

## Milestone 2 verified result

IntentCut compiled the Orbweaver reference manifest into a 7.7 MB preview in
approximately 24 seconds. The generated build report passed every check:

```text
Resolution             1920x1080
Frame rate             30.000 fps
Duration               02:52.055 / 03:00.000
Audio                   stereo
Integrated loudness    -16.1 LUFS
True peak              -1.28 dBTP
Narration mode         human-final
Result                 PASS
```

Visual sampling confirmed the opening push-in, both screen-recording sections,
and the closing card. Rendered media and generated reports remain local and are
intentionally ignored by Git.

## Later milestones

- [ ] Temporary synthetic timing narration.
- [ ] Designed annotations, captions, and camera movement.
- [ ] Contact sheets, transcription, and assisted cut detection.
- [ ] OBS capture adapter.
- [ ] Bounded agent interface.
- [ ] Explicit human approval and release workflow.

## Decision log

### 2026-09-03 — Product shape

IntentCut begins as a declarative video compiler with a CLI and reusable
TypeScript API. It does not begin as a graphical editor or autonomous publisher.

### 2026-09-03 — Rendering foundation

FFmpeg and ffprobe are the initial media engine. Remotion remains an optional
future adapter for richer designed scenes.

### 2026-09-03 — First reference production

The completed Orbweaver video is the proving case. It provides known source
media, known editorial decisions, and a published comparison artifact.

### 2026-09-03 — Temporary narration

Synthetic narration is a timing and iteration instrument. It will be explicitly
identified and non-publishable by default until the creator makes a deliberate
final-narration decision.

### 2026-09-03 — Reference narration source

The individual Orbweaver voice takes were not retained. The proving manifest
therefore reads the human narration track from the published final MP4. This is
a reference-case accommodation, not the intended structure for new projects;
future productions will keep replaceable narration sections as independent
source files.

### 2026-09-03 — Render transparency

Every render records the resolved FFmpeg argument list beside its reports. The
engine remains an inspectable adapter rather than hidden process state.
