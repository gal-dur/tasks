# tasks

A tiny task tracker that lives inside your project as plain files — no Jira, no
database, no account. Every task is one markdown file. Which folder the file sits in
*is* its status: `planned/`, `active/`, `done/`, or `rejected/`. Moving a task means
moving the file, and because it all lives in git, git's log is automatically the full
history of every task.

This repository ships both halves of that idea in a single program:

- a **viewer** — a small local web server that shows any such `tasks/` folder as a
  board in your browser, and
- a **skill** — a set of written instructions that teaches AI coding agents (like
  Claude Code) how to create, pick up, and move tasks correctly.

```
tasks              find the nearest tasks/ folder and show it at http://127.0.0.1:8140
tasks serve -dir D -port P
tasks skill        install the agent instructions into ~/.claude/skills/tasks
tasks --version    print which release this is
```

## What the viewer does (and refuses to do)

The server is a lens, never a hand: it only ever *reads*. Every URL it serves is a
plain GET, and it re-reads the folder on every request — so if you rename or move a
file (say, with `git mv`), the change shows up on your next refresh, no restart
needed. It also only listens on `127.0.0.1` (your own machine), with no option to open
it to the network. Its job is to scan the files and extract structure — statuses,
metadata, the markdown text — and the web app built into the binary decides how all of
that looks.

It supports light and dark themes, following your operating system's setting until you
pick one yourself. Your choice is saved in your browser (`localStorage`), not in the
URL — so a link you share never forces your theme on whoever opens it.

There are two ways to view the same folder, and the URL records which one you're in:

- The **board**: four columns, one per status.
- The **list** (`?view=list`): every task in one flat table. Its columns are sortable,
  ascending or descending, and the sort lives in the URL too
  (`&sort=priority&dir=desc`) — so "everything, ordered by priority" is a link you can
  send to someone.

Priority, size and status sort by *rank*, not alphabetically — "high, medium, low" is
a meaningful order, and alphabetical would scramble it. Status is drawn as a progress
bar: grey for planned, yellow for active, green for done, red for rejected. If a task
is blocked by another, the blocker's number is a clickable button that opens it. Once
a task is open, the arrow keys step to the next or previous one in whatever order is
currently on screen.

## Tasks only a human can do

Some work an AI agent must never pick up on its own: making a decision, sending an
email, signing something. Mark such a task with **`is_human: true`** in its metadata.
The board shows a badge on it, and the skill explicitly forbids an agent from
selecting it, working on it, or moving it to `done/`.

This is how "I'm blocked on you" becomes something the folder itself can express: an
agent's task lists `depends_on` pointing at the human's task, and everyone — human or
agent — can see exactly where the work is stuck.

## Install

```sh
curl -fsSL https://raw.githubusercontent.com/gal-dur/tasks/master/install.sh | sh
```

The script detects your operating system and processor (via `uname`), downloads the
matching prebuilt binary, and puts it in `$HOME/bins`. Adding that folder to your
`PATH` is up to you.

New releases are published by pushing a git tag shaped like `vX.Y.Z` (the workflow is
in `.github/workflows/release.yml`); that tag both triggers the release and becomes
the version the binary reports.

To build from a checkout instead: `make install`. Podman (a container tool similar to
Docker) builds the web app in a Node container and the binary in a Go container — you
don't need Node or Go installed on your machine.

## The file format

Each task file is named `{N}-{kebab-title}.md` — for example `7-fix-login-bug.md`.
`N` is an arrival number: the next unused integer across all four folders, assigned
when the task is created and never reused, even after the task is done or rejected.

At the top of the file sits a small metadata block (called *frontmatter*). It carries
only what git cannot already tell you — git knows who wrote what and when, so the file
doesn't repeat it:

```markdown
---
priority: high | medium | low
size: S | M | L          # optional
depends_on: [2, 4]       # optional — numbers of tasks this one is blocked by
is_human: true           # optional — work an agent must never pick up
rejection_reason: ...    # required in rejected/, absent elsewhere
---

# Title

## Why
## Technical notes
## TODO
## Done when
```

The full convention — the task lifecycle, what behaviour the user is owed, why the
folders are the status — is written out in the skill itself: `skills/tasks/SKILL.md`.
Running `tasks skill` installs it once, and it then applies to every project on the
machine.

## Develop

```sh
make build     # web app (Node container) + binary (Go container) → bin/tasks
make test      # Go tests
make check     # tests + the web app type-checked
make install   # → $HOME/bins/tasks
```
