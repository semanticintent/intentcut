# IntentCut progress

Last updated: 2026-09-03

## Current position

**Phase:** Milestone 6 — capture workflow
**Status:** In progress · OBS adapter contract complete; live transport remains
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
- [x] Contact sheets, transcription, and assisted cut detection.
- [~] Capture workflow and optional OBS adapter.
- [ ] Bounded agent interface.
- [ ] Explicit human approval and release workflow.

## Milestone 5 — Assisted source inspection

- [x] Add a non-mutating `analyze` command.
- [x] Sample each declared recording range at deterministic midpoints.
- [x] Render branded, timecoded contact sheets.
- [x] Produce machine-readable and human-readable source-analysis reports.
- [x] Verify both real Orbweaver recordings visually.
- [x] Detect and bound likely visual cut regions.
- [x] Verify suggested cut regions against real source frames.
- [x] Detect silence regions in sources with audio.
- [x] Report recordings that contain no audio without failing analysis.
- [x] Import WebVTT transcript cues through a provider-neutral sidecar contract.
- [x] Preserve transcript provider, model, and provenance metadata.
- [x] Generate an editable first-cut proposal without applying it.

## Milestone 5A verified result

IntentCut sampled both source recordings in the Orbweaver reference manifest
and produced two 4×3 contact sheets with 12 source-timecoded frames each. Visual
inspection confirmed that the sheets expose the full interaction arc and make
long waiting intervals apparent without requiring timeline scrubbing.

```text
create-proposal        12 frames · 4x3 · PASS
revise-and-undo        12 frames · 4x3 · PASS
Automated suite        16 tests across 7 files · PASS
```

## Milestone 5B verified result

Reduced-resolution scene-change analysis initially exposed ordinary cursor and
interface motion alongside real transitions. IntentCut now applies the declared
confidence threshold itself, collapses nearby events, and caps candidates per
scene. On the two Orbweaver recordings this reduced 40 raw bounded hits to three
credible review moments:

```text
create-proposal   00:09.000   playground becomes visible   0.4127
revise-and-undo   00:47.100   focused inspector state      0.2677
revise-and-undo   01:43.600   undo restores prior graph    0.2510
Automated suite   17 tests across 7 files                  PASS
```

Each candidate uses source time—not compiled timeline time—so a creator can
inspect or amend the original trim directly. No candidate is applied to the
manifest.

## Milestone 5C verified result

IntentCut now analyzes audio locally through FFmpeg and imports transcript
sidecars without depending on a transcription vendor. A real generated fixture
containing one second of tone, two seconds of silence, and one final second of
tone produced exactly one bounded silence region. The Orbweaver recordings
correctly report that neither contains an audio stream.

WebVTT transcript cues retain their timing while the analysis record preserves
who or what produced the transcript:

```text
provider      free, declared adapter or service name
model         optional model identifier
provenance    human | local-model | hosted-model
format        webvtt
```

The automated suite now contains 21 tests across seven files, including a real
FFmpeg silence-detection integration test.

## Milestone 5D verified result

IntentCut now combines the independent source signals into deterministic YAML
and JSON first-cut proposals. The Orbweaver proposal contains five default-keep
segments and three pending review actions derived from the three verified visual
transitions:

```text
create-proposal      2 segments · 1 pending review
revise-and-undo      3 segments · 2 pending reviews
Authority            proposed-only · applied: false
Automated suite      23 tests across 8 files · PASS
```

Proposal timecodes use the same readable `HH:MM:SS.mmm` form as the rest of the
production language. Analysis timestamps are deliberately excluded, making the
proposal stable across repeated runs against unchanged evidence.

## Milestone 6 — Capture workflow

- [x] Define declarative preflight and recording-take intent.
- [x] Compile capture briefs before source recordings exist.
- [x] Include objective, start state, ordered actions, visible proof, and end state.
- [x] Carry explicit privacy checks into each take.
- [x] Produce JSON and printable Markdown artifacts.
- [x] Preserve manual recording authority.
- [x] Reconstruct the real Orbweaver capture process as the proving case.
- [x] Detect and report OBS availability.
- [x] Detect OBS configuration-directory presence without reading its contents.
- [x] Report FFmpeg and ffprobe versions beside the project capture target.
- [x] Preserve diagnostic-only authority with no connection or credential access.
- [x] Add an opt-in OBS adapter contract for named recording takes.
- [x] Require explicit manifest enablement before connecting.
- [x] Resolve optional OBS passwords only through a named environment variable.
- [x] Refuse undeclared takes and recordings started outside IntentCut.
- [x] Preserve an active-take lifecycle through stop and close operations.
- [x] Return captured media as an uningested receipt.
- [ ] Implement and verify the production OBS WebSocket transport.
- [ ] Ingest completed takes without overwriting existing media.

## Milestone 6A verified result

