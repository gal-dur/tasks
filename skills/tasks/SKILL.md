---
name: tasks
description: Manage and execute this project's work items under tasks/ — create a task when work is planned or discussed, move it between planned/active/done/rejected, look up whether something already exists as a task, and block re-proposing rejected work without an explicit override. Also covers working a task to completion in an isolated git worktree and merging it back on green, including running several tasks in parallel. Use whenever the user proposes, discusses, starts, finishes or abandons a piece of work, asks what is planned or in flight, or says "work on task N" / "pick up a task" / "do this in a worktree".
---

# Task management

## When to use this

**Use this when** work is proposed, discussed, started, finished or abandoned; when
checking whether something already exists as a task; or when actually sitting down to
implement one.

Duplicated in the host project's `AGENTS.md` so the trigger is in force without loading
anything — and kept here so the skill travels to another repository intact. Nothing below
names a language, a build tool or a container runtime: where a project's own commands are
needed, the project states them in `AGENTS.md` and this skill defers to that.

Work lives in `tasks/` as one markdown file per item. The **folder is the status**, git
is the history — no status field, no timestamps, no changelog inside the file.

```
tasks/planned/    not started
tasks/active/     being worked on now
tasks/done/       finished
tasks/rejected/   decided against
```

## File format

Name: `{N}-{kebab-title}.md`, where **N is an arrival ordinal** — the next unused
integer across *all four* folders at the time the task is created.

- N is assigned once and **never reused, never renumbered**, not even when tasks are
  completed or rejected. It records when the task arrived, nothing else. Priority is a
  field precisely so that ordering never requires renaming files.
- Moving between folders never changes the name.

Frontmatter carries only what git cannot:

```markdown
---
priority: high | medium | low
size: S | M | L          # optional, rough effort
depends_on: [2, 4]       # optional, task numbers that must land first
is_human: true           # optional, see below — an agent may never work this
rejection_reason: ...    # required in tasks/rejected/, omitted everywhere else
---
```

**Dependencies must stay acyclic.** `depends_on` names tasks that have to land before
this one can start — not "relates to", which is what the body is for. Before adding one,
walk the chain: if following `depends_on` from the new edge leads back to the task you
started from, the cycle is the real finding, and it means the two tasks are one task or
the dependency is aspirational. Say so rather than recording it. A task may depend on one
already in `done/`; that edge is satisfied, and worth keeping as the record of why the
order was what it was.

## Human tasks — `is_human: true`

Some work is not the agent's at any price: sending an email, signing something, opening a
browser to a site that refuses automation, spending money, or **deciding** — a preference
nobody else can hold. These are ordinary tasks in the ordinary folders, marked
`is_human: true`.

**An agent must never pick up a human task. This is absolute, and it has no override
short of the user editing the frontmatter.**

Concretely:

- **Never select one.** Asked for "the next task", or to choose work, skip every
  `is_human: true` file as though it were not in `planned/` at all.
- **Named explicitly, decline and explain.** If asked to "do task N" and N is human, say
  what it is, say it is the user's, and offer the part that *is* yours — see below. Do not
  start it and stop halfway; do not do "just the easy bit".
- **Never move one to `done/`.** Only the user closes a human task, because only the user
  knows whether the email was sent or the decision made. An agent moving it would be
  asserting something it cannot know.
- **Never mark an agent task `is_human`** to get out of doing it. The flag records who the
  work belongs to, not how hard it is.

What an agent *should* do with human tasks:

- **Create them.** When work turns out to need a decision, an account, a signature or a
  human hand, file it as a human task immediately rather than mentioning it in passing.
  That is how the flag earns its keep.
- **Prepare the ground.** Draft the email, list the options with a recommendation, gather
  the facts the decision needs — then stop at the point where judgement or an account
  takes over, and say plainly where the line was.
- **Surface them.** When the user asks what is in flight, name the human tasks separately:
  these are the ones nothing will move without them.
- **Depend on them.** An agent task blocked on a decision should carry
  `depends_on: [<human task>]`. That is the honest way to record "cannot start", and it
  makes the board show what the whole queue is actually waiting on.

