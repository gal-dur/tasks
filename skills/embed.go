// Package skills carries the agent-facing task convention inside the binary, so one
// artifact distributes both halves: the viewer, and the rules that teach agents to
// feed it. `tasks skill` writes this file into ~/.claude/skills/tasks/.
package skills

import _ "embed"

//go:embed tasks/SKILL.md
var Tasks []byte
