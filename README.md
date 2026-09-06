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
