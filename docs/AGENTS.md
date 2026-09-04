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

The core surface is provider-neutral. The MCP adapter below wraps the same
contract rather than introducing a privileged execution path.

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

## MCP stdio adapter

Start the optional local server with one project manifest:

```bash
npm run mcp -- /absolute/path/to/intentcut.yaml
```

Installed packages also expose:

```bash
intentcut-mcp /absolute/path/to/intentcut.yaml
```

An MCP host can launch the compiled server directly:

```json
{
  "mcpServers": {
    "intentcut": {
      "command": "node",
      "args": [
        "/absolute/path/to/intentcut/dist/mcp-cli.js",
        "/absolute/path/to/project/intentcut.yaml"
      ]
    }
  }
}
```

The stdio server exposes exactly two tools:

- `intentcut_project_context`
- `intentcut_validate_edit_proposal`

Both carry MCP annotations declaring them read-only, idempotent,
non-destructive, and closed-world. The server loads one validated manifest at
startup, opens no network listener, uses stdout only for MCP JSON-RPC, and
delegates directly to the provider-neutral context and validation functions.

Official transport reference:
<https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md>

## Consequential boundary

Milestone 8 implements explicit human approval, local release, publication
authorization, and publication receipts through separate CLI ceremonies. The
MCP adapter remains outside that authority path and exposes none of those
operations.
