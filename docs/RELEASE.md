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
`release-candidate-<token>.json` beneath the configured report directory. The
candidate binds:

- the semantic manifest SHA-256 revision;
- the rendered media SHA-256 and byte size;
- the declared project-relative output path;
- the passing final-mode build report;
- authority state `release-candidate`, `approved: false`, `released: false`.

The command prints a 12-character confirmation token derived from the complete
candidate record. Each candidate is written under its own token, so creating a
new candidate never orphans an earlier approval.

## 3. Human approval

```bash
intentcut approve intentcut.yaml reports/release-candidate-<token>.json \
  --by "Your Name" \
  --confirm <token>
```

Approval does not trust the candidate file's recorded pass. It runs final-mode
QA again against the current output, then recomputes the semantic revision and
rendered-media hash. A failed or preview-mode check, wrong token, changed
manifest or narration script, changed media, mismatched project/output, or
malformed candidate is rejected. The approver name and approval time are then
recorded in `release-approval-<token>.json` with authority state
`human-approved` and `released: false`.

Each approval record is created exclusively. IntentCut refuses to overwrite an
existing approval for the same candidate; a new candidate gets its own record.

## 4. Seal the approved artifact locally

```bash
intentcut seal intentcut.yaml reports/release-candidate-<token>.json \
  reports/release-approval-<token>.json
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

The release directory and receipt are never overwritten. Publication remains a
separate step requiring its own persisted human authorization.

## 5. Authorize one publication target

```bash
intentcut authorize-publication intentcut.yaml \
  releases/release-<token>/release-receipt.json \
  --adapter directory \
  --to ./delivery \
  --by "Your Name" \
  --confirm release-<token>
```

This command performs no publication. It verifies the sealed artifact, requires
the exact release id, and writes `publication-intent-directory.json` inside the
release bundle. The immutable intent binds a named human, the complete release
receipt digest, adapter, and absolute target.

## 6. Execute only the authorized intent

```bash
intentcut publish intentcut.yaml \
  releases/release-<token>/release-receipt.json \
  releases/release-<token>/publication-intent-directory.json
```

The initial `directory` adapter is a bounded reference implementation. It
copies the sealed artifact into `<target>/<release-id>/`, verifies the copied
SHA-256 and byte size, then writes an immutable publication receipt inside the
source release bundle. It refuses an existing target or completion receipt.

This adapter performs no network request and does not assert that the selected
directory is publicly visible. It can target an explicit delivery or synced
folder; any resulting exposure is determined by that folder. API-backed
adapters remain future implementations and must use the same prior-intent and
completion-receipt boundary.

## Authority boundary

- `render --final` produces validated media, not a release.
- `candidate` identifies one exact validated artifact, but does not approve it.
- `approve` records a human decision, but does not publish or copy media.
- `seal` creates a local release bundle from a still-current approval.
- `authorize-publication` records exact human intent but performs no delivery.
- `publish` can execute only that bound release, adapter, and target.
- MCP exposes no candidate, approval, release, or publication operation.
- The reference publication adapter performs no network request.

## What these records protect — and what they do not

The release ceremony is an **integrity binding for an honest operator**, not
access control.

It reliably prevents:

- approving, sealing, or publishing a different or changed artifact than the
  one reviewed — every step re-hashes intent and media and fails closed;
- approving an artifact that does not pass final-mode QA right now;
- accidental or repeated steps — records are exclusive and never overwritten;
- any consequential action by an agent limited to the MCP adapter, which has no
  path to these commands.

It does not prevent a process running with your user account's shell or file
access from writing these JSON records itself. The confirmation token is
derived from the candidate and printed by `candidate`; it confirms *which*
candidate, not *who*. Approver and publisher names are recorded as given.
Likewise, `human-final` narration is a declaration: IntentCut refuses the
obvious relabelling of generated audio, but cannot tell a person's voice from a
different synthetic file.

If an agent has unrestricted shell access in the same account, treat approval
records as a log of intent rather than proof of a human decision. Cryptographic
signing with a key the agent cannot read would be the next step toward that
stronger claim.

## Operational notes

- `render --preview` writes to the same `output.file` a candidate is bound to.
  Seal an approved candidate before rendering again, or the approval becomes
  stale (it fails closed; the media is not recoverable from the approval).
- If `publish` is interrupted after copying but before its receipt is written,
  the target `<release-id>` directory remains and a retry refuses to overwrite
  it. Inspect and remove that partial delivery directory manually before
  retrying.
