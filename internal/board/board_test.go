package board

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

// A three-file tree with every parsing case that matters: full frontmatter, a folded
// multiline rejection reason, and dependencies.
func tree(t *testing.T) string {
	t.Helper()
	root := t.TempDir()
	files := map[string]string{
		"planned/7-drawn-routes.md": "---\npriority: low\nsize: M\n---\n\n" +
			"# Drawn routes\n\nA **bold** claim.\n",
		"active/64-task-board.md": "---\npriority: medium\nsize: M\ndepends_on: [7]\n---\n\n" +
			"# A read-only task board\n\n- [ ] a checkbox\n",
		"rejected/11-effect-fp-ts.md": "---\npriority: low\nrejection_reason: >\n" +
			"  The chains read worse than\n  what they replaced.\n---\n\n" +
			"# Effect and fp-ts\n\nBody.\n",
	}
	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

// The app the tests serve: index.html is all the routing fallback needs.
var app = fstest.MapFS{
	"index.html": &fstest.MapFile{Data: []byte("<!doctype html><title>tasks</title>")},
	"board.js":   &fstest.MapFile{Data: []byte("// built")},
}

func TestLoadReadsWhatTheFilesSay(t *testing.T) {
	tasks, err := Load(tree(t))
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	if len(tasks) != 3 {
		t.Fatalf("got %d tasks, want 3", len(tasks))
	}
	// Priority sorts before number: medium 64 ahead of the two lows, lows by number.
	if tasks[0].Number != 64 || tasks[1].Number != 7 || tasks[2].Number != 11 {
		t.Fatalf("order = %d, %d, %d; want 64, 7, 11",
			tasks[0].Number, tasks[1].Number, tasks[2].Number)
	}

	board := tasks[0]
	if board.Title != "A read-only task board" || board.Status != "active" ||
		board.Size != "M" || len(board.DependsOn) != 1 || board.DependsOn[0] != 7 {
		t.Fatalf("parsed = %+v", board)
	}

	// The folded scalar is the reason yaml is a dependency: a hand parser would
	// truncate it at the first newline.
	rejected := tasks[2]
	if !strings.Contains(rejected.RejectionReason, "read worse than what they replaced") {
		t.Fatalf("rejection reason lost its fold: %q", rejected.RejectionReason)
	}
}

// A human task is a task like any other to the scanner — the flag is metadata it carries,
// not a second kind of file. What the flag *means* is the skill's business; what this has
// to guarantee is that it survives the round trip, because an agent that reads `false`
// where the file says `true` would take work that is not its own.
func TestAHumanTaskCarriesItsFlag(t *testing.T) {
	root := tree(t)
	path := filepath.Join(root, "planned", "80-decide-the-hosting.md")
	body := "---\npriority: high\nis_human: true\n---\n\n# Decide the hosting\n\nYours.\n"
	if err := os.WriteFile(path, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}

	tasks, err := Load(root)
	if err != nil {
		t.Fatalf("load: %v", err)
	}
	var found *Task
	for i := range tasks {
		if tasks[i].Number == 80 {
			found = &tasks[i]
		}
	}
	if found == nil {
		t.Fatal("the human task was not loaded at all")
	}
	if !found.IsHuman {
		t.Fatalf("is_human lost in parsing: %+v", found)
	}
	// Absence must read as false rather than as unset-and-therefore-anything: every
	// other task in the tree is the agent's to take.
	for _, task := range tasks {
		if task.Number != 80 && task.IsHuman {
			t.Fatalf("task %d claims to be human without saying so", task.Number)
		}
	}
}

func TestAMissingStatusFolderIsEmptyNotAnError(t *testing.T) {
	root := t.TempDir() // no folders at all
	tasks, err := Load(root)
	if err != nil || len(tasks) != 0 {
		t.Fatalf("tasks, err = %v, %v; want none, nil", tasks, err)
	}
}

func TestFindRootWalksUpToTheTree(t *testing.T) {
	root := tree(t)
	// From deep inside a repo whose tasks/ is the tree.
	repo := t.TempDir()
	nested := filepath.Join(repo, "backend", "internal")
	if err := os.MkdirAll(nested, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Rename(root, filepath.Join(repo, "tasks")); err != nil {
		t.Fatal(err)
	}
	found, ok := FindRoot(nested)
	if !ok || found != filepath.Join(repo, "tasks") {
		t.Fatalf("found %q, %v; want the repo's tasks/", found, ok)
	}
	// From inside the tree itself, the tree is the answer.
	if found, ok = FindRoot(filepath.Join(repo, "tasks")); !ok || found != filepath.Join(repo, "tasks") {
		t.Fatalf("from within: %q, %v", found, ok)
	}
	// Nowhere near one: refused, not guessed.
	if _, ok = FindRoot(t.TempDir()); ok {
		t.Fatal("a bare directory claimed to hold a task tree")
	}
}

func get(t *testing.T, server *httptest.Server, path string) (int, string) {
	t.Helper()
	response, err := server.Client().Get(server.URL + path)
	if err != nil {
		t.Fatalf("GET %s: %v", path, err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	return response.StatusCode, string(body)
}

func TestTheBoardAnswersEveryTaskWithoutBodies(t *testing.T) {
	server := httptest.NewServer(Handler(tree(t), app))
	defer server.Close()

	status, raw := get(t, server, "/api/board")
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	var answer struct {
		Statuses []string `json:"statuses"`
		Tasks    []Task   `json:"tasks"`
	}
	if err := json.Unmarshal([]byte(raw), &answer); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(answer.Statuses) != 4 || len(answer.Tasks) != 3 {
		t.Fatalf("statuses %d, tasks %d; want 4 and 3", len(answer.Statuses), len(answer.Tasks))
	}
	for _, task := range answer.Tasks {
		if task.Body != "" {
			t.Errorf("task %d shipped its body in the list", task.Number)
		}
	}
	// The metadata that draws a card survives the trip.
	if answer.Tasks[0].Number != 64 || answer.Tasks[0].DependsOn[0] != 7 {
		t.Fatalf("first card = %+v", answer.Tasks[0])
	}
}

func TestATaskAnswersItsRawMarkdown(t *testing.T) {
	server := httptest.NewServer(Handler(tree(t), app))
	defer server.Close()

	status, raw := get(t, server, "/api/task/7")
	if status != http.StatusOK {
		t.Fatalf("status = %d", status)
	}
	var task Task
	if err := json.Unmarshal([]byte(raw), &task); err != nil {
		t.Fatalf("decode: %v", err)
	}
	// Raw markdown, never HTML: rendering is the client's, and a server that sent
	// `<strong>` would be a second place presentation lives.
	if !strings.Contains(task.Body, "**bold**") || strings.Contains(task.Body, "<strong>") {
		t.Fatalf("body = %q", task.Body)
	}
	if task.Priority != "low" || task.Status != "planned" {
		t.Fatalf("metadata = %+v", task)
	}
}

func TestAnUnknownNumberIsNotFound(t *testing.T) {
	server := httptest.NewServer(Handler(tree(t), app))
	defer server.Close()
	for _, path := range []string{"/api/task/999", "/api/task/not-a-number"} {
		if status, _ := get(t, server, path); status != http.StatusNotFound {
			t.Errorf("GET %s = %d, want 404", path, status)
		}
	}
}

func TestDeepLinksAnswerTheApp(t *testing.T) {
	server := httptest.NewServer(Handler(tree(t), app))
	defer server.Close()
	// `/42` is client-side state; the server's answer is the app, which reads it.
	for _, path := range []string{"/", "/42"} {
		status, body := get(t, server, path)
		if status != http.StatusOK || !strings.Contains(body, "<title>tasks</title>") {
			t.Errorf("GET %s = %d, want the app", path, status)
		}
	}
	// A real asset is itself, not index.html.
	if _, body := get(t, server, "/board.js"); !strings.Contains(body, "// built") {
		t.Error("a static asset was swallowed by the fallback")
	}
}

// Read-only is a property, not a setting: there is no route a write could reach.
func TestNothingAnswersAWrite(t *testing.T) {
	server := httptest.NewServer(Handler(tree(t), app))
	defer server.Close()
	for _, path := range []string{"/api/board", "/api/task/7"} {
		response, err := server.Client().Post(server.URL+path, "text/plain", strings.NewReader("x"))
		if err != nil {
			t.Fatalf("POST %s: %v", path, err)
		}
		_ = response.Body.Close()
		if response.StatusCode != http.StatusMethodNotAllowed {
			t.Errorf("POST %s = %d, want 405", path, response.StatusCode)
		}
	}
}
