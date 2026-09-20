# IntentCut

Declarative, agent-assisted video production.

IntentCut explores a local-first workflow in which recordings are inputs,
editorial intent is versioned source, rendering is compilation, technical QA is
automated, and the human retains release authority.

The initial use case is a repeatable series of concise software demonstrations
combining authentic screen recordings, opening and closing cards, annotations,
camera movement, captions, narration, and generated visual assets.

Read the complete [concept](./CONCEPT.md).

## Requirements

- Node.js 22 or newer
- [FFmpeg](https://ffmpeg.org/) with `ffprobe` on your `PATH` (macOS: `brew install ffmpeg`)
- macOS only, for *temporary* synthetic narration: the built-in `say` command.
  Everything else — including human-recorded narration — is cross-platform.

IntentCut is pre-release and not yet published to npm. Run it from a clone.

## Quickstart

The quickstart example is self-contained: its placeholder media is generated
locally with FFmpeg, so nothing outside this repository is needed.

```bash
git clone https://github.com/semanticintent/intentcut.git
cd intentcut
npm install
npm run example:media
npm run dev -- validate examples/quickstart/intentcut.yaml
npm run dev -- plan examples/quickstart/intentcut.yaml
npm run dev -- render examples/quickstart/intentcut.yaml --preview
npm run dev -- check examples/quickstart/intentcut.yaml
```

The render lands in `examples/quickstart/renders/quickstart.mp4`, with JSON and
Markdown reports beside it. The other examples (`orbweaver`, `camera-demo`,
`narration-demo`) reproduce a real production and reference its media outside
this repository; they will not render from a fresh clone.

## Status

Milestone 8 is complete. IntentCut validates YAML manifests, inspects media,
resolves an exact timeline, compiles it through FFmpeg, and validates the
rendered artifact with JSON and Markdown reports. Its visual grammar now
includes timed annotations, portable WebVTT captions, and bounded camera moves.
Source analysis produces contact sheets, visual and silence signals, transcript
metadata, and an editable first-cut proposal without modifying the production.
Capture briefs can be generated before recordings exist, preserving the human
performance as a precise, repeatable production step.

The first bounded agent surface is now available as deterministic JSON. It
exposes project topology and a semantic revision fingerprint while explicitly
withholding manifest writes, process execution, recording, ingestion, approval,
and publication authority.

The first proving experiment successfully reconstructed the completed
Orbweaver WebMCP Challenge sequence from a declarative manifest and its existing
production assets. A second experiment ran the chain forward instead: a new
production was declared as a manifest, capture briefs, and narration scripts
before any footage existed, and compiled against placeholder media standing in
for each declared take. Rendering the same manifest repeatedly produces
byte-identical output.

## Current commands

```bash
npm install
# Project, capture, and analysis
npm run dev -- init ../my-video
npm run dev -- validate intentcut.yaml
npm run dev -- brief intentcut.yaml
npm run dev -- capture-status intentcut.yaml
npm run dev -- ingest intentcut.yaml ./take-workspace.json
npm run dev -- inspect intentcut.yaml
npm run dev -- analyze intentcut.yaml
npm run dev -- plan intentcut.yaml

# Agent surface (read-only)
npm run dev -- agent-context intentcut.yaml
npm run dev -- validate-proposal intentcut.yaml ./edit-proposal.json

# Narration and rendering
npm run dev -- narrate intentcut.yaml --temporary
npm run dev -- replace-voice intentcut.yaml <section> narration/human/<file>.wav
npm run dev -- render intentcut.yaml --preview
npm run dev -- render intentcut.yaml --final
npm run dev -- check intentcut.yaml [--final]

# Release and publication (human-invoked)
# Artifact paths resolve against the project first, then your working directory.
npm run dev -- candidate intentcut.yaml
npm run dev -- approve intentcut.yaml reports/release-candidate-<token>.json --by "Your Name" --confirm <token>
npm run dev -- seal intentcut.yaml reports/release-candidate-<token>.json reports/release-approval-<token>.json
npm run dev -- authorize-publication intentcut.yaml releases/release-<token>/release-receipt.json --adapter directory --to ./delivery --by "Your Name" --confirm release-<token>
npm run dev -- publish intentcut.yaml releases/release-<token>/release-receipt.json releases/release-<token>/publication-intent-directory.json
```

Declare editorial emphasis in the manifest rather than editing keyframes:

```yaml
scenes:
  - id: workspace
    type: video
    source: media/workspace.mov
    camera:
      - at: 2s
        duration: 4s
        transition: 1s
        zoom: 1.35
        center: { x: 0.75, y: 0.55 }
      - at: 12s
        duration: 4s
        transition: 1s
        zoom: 1.5
        center: { x: 0.35, y: 0.5 }

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

A video scene may declare up to eight focus movements. They must be ordered and
must not overlap, and each is bounded to its scene; between movements the frame
returns to rest. Annotations are rendered as designed image overlays, so they do
not depend on optional FFmpeg text filters — which are absent from some FFmpeg
builds.

Sectioned narration can also compile into a portable WebVTT sidecar.

Source analysis produces deterministic, timecoded contact sheets without
changing the manifest or timeline. Sampling is configurable in the manifest:

```yaml
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
  transcripts:
    - scene: workspace
      source: transcripts/workspace.vtt
      format: webvtt
      provider: whisper.cpp
      model: base.en
      provenance: local-model
```

The generated JPEG plus JSON and Markdown reports remain review artifacts under
the configured report directory. Likely-cut detection scans reduced-resolution
frames, collapses nearby hits, and emits a bounded list of source-timecoded
suggestions. It never changes trims automatically.

Silence analysis runs locally through FFmpeg when a recording contains audio;
recordings without an audio stream are reported explicitly. Transcription stays
provider-neutral: IntentCut imports WebVTT sidecars and preserves their declared
provider, optional model, and human/local/hosted provenance instead of requiring
one transcription service.

Every analysis also writes `first-cut.proposal.yaml` and a JSON twin. The
proposal divides each recording at credible visual transitions, attaches
transcript coverage, and surfaces silence as a pending review action. All
segments default to `keep`, every action defaults to `pending`, and the artifact
declares:

```yaml
authority:
  state: proposed-only
  applied: false
```

IntentCut currently provides no command that applies this proposal.

Declare the human capture intent beside the scenes it serves:

```yaml
capture:
  preflight:
    - Hide notifications and unrelated applications.
    - Confirm the intended sample data is visible.
  takes:
    - scene: workspace
      objective: Show the validated proposal appearing.
      startState: The workspace is empty at revision 0.
      actions:
        - Ask the agent to create the proposal.
      visibleProof:
        - The complete diagram appears.
        - The preview is visibly unaccepted.
      endState: Hold on the result before stopping.
      privacyNotes:
        - Use public sample data only.
```

`intentcut brief` compiles this into JSON and a printable Markdown checklist.
It does not require the recordings to exist and grants no recording control.

`intentcut capture-status` performs a read-only environment check. It detects
FFmpeg, ffprobe, an OBS installation, and whether an OBS configuration directory
exists. It does not open OBS, inspect configuration contents, read WebSocket
credentials, attempt a connection, or control recording.

The opt-in OBS adapter contract is available through the TypeScript API. OBS
must be enabled explicitly, and an optional password is referenced by
environment-variable name—never stored in the manifest:

```yaml
capture:
  obs:
    enabled: true
    url: ws://127.0.0.1:4455
    passwordEnvironmentVariable: INTENTCUT_OBS_PASSWORD
```

The adapter accepts a replaceable transport, allowing its authority and
lifecycle rules to be tested without connecting to OBS. It permits only
declared takes, refuses to adopt an external recording, refuses to close during
an active take, and returns a `captured-uningested` receipt after stopping.
A production OBS WebSocket 5.x JSON transport is included. It uses Node's
built-in SHA-256 implementation for challenge authentication and supports
bounded connection and request timeouts. Live control remains available only
through separate TypeScript API calls; no CLI command currently connects or
records.

`intentcut ingest` consumes the saved receipt as a separate human-invoked step.
It verifies the take, scene, and destination against the manifest, requires an
absolute captured-media path, and copies with exclusive-create semantics. It
never overwrites an existing project source and leaves the original OBS file
untouched. There is intentionally no `--force` or move mode. See
[OBS integration](./docs/OBS.md).

`intentcut agent-context` emits a provider-neutral, read-only JSON envelope for
agent workflows. It includes the validated project target, declared scene
topology, capture coverage, narration-section identities, and a SHA-256 semantic
revision covering the manifest and its narration scripts. The same envelope declares every unavailable or human-only capability;
it does not execute media tools or write reports. See
[bounded agent interface](./docs/AGENTS.md).

An agent may now author a strict `intentcut-edit-proposal` containing the
revision from that context. `intentcut validate-proposal` checks its shape,
revision, operation identities, and semantic targets, then returns structured
JSON. The bounded vocabulary covers trim, speed, camera focus, annotations, and
narration text; it cannot express source or script paths, rendering, capture,
ingestion, approval, or publication. Validation never changes the manifest.

The optional MCP stdio adapter wraps those same two functions:

```bash
npm run mcp -- /absolute/path/to/intentcut.yaml
```

It exposes only `intentcut_project_context` and
`intentcut_validate_edit_proposal`. Both are declared read-only, idempotent,
non-destructive, and closed-world. The adapter opens no network listener and
adds no render, capture, ingestion, approval, or publication tool. It re-reads
the manifest on every call, so proposals are never validated against a stale
snapshot.

Release approval is a separate CLI ceremony, outside the agent surface.
`candidate` performs a fresh final-mode QA pass, hashes the rendered media,
binds it to the semantic manifest revision, and prints a short confirmation
token. `approve` requires the candidate file, an approver name, and that exact
token. It re-runs final-mode QA and re-hashes both intent and media before
writing an immutable, per-candidate approval record. Changed intent, changed
media, failed QA, preview-mode validation, or an existing approval for that
candidate all fail closed. Approval does not publish anything. `seal` then revalidates that
exact approval, intent revision, and media identity before copying the video
into an exclusive, content-addressed local release bundle. Its immutable
receipt records the human approval and explicitly states `published: false`;
rerunning the same release cannot overwrite the bundle.

Publication is a second human-only ceremony. `authorize-publication` binds a
named person, exact sealed-release receipt, adapter, and target in an immutable
intent record. Only then can `publish` invoke an adapter and write a completion
receipt. Two adapters ship, and the receipt records which of them moved the
bytes, so it can never imply the tool did something it did not do:

- `directory` copies the artifact exclusively into a local folder and verifies
  what it wrote. It performs no network request and makes no claim that a target
  is publicly visible. Its receipts record `performed: by-intentcut`.
- `external` uploads nothing. When you publish a release yourself — to a video
  host, a client, anywhere — it records that a named person put *this exact
  sealed artifact*, by hash, at a location they state. It opens no socket and
  does not check that the location resolves, because it cannot without making a
  request this tool has never made. The claim is yours; the binding is the
  record's. Its receipts record `performed: by-hand`.

Future service adapters must inherit the same contract.
Neither operation is exposed through MCP.

These ceremonies bind a human decision to an exact artifact and make accidents
fail closed. They are not access control: a process with your shell and file
access could write the same records. See
[what the release records protect](./docs/RELEASE.md#what-these-records-protect--and-what-they-do-not).

Create a narration-ready production workspace with:

```bash
npm run dev -- init ../my-project-video
```

Generate local temporary narration, inspect its timing, and render a prototype:

```bash
npm run dev -- narrate examples/narration-demo/intentcut.yaml --temporary
npm run dev -- render examples/narration-demo/intentcut.yaml --preview
```

Temporary narration (macOS `say`) is valid for previews. A final render refuses
scratch, not synthesis. Either replace each section with human-final audio, or
declare the voice you intend to ship and mark those sections `synthetic-final`:

```yaml
audio:
  narration:
    synthesis:
      provider: say
      model: macos-say
      voice: Samantha
    sections:
      - id: opening
        scene: opening
        script: narration/scripts/01-opening.md
        mode: synthetic-final
```

Choosing whether the final voice is human or synthesised has always been the
creator's decision; what the manifest insists on is that the choice is declared.
An undeclared `synthetic-final` section fails to load at all, and a
`synthetic-prototype` section still blocks a final render, so a scratch track
cannot reach an audience by being forgotten about. The declaration is folded
into the semantic revision and recorded in the release receipt, which then
states the voice beside the human who approved it.

`replace-voice` refuses a missing file or one from the generated narration
directory:

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
