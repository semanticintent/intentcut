# Changelog

Notable changes to IntentCut. The reasoning behind each one, and what it cost,
is in [docs/PROGRESS.md](docs/PROGRESS.md).

IntentCut is pre-release: it has no published version and is run from a clone.

## Unreleased

### Added

- Video scenes accept up to eight ordered, non-overlapping focus movements,
  compiled into a single zoompan expression that returns to rest between them.
  `scene.set-camera` proposals take the same list.
- `synthetic-final` narration: a declared synthesised voice may be the final
  voice. A final render refuses scratch, not synthesis. The declaration is bound
  by the semantic revision and recorded in the release receipt.
- `external` publication adapter, which uploads nothing and records that a named
  human published an exact sealed artifact to a location they state. Publication
  receipts now record whether the tool or a person moved the bytes.
- A manifest's reach is bounded when it loads. Writes stay inside the project
  absolutely; reads from outside must be declared with `sources.outsideProject`.
- Continuous integration: typecheck and tests on Linux and macOS, plus the
  documented quickstart run verbatim on a fresh machine.
- `intentcut init` writes placeholder title cards, so a new production renders
  before anything has been made for it.
- A missing prerequisite explains itself: FFmpeg and `say` say what they are for
  and how to install them, instead of surfacing a bare ENOENT.

### Changed

- `intentcut approve` validates its arguments before re-running final QA, so a
  mistyped token costs milliseconds rather than a full render's analysis.
- Release and proposal artifacts resolve against the project first, then the
  working directory, so the documented relative paths work when running from a
  clone.
- Manifest validation errors name the file and a field path instead of printing
  raw validation JSON.
- Missing narration audio names the command that produces it.
- `generateTemporaryNarration` is now `generateSyntheticNarration` and covers
  both synthetic modes.

### Fixed

- Sectioned narration with no narration plan reported `human-final`, which would
  have let a project of prototypes pass a final check. It now fails closed.
