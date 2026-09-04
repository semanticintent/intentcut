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

Only `project.read` and `capture.topology.read` are available in Milestone 7A.
Edit proposals are named but unavailable until they can be bound to the exact
project revision. Rendering, recording control, and media ingestion are not
exposed. Approval and publication remain human-only.

This surface is provider-neutral. A future MCP or agent adapter should wrap the
same contract rather than introducing a privileged execution path.

## Next boundary

Milestone 7B will define a strict edit-proposal envelope containing the expected
project revision and bounded declarative operations. Producing a proposal will
not apply it.
