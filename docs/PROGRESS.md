# IntentCut progress

Last updated: 2026-09-03

## Current position

**Phase:** Milestone 4 — semantic visual grammar
**Status:** Complete
**Reference cases:** Orbweaver WebMCP Challenge demo, temporary narration demo,
and bounded camera demo

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

The compiler front end, CLI, and media inspection were verified on 2026-09-03
before the deterministic renderer milestone began.

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

## Milestone 3 — Narration as source

- [x] Define independently replaceable narration sections.
- [x] Generate temporary speech locally with the macOS system voice.
- [x] Inspect every generated section with ffprobe.
- [x] Compare narration duration with assigned scene capacity.
- [x] Assemble positioned sections into the rendered audio mix.
- [x] Normalize the combined narration track.
- [x] Permit synthetic narration in preview builds.
- [x] Block final rendering while synthetic sections remain.
- [x] Replace a single section with human-final audio through the CLI.
- [x] Scaffold a narration-ready production with `intentcut init`.
- [x] Produce JSON and Markdown narration reports.
- [x] Render and validate the temporary-narration example.

## Milestone 3 verified result

The first local narration prototype contains two independently generated
sections:

```text
opening   capacity 00:08.000 · narration 00:05.579 · PASS
closing   capacity 00:09.000 · narration 00:05.302 · PASS
```

IntentCut compiled them into a 17-second, 1920×1080 preview with normalized
audio. Preview validation passed, while a deliberate `--final` attempt was
blocked before rendering because two synthetic prototype sections remained.

The automated suite now contains 13 passing tests across duration parsing,
manifest governance, project scaffolding, timeline compilation, and render
planning.

## Milestone 4 — Semantic visual grammar

- [x] Define timed, positioned, and semantically toned annotations.
- [x] Render annotation artwork without optional FFmpeg text filters.
- [x] Define bounded camera movements for recorded scenes.
- [x] Compile smooth camera enter, hold, and return phases.
- [x] Generate portable WebVTT captions from narration sections.
- [x] Validate annotation and caption coverage in build reports.
- [x] Add camera, annotation, and caption compiler tests.
- [x] Render and visually inspect focused and unfocused reference frames.

## Milestone 4 verified result

The narration example renders a branded annotation and two WebVTT cues while
retaining its 17-second timing and passing the existing audio gate. A separate
12-second camera fixture begins on the full ChatGPT and Orbweaver workspace,
moves toward the meaningful application region, holds with the annotation
`Focus follows meaning`, and returns to the full shared context.

```text
Narration preview       1920x1080 · 30 fps · 00:17.000 · PASS
Camera preview          1920x1080 · 30 fps · 00:12.033 · PASS
Annotation checks       timed and bounded · PASS
Caption checks          2 WebVTT cues · PASS
Automated suite         15 tests across 6 files · PASS
```

The annotation renderer uses SVG as its design source and Sharp to produce
transparent overlays. This preserves typography and layout even when the local
FFmpeg build does not include `drawtext` or `subtitles` filters.

## Later milestones

- [x] Designed annotations, captions, and camera movement.
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

### 2026-09-03 — Narration authority

Temporary system speech is valid for timing previews but is non-final by
default. Each section must become `human-final` before IntentCut permits a final
render. Replacement changes the manifest source and mode without reconstructing
the surrounding edit.

### 2026-09-03 — Local-first prototype voice

The initial narration provider is the macOS `say` command. It requires no
account, API key, network service, or voice cloning. Provider adapters can be
introduced later without changing the sectioned narration contract.

### 2026-09-03 — Semantic visual grammar

Camera instructions describe editorial attention as a center, zoom, hold, and
transition inside a scene. They do not expose raw FFmpeg expressions or a
general keyframe language. Annotations similarly declare content, position,
and tone while IntentCut owns their visual rendering.

### 2026-09-03 — Portable captions

Sectioned narration is the caption source. IntentCut derives WebVTT cue timing
from the same resolved narration plan used by the audio mix, preventing a
second hand-maintained timing track.
