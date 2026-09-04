# IntentCut bounded agent interface

IntentCut exposes project meaning to agents without treating access to context
as permission to act.

## Read-only context

```bash
intentcut agent-context intentcut.yaml
```

The command writes one deterministic JSON document to standard output. It does
not inspect media, generate reports, change the manifest, invoke FFmpeg, connect
to OBS, ingest a recording, render a preview, approve a candidate, or publish.

The context contains:

- project title and output target;
- a SHA-256 revision derived from the validated semantic manifest;
- scene ids, types, and declared source references;
- whether each scene has a capture contract;
- narration-section identities attached to each scene;
- the complete capability and authority boundary.

No absolute manifest or workstation path is emitted. Source references remain
in the same project-relative form declared by the creator.

## Authority

`project.read`, `capture.topology.read`, and `edit.propose` are available.
Rendering, recording control, and media ingestion are not exposed. Approval and
publication remain human-only.

This surface is provider-neutral. A future MCP or agent adapter should wrap the
same contract rather than introducing a privileged execution path.

## Revision-bound edit proposals

An agent may construct a strict proposal using the revision returned by
`agent-context`:

```json
{
  "kind": "intentcut-edit-proposal",
  "version": 1,
  "expectedRevision": "sha256:<revision-from-agent-context>",
  "summary": "Tighten the demonstration and focus the result.",
  "operations": [
    {
      "id": "tighten-demo",
      "operation": "scene.set-trim",
      "sceneId": "demo",
      "trim": { "in": "2s", "out": "18s" }
    }
  ],
  "authority": { "state": "proposed-only", "applied": false }
}
```

Validate it without applying it:

```bash
intentcut validate-proposal intentcut.yaml edit-proposal.json
```

The bounded operation vocabulary is:

- `scene.set-trim`
- `scene.set-speed`
- `scene.set-camera` (a bounded camera move or `null` to remove it)
- `annotation.upsert`
- `annotation.remove`
- `narration.set-script`

The validator rejects stale revisions, duplicate operation ids, unknown or
wrong-type targets, invalid timing, undeclared fields, and any authority state
other than `proposed-only` / `applied: false`. Its own result declares
`validation-only`, `applied: false`, and `manifestWritten: false`.

The vocabulary cannot express source paths, output configuration, capture
settings, ingestion, rendering, approval, or publication. There is no command
that applies an edit proposal.

## Next boundary

Milestone 7C can add an optional protocol adapter over the same context and
validation functions. It must not introduce an apply or release path.
