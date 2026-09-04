# IntentCut release authority

IntentCut separates rendering, candidate identity, human approval, local
release, and external publication. None of these states implies the next.

## 1. Render and validate in final mode

```bash
intentcut render intentcut.yaml --final
```

Final mode means synthetic narration is absent and the technical build checks
pass. It does not mean the artifact is approved or released.

## 2. Create an exact candidate

```bash
intentcut candidate intentcut.yaml
```

This command runs a fresh final-mode validation, then writes
`release-candidate.json` beneath the configured report directory. The candidate
binds:

- the semantic manifest SHA-256 revision;
- the rendered media SHA-256 and byte size;
- the declared project-relative output path;
- the passing final-mode build report;
- authority state `release-candidate`, `approved: false`, `released: false`.

The command prints a 12-character confirmation token derived from the complete
candidate record.

## 3. Human approval

```bash
intentcut approve intentcut.yaml reports/release-candidate.json \
  --by "Your Name" \
  --confirm <token>
```

Approval recomputes the current semantic revision and rendered-media hash. A
wrong token, changed manifest, changed media, mismatched project/output, or
malformed candidate is rejected. The approver name and approval time are then
recorded in `release-approval.json` with authority state `human-approved` and
`released: false`.

The approval record is created exclusively. IntentCut refuses to overwrite an
existing human approval.

## 4. Seal the approved artifact locally

```bash
intentcut seal intentcut.yaml reports/release-candidate.json \
  reports/release-approval.json
```

Before writing anything, `seal` validates that the approval names the exact
candidate and that the current project revision, output path, media SHA-256,
and byte size remain unchanged. It then creates an exclusive bundle at:

```text
releases/release-<candidate-token>/
  final.mp4
  release-receipt.json
```

The artifact is copied rather than moved, preserving the approved source. The
copy is hashed again before the receipt is written. The receipt binds the
candidate digest, approval digest, semantic revision, artifact identity,
approver, approval time, and sealing time. It records `released: true` and
`published: false`.

The release directory and receipt are never overwritten. External publication
remains separate future work requiring its own explicit authorization.

## Authority boundary

- `render --final` produces validated media, not a release.
- `candidate` identifies one exact validated artifact, but does not approve it.
- `approve` records a human decision, but does not publish or copy media.
- `seal` creates a local release bundle from a still-current approval.
- MCP exposes no candidate, approval, release, or publication operation.
- No release command connects to an external publishing service.