**Unblocking is the user's word, not an inference.** A human task ends when the user says
it does. When they do — "I've decided X", "sent it", "the account exists" — record the
outcome in the task body, move it to `done/`, and only then start whatever depended on it.
Never conclude from silence, from a commit, or from the work looking done that a human
task has been completed.

Body, in this order:

```markdown
# Title

## Why
The business case. What the user gets, and why it is worth doing at all. If this
section is hard to write, the task is probably not ready to plan.

## Technical notes
Research outcomes, constraints discovered, decisions already made, hazards. Anything
that would otherwise be rediscovered the expensive way. Link to `AGENTS.md` for rules
rather than restating them.

**This is where superseded approaches live, and they live nowhere else.** What was tried,
what it measured, why it lost — "Douglas–Peucker was quadratic and took 143 s on the
postcode perimeters" — belongs here, not in a comment beside the code that replaced it.
A file states what must hold in the present tense; the argument that got it there is a
decision, and this is where somebody goes looking for a decision. A code comment that
names a thing the code no longer is has the wrong reader.

## TODO
- [ ] Reasonably granular steps — each one a thing someone could sit down and do
- [ ] Tick them off in place as work lands

## Done when
The observable condition that ends the task.
```

## Lifecycle

Move with `git mv` so history follows the file:

```bash
git mv tasks/planned/7-drawn-routes.md tasks/active/7-drawn-routes.md
```

- **Work is discussed or planned** → create it in `tasks/planned/`. Do not plan to create
  tasks — just create them immediately. This includes ideas that arrive mid-conversation:
  if it is worth doing later, it is worth a file now.
- **Work starts** → move to `tasks/active/`.
- **Work finishes** → move to `tasks/done/`. Before moving, carry any rule or watch-out
  that still constrains future code into `AGENTS.md`: the task holds intentions,
  `AGENTS.md` holds rules.
- **Work is decided against** → move to `tasks/rejected/` and add `rejection_reason` to
  the frontmatter. Keep the body; the reasoning is the point.

Keep the TODO list current *while* working, not in a tidy-up afterwards. A task that
lags reality is worse than no task, because it is believed.

## Working a task

**Check `is_human` before anything else.** A task marked `is_human: true` is never worked
by an agent — not in a worktree, not partially, not "to save the user time". Decline, and
offer the preparation that is yours instead.

**Default to a git worktree for any task you implement.** One task, one worktree, one
branch, merged back on green. It keeps the main checkout untouched — no stashing to switch
context — and it is what lets two tasks be in flight without editing each other's files.

The exception is honest: for a one-line fix on a clean tree, a worktree is ceremony. Judge
by whether the work will survive a single sitting, not by the size of the diff you expect.

### Claim the task before branching

Move the task to `tasks/active/` **on the shared branch, and commit that move on its own**,
before creating the worktree. Two reasons, and the second is the one that bites:

- Anyone else looking at the tree can see the work is taken.
- **Task numbers are assigned from what exists.** Two worktrees each creating a task will
  both take the same next integer, and the collision only surfaces at merge. Numbers must
  be minted on the shared branch, never inside an isolated one.

### Create the worktree

Name it for the task — `74-aggregation-legality`, not `feature-x` — so `git worktree list`
reads as a list of work in progress. Branch from the shared branch's tip.

If the agent harness provides a worktree tool, prefer it: it will place the worktree
consistently and clean up on exit. Otherwise `git worktree add <path> -b <branch>`.

### A worktree contains only tracked files

Everything gitignored — dependency trees, build output, tool caches, local env files — is
absent from a fresh worktree. Two consequences, both worth handling before the first
command:

- **Caches keyed by directory name will cold-start.** If the project's tooling derives a
  cache or container identity from the working directory, pin it explicitly so every
  worktree shares one warm cache rather than each building its own from scratch. A project
  that cares about this says so in `AGENTS.md`; if it does, follow it exactly.
- **Anything the project needs that git does not carry** — credentials, certificates,
  generated schemas, seed data — has to be copied in or regenerated. Find out which before
  concluding the code is broken.

### Singleton resources serialise; plan around them

Checks that run as ephemeral processes and bind no ports parallelise freely. Anything that
binds a fixed port, writes a shared database, or drives the one browser on the machine does
not — a second worktree starting the same dev stack collides.

