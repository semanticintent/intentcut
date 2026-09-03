# IntentCut

## Declarative, agent-assisted video production

**Working proposition:** Record what only a person can perform. Declare what
the edit should mean. Let the system construct and verify the artifact. Keep
the final decision human.

IntentCut is a local-first production practice and toolchain for creating
professional software demonstrations from screen recordings, narration,
designed cards, generated visuals, and a versioned description of editorial
intent.

It replaces hidden editing state with inspectable source:

```text
recordings + narration + artwork + project manifest
                         |
                         v
                validate and compile
                         |
                         v
             preview + QA report + final video
                         |
                         v
                    human approval
```

The goal is not an autonomous filmmaker. The goal is to automate the mechanical
work surrounding the moments where human taste, performance, and judgment
matter.

## Why now

Software development has been moving toward machine-operable workflows:
text-based configuration, versioned source, command-line tools, reproducible
builds, automated checks, and artifacts that can be regenerated rather than
manually reconstructed.

Most accessible video editing still works differently. The source of truth is
a private graphical timeline. The editor remembers a sequence of gestures:
where a clip was dragged, how its edge was trimmed, which control changed its
speed, and where an annotation was positioned. That is useful for direct
manipulation, but weak for agent collaboration, reproducibility, review, and
reuse across a body of work.

IntentCut treats a video more like a compiled artifact:

- media files are inputs;
- editorial intent is source;
- the timeline is derived state;
- rendering is compilation;
- technical review is automated validation;
- the published video is a release;
- human approval is the consequential gate.

## The use case

A creator maintains a portfolio of open-source projects. Each project may need
a short public demonstration containing:

- authentic desktop or browser interaction;
- an opening and closing card;
- human or synthetic narration;
- annotations and captions;
- intentional zooming and reframing;
- diagrams, screenshots, or model-generated visuals;
- audio cleanup and loudness normalization;
- platform-specific exports and thumbnails.

The creator should not have to rebuild the entire production method inside a
graphical editor for every project. A shared theme and production grammar
should make the next video easier than the previous one.

## Governing principles

### Intent before timeline

The project describes why a moment exists and what deserves attention before
specifying pixels and frames.

### Human performance where authenticity matters

Live product interaction, editorial meaning, personal narration, and final
approval remain human contributions unless the creator deliberately chooses
otherwise.

### Automation for repeatable mechanics

Trimming, sequencing, transitions, annotations, captions, audio normalization,
encoding, duration checks, preview generation, and delivery variants should be
reproducible.

### Local-first media

Recordings and voice files remain local by default. Using a hosted model or
synthetic voice is an explicit project decision, not an invisible dependency.

### Reversible and inspectable

Every generated timeline and render should be reproducible from the manifest,
source assets, and tool versions. An agent changes source—not an opaque editor
database.

### Human release authority

An agent may propose scripts, edits, timing changes, visual treatments, and
rendered candidates. It does not silently publish the result.

## The project manifest

The central artifact is a small declarative document:

```yaml
version: 1

project:
  title: Orbweaver
  format: software-demo
  resolution: 1920x1080
  fps: 30
  maximumDuration: 180s

theme:
  colors: theme/colors.json
  typography: theme/typography.json
  annotationStyle: restrained

scenes:
  - id: opening
    type: card
    source: assets/opening.svg
    duration: 5s
    motion:
      kind: push-in
      from: 1.00
      to: 1.05

  - id: create-proposal
    type: recording
    source: recordings/01-create.mov
    trim:
      in: 2.1s
      out: 74.8s
    speed: 4
    focus:
      - at: 12s
        target: tool-activity
        zoom: 1.30
      - at: 29s
        target: diagram
        zoom: 1.15

  - id: trust-boundary
    type: annotation
    at: 42s
    text: "Validated != accepted"
    position: bottom-left
    duration: 4s

  - id: closing
    type: card
    source: assets/closing.svg
    duration: 6s

narration:
  mode: human-final
  prototypeVoice: synthetic
  tracks:
    - scene: opening
      source: narration/01-opening.wav
    - scene: create-proposal
      source: narration/02-create.wav

audio:
  integratedLoudness: -16
  truePeak: -1.5

delivery:
  codec: h264
  container: mp4
  captions: true
  thumbnail: thumbnails/main.svg
```

The precise schema will evolve. Its important property is separation of
concerns: the manifest expresses editorial decisions while render adapters
handle the mechanics of FFmpeg, Remotion, or another engine.

## Production lifecycle

### 1. Understand

The agent reads the project README, documentation, package metadata, examples,
and visual identity. It proposes:

