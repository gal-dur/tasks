// Package board reads a task tree — the folder is the status, git is the history —
// and serves it as JSON. It is a lens over the files, never a hand on them: every
// route is a GET, and there is no write path to disable because none was built.
package board

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"

	"gopkg.in/yaml.v3"
)

// Statuses in board order: the folder is the status, and these are the folders.
var Statuses = []string{"planned", "active", "done", "rejected"}

// Task is one file, parsed: the number and status from where it lives, the metadata
// from its frontmatter, the title from its first heading, the body as raw markdown —
// rendering is the client's, so nothing here knows what markdown looks like drawn.
type Task struct {
	Number          int    `json:"number"`
	Title           string `json:"title"`
	Status          string `json:"status"`
	Priority        string `json:"priority,omitempty"`
	Size            string `json:"size,omitempty"`
	DependsOn       []int  `json:"depends_on,omitempty"`
	RejectionReason string `json:"rejection_reason,omitempty"`
	// IsHuman marks work only a person can do — a decision, an email, a signature.
	// The board shows it; the skill forbids an agent from picking it up.
	IsHuman bool   `json:"is_human,omitempty"`
	Body    string `json:"body,omitempty"`
}

// The frontmatter carries only what git cannot — the same rule the task format
// itself states. Unknown keys are ignored rather than refused: this is a lens, and a
// lens that errors on a new field would block the field.
type frontmatter struct {
	Priority        string `yaml:"priority"`
	Size            string `yaml:"size"`
	DependsOn       []int  `yaml:"depends_on"`
	RejectionReason string `yaml:"rejection_reason"`
	IsHuman         bool   `yaml:"is_human"`
}

// Load reads every task under root, freshly on every call. Sixty small files is not a
// thing to cache: reading the tree per request is what makes a `git mv` visible on the
// next reload with no invalidation to get wrong.
func Load(root string) ([]Task, error) {
	var tasks []Task
	for _, status := range Statuses {
		entries, err := os.ReadDir(filepath.Join(root, status))
		if err != nil {
			if os.IsNotExist(err) {
				continue // a folder may legitimately be empty and unversioned
			}
			return nil, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			task, err := parse(filepath.Join(root, status, entry.Name()), status)
			if err != nil {
				return nil, fmt.Errorf("%s: %w", entry.Name(), err)
			}
			tasks = append(tasks, task)
		}
	}
	// Priority first, then arrival: what matters most sits at the top of its column,
	// and ties keep the order the numbers already record.
	sort.Slice(tasks, func(i, j int) bool {
		if a, b := priorityRank(tasks[i].Priority), priorityRank(tasks[j].Priority); a != b {
			return a < b
		}
		return tasks[i].Number < tasks[j].Number
	})
	return tasks, nil
}

// ByNumber finds one task wherever its folder is — N is assigned once and never
// reused, which is what makes it the stable address while folders change.
func ByNumber(root string, number int) (Task, bool, error) {
	tasks, err := Load(root)
	if err != nil {
		return Task{}, false, err
	}
	for _, task := range tasks {
		if task.Number == number {
			return task, true, nil
		}
	}
	return Task{}, false, nil
}

// FindRoot walks up from start looking for a task tree: a `tasks/` directory holding
// at least one of the status folders, or start itself being such a tree. Running the
// viewer from anywhere inside a repo should just work; naming the tree is the flag's
// job, not the reason the tool refuses to start.
func FindRoot(start string) (string, bool) {
	isTree := func(dir string) bool {
		for _, status := range Statuses {
			if info, err := os.Stat(filepath.Join(dir, status)); err == nil && info.IsDir() {
				return true
			}
		}
		return false
	}
	for dir := start; ; dir = filepath.Dir(dir) {
		if isTree(dir) {
			return dir, true
		}
		if candidate := filepath.Join(dir, "tasks"); isTree(candidate) {
			return candidate, true
		}
		if dir == filepath.Dir(dir) {
			return "", false
		}
	}
}

func priorityRank(priority string) int {
	switch priority {
	case "high":
		return 0
	case "medium":
		return 1
	case "low":
		return 2
	}
	return 3
}

func parse(path, status string) (Task, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Task{}, err
	}

	// {N}-{kebab-title}.md: the ordinal is the filename's own claim.
	name := filepath.Base(path)
	digits, _, found := strings.Cut(name, "-")
	if !found {
		return Task{}, fmt.Errorf("no number prefix in %q", name)
	}
	number, err := strconv.Atoi(digits)
	if err != nil {
		return Task{}, fmt.Errorf("no number prefix in %q", name)
	}

	task := Task{Number: number, Status: status}

	body := string(raw)
	if head, rest, cut := strings.Cut(strings.TrimPrefix(body, "---\n"), "\n---\n"); cut && head != body {
		var meta frontmatter
		if err := yaml.Unmarshal([]byte(head), &meta); err != nil {
			return Task{}, fmt.Errorf("frontmatter: %w", err)
		}
		task.Priority, task.Size = meta.Priority, meta.Size
		task.DependsOn, task.RejectionReason = meta.DependsOn, meta.RejectionReason
		task.IsHuman = meta.IsHuman
		body = rest
	}
	task.Body = strings.TrimSpace(body)

	// The title is the first heading, exactly as a reader finds it.
	for _, line := range strings.Split(task.Body, "\n") {
		if after, ok := strings.CutPrefix(line, "# "); ok {
			task.Title = strings.TrimSpace(after)
			break
		}
	}
	if task.Title == "" {
		task.Title = name
	}
	return task, nil
}