The Orbweaver manifest now preserves the capture procedure that previously
existed only in our working conversation. `intentcut brief` produces a
1920×1080, 30 fps recording guide containing:

```text
Preflight checks       5 pending
Manual takes           2
Ordered actions        7
Visible-proof checks   8
Recording authority    manual
```

The brief can be compiled before either recording exists because it does not
invoke media inspection. The automated suite contains 26 tests across nine
files.

## Milestone 6B verified result

`intentcut capture-status` now produces JSON and Markdown environment reports
without opening or connecting to capture software. On the current macOS
workstation it reports:

```text
FFmpeg             8.1.2 · available
ffprobe            8.1.2 · available
OBS                 not found
OBS configuration  not detected
Manual capture      ready
OBS adapter         not ready
```

The result is informational rather than failing because native manual capture
remains usable. The automated suite contains 28 tests across ten files.

## Milestone 6C verified result

The first OBS adapter is a transport-independent TypeScript boundary, verified
against a fake transport because OBS is not installed on the current machine.
The tests prove these behaviors without making a network connection:

```text
Disabled adapter             connection refused before transport
Missing password variable    connection refused before transport
Undeclared take              start refused before OBS request
External recording active    start refused without adopting it
Active IntentCut take        close refused until stop
Completed take               captured-uningested receipt returned
Inline manifest password     schema rejected
```

The automated suite contains 34 tests across eleven files. A real WebSocket
transport is deliberately separate from this authority contract.

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

### 2026-09-03 — Inspection does not edit

Source analysis writes derived contact sheets and reports only. It does not
change trims, scene order, speed, or any other editorial source. Future cut and
transcription findings will follow the same proposal-before-mutation boundary.

### 2026-09-03 — Midpoint sampling

Contact-sheet frames are sampled at the midpoint of equal intervals inside the
declared source range. This avoids overrepresenting exact trim boundaries and
makes every generated sheet deterministic for a given manifest and recording.

### 2026-09-03 — Bounded cut suggestions

Likely-cut detection operates at reduced resolution and 10 frames per second.
The manifest declares its confidence threshold, minimum gap, and maximum result
count. IntentCut independently enforces all three after parsing FFmpeg metadata,
then reports source-timecoded candidates without modifying the edit.

### 2026-09-03 — Provider-neutral transcription

IntentCut does not choose or bundle a speech model. Any local tool, hosted
service, or human workflow that emits WebVTT can supply transcript evidence.
Provider, model, and provenance remain explicit in the manifest and analysis
report.

### 2026-09-03 — Silence is source-relative

Silence regions are detected only when the recording contains an audio stream
and are translated into original source time. A silent video track is not an
error and is reported as `no-audio`, keeping absence distinct from analysis
failure.

### 2026-09-03 — First cuts are proposals

The first-cut artifact segments recordings at credible visual transitions and
attaches transcript coverage and silence reviews. Every segment begins as
`keep`; every suggested action begins as `pending`; the artifact is explicitly
`proposed-only` and `applied: false`. There is no apply command in this
milestone.

### 2026-09-03 — Stable editorial source

First-cut proposals contain readable source timecodes but omit volatile run
timestamps. The same analysis evidence therefore produces the same reviewable
proposal and a meaningful version-control diff.

### 2026-09-03 — Capture begins as a contract

IntentCut first makes the human performance repeatable: preflight, start state,
actions, visible evidence, end state, filename, and privacy checks. The capture
brief is `brief-only`, and its recording control is explicitly `manual`.

### 2026-09-03 — Brief before media

The `brief` command loads and validates project intent but does not inspect
source files. A creator can therefore prepare and rehearse a production before
the declared recordings exist.

### 2026-09-03 — Discovery is not connection

Capture-status discovery may inspect executable and directory presence plus
safe version metadata. It does not open OBS, read configuration contents,
retrieve WebSocket credentials, attempt a connection, or gain recording
control. The generated record states each of those boundaries explicitly.

### 2026-09-03 — OBS absence is informational

IntentCut distinguishes readiness for its manual capture practice from
readiness for an optional OBS adapter. A missing OBS installation does not make
the capture brief or native screen recording workflow invalid.

### 2026-09-03 — Transport-independent capture authority

The OBS adapter owns take authorization and lifecycle rules but depends on a
replaceable transport. This makes it possible to prove what may connect, start,
stop, and close without requiring OBS or a live recording session.

### 2026-09-03 — Secrets stay outside the manifest

OBS authentication may name an environment variable. Inline password fields
are rejected by the strict schema, and a missing named variable blocks the
connection before the transport is called.

### 2026-09-03 — Capture is not ingestion

Stopping a declared OBS take returns the actual OBS output path alongside the
expected IntentCut source path in a `captured-uningested` receipt. Moving or
overwriting source media requires a later, separate ingestion decision.