- the single central idea;
- target audience and destination;
- narrative arc;
- demonstration path;
- claims requiring visible proof;
- desired runtime;
- required recordings and artwork.

The person approves or revises the story before production begins.

### 2. Rehearse

IntentCut produces a recording brief containing:

- exact starting state;
- window size and browser zoom;
- URLs, sample data, and prompts;
- actions to perform;
- visible states that must appear;
- filenames for each recording;
- privacy and notification checks.

### 3. Capture

The person performs the authentic interaction. Capture may begin with native
screen recording and later support OBS scene and recording control.

Automation can prepare the scene, start and stop named clips, and verify media
properties. It should not fabricate evidence that the application worked.

### 4. Inspect

IntentCut probes each recording and creates:

- duration and media metadata;
- transcript and silence map;
- contact sheet or sampled frames;
- likely cut points;
- visible-state markers;
- warnings about unreadable text, notifications, or unexpected dimensions.

### 5. Prototype with temporary synthetic narration

Before asking the person to record a polished voice-over, IntentCut generates a
temporary narration track from the current script.

This track is a timing instrument, not necessarily the published voice. It
allows the creator to evaluate:

- whether the script fits the footage;
- whether important visual events receive enough time;
- where pauses or cuts feel unnatural;
- whether the total duration is viable;
- whether an explanation belongs in speech or on screen.

The synthetic track can be regenerated cheaply as the script changes. Once the
visual sequence and wording stabilize, the creator records the final narration
in short replaceable sections. IntentCut substitutes those sections without
reconstructing the edit.

This removes one of the most frustrating feedback loops in demonstration
production: recording a complete voice-over before knowing whether the cut
actually works.

Synthetic narration must remain explicitly labeled in project metadata. Local
voices should be preferred where practical; use of remote services should
require deliberate configuration.

### 6. Compile

The renderer constructs a candidate video:

- trims and sequences recordings;
- applies speed changes;
- generates cards and transitions;
- animates crops, zooms, and focus regions;
- adds annotations and captions;
- inserts human, temporary, or final narration;
- mixes and normalizes audio;
- encodes a low-cost preview.

### 7. Review through language

The creator reviews the preview and can request bounded changes:

> Hold the diagram for four more seconds.

> Remove the pause before revision two.

> Zoom into the trust banner while acceptance remains false.

> Replace the synthetic narration in sections three and four with these takes.

> Keep the final result below two minutes and fifty seconds.

The agent translates these decisions into manifest changes. The resulting diff
is inspectable before another render.

### 8. Validate

The build produces a machine-readable and human-readable report:

```text
Duration                 PASS  02:43.7 / 03:00.0
Resolution               PASS  1920x1080
Frame rate               PASS  30 fps
Integrated loudness      PASS  -16.2 LUFS
True peak                PASS  -1.7 dBTP
Longest silence          PASS  1.4 seconds
Required term: WebMCP    PASS  00:31
Caption boundaries       PASS  0 violations
Thumbnail center-safe    PASS
Missing sources          PASS  0
```

Policies may be selected by destination: Devpost, YouTube, LinkedIn, GitHub,
documentation, or a custom profile.

### 9. Approve and release

The person selects a candidate, records the approval, and deliberately invokes
the final render or publication step. Preview generation and publication are
separate capabilities.

## Visual grammar

IntentCut should encourage explanation rather than decoration. Initial visual
primitives could include:

- opening and closing cards;
- lower-third annotations;
- focus rectangles and spotlight masks;
- arrows and relationship callouts;
- before-and-after comparisons;
- split-screen compositions;
- browser and terminal frames;
- animated crop and zoom paths;
- still-image movement;
- diagram overlays;
- caption tracks;
- generated illustrative interludes.

Visual effects are appropriate when they direct attention, establish context,
or make a state change legible. They should not compete with the product being
demonstrated.

## Generated visual assets

Models may contribute:

- conceptual illustrations;
- textured backgrounds;
- visual metaphors;
- transitional images;
- alternate thumbnails;
- storyboards;
- synthetic prototype voice;
- draft annotations and captions.

Every generated asset should retain provenance: model or provider, prompt or
brief, generation date, human modifications, and approval status. A generated
asset is an input to the edit, not evidence that a demonstrated product action
occurred.

## Automation boundary

The 80–90% automation target applies to a mature, repeated workflow.

Highly automatable:

- project inspection and first script;
- shot-list generation;
- media probing and transcription;
- silence and cut suggestions;
- cards and branded layouts;
- clip sequencing and timing;
- zooms, annotations, and captions;
- synthetic timing narration;
- audio normalization;
- encoding and delivery variants;
- duration, audio, and layout validation.

