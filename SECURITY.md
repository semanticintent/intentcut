# Security

## Reporting

Report a vulnerability privately through GitHub's
[security advisories](https://github.com/semanticintent/intentcut/security/advisories/new)
rather than a public issue.

## What IntentCut protects, and what it does not

This matters more than usual here, because the project's records could be
mistaken for guarantees they do not make.

**The release ceremony is an integrity binding for an honest operator.** It binds
a human decision to an exact artifact and makes accidents fail closed: an
approval goes stale the moment the intent or the media changes, a record cannot
be overwritten, and a scratch narration track cannot reach an audience by being
forgotten about.

**It is not access control.** A process running with your shell and file access
can write the same JSON records IntentCut writes. The confirmation token is
derived from the candidate, not from a secret. See
[docs/RELEASE.md](docs/RELEASE.md#what-these-records-protect--and-what-they-do-not).

**The agent surface is bounded by construction.** The MCP adapter exposes two
read-only tools, opens no network listener, and grants no manifest write, process
execution, recording, ingestion, approval, or publication authority. A proposal
cannot express a file path.

**A manifest's reach is bounded when it loads.** A production only ever writes
inside its own directory, checked lexically and through symlinked directories,
and reading media from outside must be declared. This bounds accidents and
sharing mistakes; it is not a sandbox, and a manifest still drives FFmpeg.

**Publication receipts distinguish who acted.** The `external` adapter records
that a person published something; it uploads nothing and does not verify that
the location resolves. Treat its `location` as a statement by the named person,
not as a fact the tool checked.

## Untrusted manifests

Do not run IntentCut against a manifest you have not read. It is a compiler: it
invokes FFmpeg over the media the manifest names. The load-time bounds above
limit where it can write, not what a legitimate render can do.
