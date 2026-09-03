# IntentCut MVP

## Objective

Prove that a readable, versioned IntentCut manifest can deterministically plan,
render, and validate a real software-demonstration video.

The reference production is the published Orbweaver WebMCP Challenge demo:
<https://youtu.be/vEsgjJGgSOw>.

## Success condition

Given an IntentCut manifest and local Orbweaver production media, IntentCut
generates a playable video containing:

- an opening card;
- two edited screen recordings;
- narration;
- a closing card;
- normalized audio;
- a validation report confirming a runtime below three minutes.

## Milestone 1 — Compiler front end

- Parse YAML project manifests.
- Validate a strict versioned contract.
- Parse human-readable durations.
- Inspect local media through `ffprobe`.
- Resolve scenes into an exact deterministic timeline.
- Report predicted runtime against the configured maximum.
- Cover duration and timeline behavior with tests.

Commands:

```text
intentcut validate <manifest>
intentcut inspect <manifest>
intentcut plan <manifest>
```

## Milestone 2 — Deterministic preview

- Normalize source dimensions and frame rates.
- Convert still cards into timed video segments.
- Trim and speed-adjust screen recordings.
- Concatenate the complete visual sequence.
- Add and normalize narration.
- Encode a review-quality preview.
- Produce machine-readable and human-readable reports.

**Status:** Complete. The Orbweaver reference render passes resolution, frame
rate, duration, audio, loudness, true-peak, and narration-mode checks.

## Explicitly deferred

- Agent or MCP tools.
- OBS capture control.
- Automated transcription and cut detection.
- Temporary synthetic narration.
- Remotion compositions.
- Publication integrations.
- Graphical timeline editing.

These remain part of the concept. They follow only after the deterministic
compiler and renderer work end to end.

## Post-MVP progress

The deterministic compiler and renderer are complete. The subsequent narration
milestone now provides local temporary speech, section timing, replaceable human
voice files, and a final-render safety gate. IntentCut also supports a bounded
visual grammar: timed annotations, WebVTT captions generated from narration
sections, and camera moves that enter, hold, and return within one scene. See
`PROGRESS.md` for the current verified state.

## Reference facts

The local Orbweaver production currently contains:

| Artifact | Properties |
| --- | --- |
| `01-create.mov` | 2960×1666, 120 fps, 182.788 seconds |
| `02-revise-undo.mov` | 2960×1666, 120 fps, 112.915 seconds |
| Published final | 1920×1080, 29.97 fps, stereo AAC 48 kHz, 172 seconds |

The reference files remain owned by the Orbweaver project and are not copied
into IntentCut source control.