Human-led:

- determining what the project means;
- performing authentic product interactions;
- deciding which claims matter;
- judging pacing and visual restraint;
- choosing whether the final voice is human or synthetic;
- approving the representation of the work;
- authorizing publication.

The first video built with IntentCut will not be 90% automated because it will
also be building the system. The automation compounds:

- first implementation: establish the grammar and render pipeline;
- second production: reuse the theme and automate perhaps 50–65%;
- third production: stabilize capture and review at 70–80%;
- repeated productions: approach 80–90% mechanical automation.

## Proposed architecture

```text
project sources
      |
      v
IntentCut manifest ---- theme and destination profiles
      |
      +---- planner: script, shot list, recording brief
      +---- inspector: ffprobe, transcript, frames, silence map
      +---- compositor: Remotion or HTML/SVG motion
      +---- media engine: FFmpeg
      +---- capture adapter: native recording, later OBS
      +---- QA engine: duration, audio, captions, safe areas
      |
      v
preview artifact + report
      |
      v
human approval
      |
      v
final artifact
```

The initial implementation should avoid unnecessary platform complexity. A
TypeScript CLI can validate the manifest, orchestrate FFmpeg and ffprobe, and
optionally call a Remotion composition for designed scenes.

## Candidate commands

```text
intentcut init
intentcut brief
intentcut inspect recordings/
intentcut storyboard
intentcut narrate --temporary
intentcut render --preview
intentcut check
intentcut replace-voice 03 narration/03-final.wav
intentcut render --final
intentcut release --destination youtube
```

Publication commands should require explicit human confirmation or a separate
approved release record.

## Portable production artifacts

Each render should preserve enough information to understand how it was made:

- manifest version;
- source media hashes;
- narration mode and provenance;
- generated-asset provenance;
- renderer and dependency versions;
- validation report;
- approval record;
- output checksum.

The output video is portable. The production record should be portable too.

## Initial project structure

```text
intentcut/
├── CONCEPT.md
├── README.md
├── package.json
├── src/
├── schemas/
├── profiles/
├── themes/
├── examples/
│   └── orbweaver/
└── tests/
```

A generated video workspace would remain separate from the reusable tool:

```text
video/
├── intentcut.yaml
├── SCRIPT.md
├── assets/
├── recordings/
├── narration/
├── renders/
└── reports/
```

## Phased roadmap

### Phase 0 — Preserve the learned workflow

- Capture the Orbweaver production as the reference case.
- Define the minimum manifest from decisions already made manually.
- Produce the same final sequence from existing source media.
- Compare the compiled result with the published edit.

### Phase 1 — Deterministic assembly

- Initialize a video workspace.
- Validate the manifest.
- Probe inputs with ffprobe.
- Trim, speed-adjust, concatenate, and encode with FFmpeg.
- Mix narration and normalize loudness.
- Enforce runtime and output constraints.

### Phase 2 — Designed scenes

- Render SVG or Remotion opening and closing cards.
- Add restrained annotations and captions.
- Support animated crops and zoom paths.
- Generate thumbnails and delivery variants.

### Phase 3 — Narration workflow

- Generate temporary synthetic timing narration.
- Align script sections with scenes.
- Replace prototype sections with final human takes.
- Generate and validate captions.

### Phase 4 — Assisted inspection

- Produce contact sheets and transcripts.
- Detect silence and likely cut regions.
- Identify important state changes from frames or supplied markers.
- Generate an editable first-cut proposal.

### Phase 5 — Capture adapters

- Produce native capture briefs.
- Add OBS recording and scene control.
- Support named takes and automatic media ingestion.

### Phase 6 — Agent interface

- Expose bounded planning, inspection, revision, rendering, and QA tools.
- Separate proposal from approval and release.
- Preserve every agent-authored change as a manifest diff.

## First proving experiment

Use the completed Orbweaver footage and artwork as a known reference:

1. reconstruct its two screen segments, opening card, closing card, and final
   narration in an IntentCut manifest;
2. reproduce the 4x first section and normal-speed second section;
3. normalize audio to the established target;
4. render a sub-three-minute preview;
5. produce a validation report;
6. compare it visually and temporally with the published 2:52 video.

This experiment has a clear success condition and avoids inventing both the
tool and its first editorial result simultaneously.

## Position

IntentCut is not a replacement for filmmaking, taste, or performance. It is a
way to make the repeatable parts of small-scale video production legible to
people, agents, version control, and automation.

The creator performs what must be real.

The agent proposes the edit.

IntentCut compiles and verifies the artifact.

The human decides whether it represents the work.
