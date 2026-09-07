# tasks

A repository's work, as files: one markdown file per task, **the folder is the
status** (`planned/`, `active/`, `done/`, `rejected/`), git is the history. This repo
ships both halves of that convention in one binary — a local viewer for any such
tree, and the skill that teaches agents to keep it.

```
tasks              serve the nearest tasks/ tree on http://127.0.0.1:8140
tasks serve -dir D -port P
tasks skill        install the agent-facing convention into ~/.claude/skills/tasks
tasks --version    which release this is
```

The server is a lens, never a hand: every route is a GET, it re-reads the tree per
request (a `git mv` shows on the next glance), and it binds loopback with no flag to
widen it. It scans and extracts — statuses, frontmatter, raw markdown — and the
embedded React app owns everything about how that reads.

Light and dark both, following the system until you say otherwise — the choice is a
property of the reader, so it lives in `localStorage` rather than the URL, and a link you
share never imposes your theme on whoever opens it.

Two views over the same tree, and the URL carries which: the **board** of four columns,
and a flat **list** (`?view=list`) for seeing everything at once. The list's columns sort,
ascending or descending, and that is in the URL too (`&sort=priority&dir=desc`), so
"everything by priority" is a thing you can link to. The board's own order is not a hidden
mode you cycle back to — it *is* status-ascending, the default, so clicking "Status" gets
you home.
Priority, size and status sort by rank rather than alphabetically, because high/low/medium
is not an order. Status shows as a progress bar: grey planned, yellow active, green done,
red rejected. A blocker's number is a button that opens it. The arrow keys step through an
opened task in whatever order is on screen.

**`is_human: true`** marks work only a person can do: a decision, an email, a signature.
The board badges it; the skill forbids an agent from selecting it, working it, or moving
it to `done/`. It is how "I am blocked on you" becomes a thing the tree can hold —
an agent task carries `depends_on` pointing at the human one.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gal-dur/tasks/master/install.sh | sh
```

Picks the release binary for your OS and architecture (by `uname`) and installs it
into `$HOME/bins` — putting that on PATH is yours.
Releases are cut by pushing a `vX.Y.Z` tag (`.github/workflows/release.yml`);
the tag is both the trigger and the version the binary reports.

From a checkout: `make install` (podman builds the app in a node container and the
binary in a Go container; no toolchain touches the host).

## The file format

Name: `{N}-{kebab-title}.md`, where N is an arrival ordinal — the next unused integer
across all four folders, assigned once and never reused. Frontmatter carries only
what git cannot:

```markdown
---
priority: high | medium | low
size: S | M | L          # optional
depends_on: [2, 4]       # optional
is_human: true           # optional — work an agent must never pick up
rejection_reason: ...    # required in rejected/, absent elsewhere
---

# Title

## Why
## Technical notes
## TODO
## Done when
```

The full convention — lifecycle, the behaviours owed to the user, why the folders are
the status — is the skill itself: `skills/tasks/SKILL.md`, which `tasks skill`
installs for every project on the machine.

## Develop

```sh
make build     # web app (node container) + binary (Go container) → bin/tasks
make test      # Go tests
make check     # tests + the app type-checked
make install   # → $HOME/bins/tasks
```