So: run the parallel-safe checks in every worktree, and treat the singleton ones as a
resource to take, use and hand back. Never start a second instance "just to check". If the
project has a scheme for per-task instances, `AGENTS.md` will describe it; otherwise
serialise deliberately and say so rather than discovering the collision.

### Verify before merging

In this order, and none of it optional:

1. The project's own full check — the one that covers *every* component, not only the one
   you touched. A change that type-checks locally can still break a caller elsewhere.
2. The tests for what you changed.
3. **If the change is visible, it has been seen working** — not merely covered by a green
   test. Tests assert what someone thought to assert; a screen asserts itself.

A failing check is fixed *in the worktree*. Never merge intending to fix on the shared
branch.

### Finish the task file, then land one commit

Before landing, in the worktree: tick the TODO items that actually landed and leave the
rest unticked, record superseded approaches in **Technical notes**, carry any lasting rule
into `AGENTS.md`, and `git mv` the task into `tasks/done/`. This is the same lifecycle as
above — it simply happens inside the worktree, as part of the work rather than after it.

**One task, one commit, and no merge commits.** Commit as freely as you like *inside* the
worktree — those are working notes, and nobody else will read them — but what reaches the
shared branch is a single commit whose message names the task. The task file moving from
`active/` to `done/` inside that same commit is what records that this was one task; a
merge bubble would say the same thing less legibly, and it makes the history harder to read
back later.

```bash
git switch <shared branch>
git merge --squash <branch>
# verify here — see below — then:
git commit
```

**Verify after staging and before committing.** `--squash` stages the work without
committing, which is precisely the right moment: two branches can each be green on their
own and still conflict semantically — a rename in one against a new caller in the other
type-checks only once both are present. Run the project's full check against the staged
tree. If the squash conflicts, merge the shared branch *into* the task branch first,
re-verify there, then squash clean.

### Clean up

Remove the worktree once the commit has landed; keep it only if the user wants to return to
it. Never remove one holding uncommitted work without first saying what would be lost.

A squashed branch still looks unmerged to git, because no commit on the shared branch has
it as an ancestor. Deleting it therefore needs `git branch -D`, and git's "not fully merged"
warning is expected here rather than a sign something went wrong — confirm the work is in
the shared branch's log first, then delete without ceremony.

### What conflicts between parallel worktrees

Predictable, and worth steering around rather than resolving repeatedly:

- **`tasks/` itself.** Two worktrees moving or adding task files collide constantly. This
  is why numbers are minted on the shared branch and why the move to `active/` is committed
  before branching.
- **`AGENTS.md`** — every finishing task wants to append a rule.
- **Dependency manifests and lock files** — any two tasks that add a package.
- **Shared infrastructure config** — build files, CI, container definitions.

Work that respects the project's own directory boundaries merges without conflict. Work
that touches the files above should, where possible, be one task at a time.

## Behaviours this skill owes the user

**Point at existing tasks.** Before answering a request to build something, check
whether it already exists:

```bash
ls tasks/*/ ; grep -ril "<topic>" tasks/
```

If it does, say so and name the path and folder — "that's `tasks/planned/3-alerts.md`"
— rather than silently starting fresh work or duplicating the entry. This is explicitly
wanted: the user will forget what has been filed and should be pointed back to it.

**Block rejected work.** If the user proposes something that lives in `tasks/rejected/`,
**stop and say so before doing any of it**. Quote the `rejection_reason`, then ask for
an explicit override. Do not begin implementing on the assumption that raising it again
implies reconsideration — the whole point of the folder is that these were decided, and
re-deciding should be deliberate. If the user does override, move the file back to
`tasks/planned/` (or `active/`), strip `rejection_reason`, and record in the body what
changed to justify the reversal.

**Do not silently renumber, merge or delete tasks.** Superseded work is rejected with a
reason pointing at what replaced it.

**Never work, close, or quietly reinterpret a human task.** `is_human: true` means the
work belongs to the user. Point at them, prepare what can be prepared, and wait to be told
the outcome.

**Report what was actually verified.** When handing back a finished task, state which
checks ran and their result, whether a visible change was seen working, and anything that
was skipped. A report implying more verification than happened is worse than no report,
because it is acted on.
