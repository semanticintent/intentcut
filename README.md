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

Milestone 7 is in progress. IntentCut validates YAML manifests, inspects media,
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
production assets.

## Current commands

```bash
npm install
npm run dev -- validate examples/orbweaver/intentcut.yaml
npm run dev -- brief examples/orbweaver/intentcut.yaml
npm run dev -- capture-status examples/orbweaver/intentcut.yaml
npm run dev -- agent-context examples/orbweaver/intentcut.yaml
npm run dev -- ingest examples/my-video/intentcut.yaml ./take-workspace.json
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
    type: video
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
revision. The same envelope declares every unavailable or human-only capability;
it does not execute media tools or write reports. See
[bounded agent interface](./docs/AGENTS.md).

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
