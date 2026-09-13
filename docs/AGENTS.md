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
- a SHA-256 revision derived from the validated semantic manifest and the
  contents of its narration scripts (rendered media is bound separately, by
  hash, at release time);
- scene ids, types, and declared source references;
- whether each scene has a capture contract;
- narration-section identities attached to each scene;
- the complete capability and authority boundary.

The manifest's own location is not emitted. Scene source references are passed
through exactly as the creator declared them — normally project-relative — so
keep sources project-relative if the context will be shared.

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
- `narration.set-script` (carries proposed narration `text`; it never names a
  script file)

The validator rejects stale revisions, duplicate operation ids, unknown or
wrong-type targets, invalid timing, undeclared fields, and any authority state
other than `proposed-only` / `applied: false`. Its own result declares
`validation-only`, `applied: false`, and `manifestWritten: false`.

The vocabulary cannot express source or script paths, output configuration,
capture settings, ingestion, rendering, approval, or publication. There is no
command that applies an edit proposal.

## MCP stdio adapter

IntentCut is not yet published to npm; run it from a clone. Start the optional
local server with one project manifest:

```bash
npm run mcp -- /absolute/path/to/intentcut.yaml
```

For an MCP host, build once (`npm run build`) and launch the compiled server:

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
non-destructive, and closed-world. The server validates the manifest at startup
and re-reads it on every tool call, so a proposal is always checked against the
manifest as it currently is. It opens no network listener, uses stdout only for
MCP JSON-RPC, and delegates directly to the provider-neutral context and
validation functions.

Official transport reference:
<https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md>

## Consequential boundary

Milestone 8 implements explicit human approval, local release, publication
authorization, and publication receipts through separate CLI ceremonies. The
MCP adapter remains outside that authority path and exposes none of those
operations. Those ceremonies bind approval to exact artifacts; they are not
access control against a process with your shell access. See
[release authority](./RELEASE.md#what-these-records-protect--and-what-they-do-not).
