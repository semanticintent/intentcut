# Contributing

IntentCut is pre-release and developed in the open. Issues and pull requests are
welcome.

## Running it

```bash
npm install
npm run check          # typecheck + tests
npm run example:media  # self-contained quickstart media
```

You need Node 22 or newer and FFmpeg with `ffprobe` on your `PATH`. FFmpeg is a
test dependency too: several tests probe and render real media rather than
stubbing a probe. The macOS `say` command is used only for temporary narration
and no test invokes it, so the suite runs on Linux as well.

## What a change should come with

Everything this project claims is enforced by a refusal — a case where it
declines rather than proceeding. If you add or change a guarantee, add the test
that proves it refuses, not only the one that proves it works. The suite is full
of these and they are the point: an approval that cannot go stale, a manifest
that cannot write outside itself, a scratch voice that cannot ship.

Documentation is part of the change. `README.md` states what the tool does,
`docs/PROGRESS.md` records why a decision was made and what it cost. If a claim
in the README stops being exactly true, the change is not finished.

## Commit messages

Say what changed and why it was worth changing. The existing history is the
model: what was wrong, what the fix assumes, and what it deliberately does not
do. Prose, not bullet points.

## Constraints that are not preferences

Some choices here look like taste and are not. The clearest is narration:
rendering the same manifest twice produces byte-identical output, and narration
is an input to the render, so a speech synthesiser that samples would break the
central claim. That rules out most of the models with the best scores and the
most useful features. If you are changing anything in that area, read
[docs/PROGRESS.md](docs/PROGRESS.md) first — a change that improves how the
output sounds while making it unreproducible will pass every check in the suite
and still be wrong.

## Scope

The bounded first release is described in [docs/MVP.md](docs/MVP.md). A change
that widens an authority boundary — what an agent may do, what may be written
where, what may ship — needs its reasoning in the pull request, because those
boundaries are the product rather than an implementation detail.
