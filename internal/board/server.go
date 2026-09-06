package board

import (
	"encoding/json"
	"io/fs"
	"log"
	"net/http"
	"strconv"
	"strings"
)

// Handler is the whole surface: the scan as JSON, and the app that draws it.
//
// The server scans and extracts — statuses, frontmatter, raw markdown — and every
// choice about how that *reads* belongs to the client, markdown rendering included.
// A server that rendered would be a second place presentation lives.
func Handler(root string, app fs.FS) http.Handler {
	mux := http.NewServeMux()

	answer := func(w http.ResponseWriter, value any) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		if err := json.NewEncoder(w).Encode(value); err != nil {
			log.Printf("encode: %v", err)
		}
	}

	// The list ships no bodies: a board of sixty cards does not need sixty essays,
	// and the one being read is fetched by number.
	mux.HandleFunc("GET /api/board", func(w http.ResponseWriter, _ *http.Request) {
		tasks, err := Load(root)
		if err != nil {
			log.Printf("load: %v", err)
			http.Error(w, `{"error":"task tree unreadable"}`, http.StatusInternalServerError)
			return
		}
		light := make([]Task, len(tasks))
		for i, task := range tasks {
			task.Body = ""
			light[i] = task
		}
		answer(w, map[string]any{"statuses": Statuses, "tasks": light})
	})

	mux.HandleFunc("GET /api/task/{number}", func(w http.ResponseWriter, r *http.Request) {
		number, err := strconv.Atoi(r.PathValue("number"))
		if err != nil {
			http.NotFound(w, r)
			return
		}
		task, found, err := ByNumber(root, number)
		if err != nil {
			log.Printf("task %d: %v", number, err)
			http.Error(w, `{"error":"task tree unreadable"}`, http.StatusInternalServerError)
			return
		}
		if !found {
			http.NotFound(w, r)
			return
		}
		answer(w, task)
	})

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		answer(w, map[string]bool{"ok": true})
	})

	// Everything else is the app. A path like `/42` is client-side state — the app
	// reads it — so any route the mux does not own answers index.html, which is what
	// makes a deep link into a task shareable.
	static := http.FileServerFS(app)
	mux.HandleFunc("GET /", func(w http.ResponseWriter, r *http.Request) {
		name := strings.TrimPrefix(r.URL.Path, "/")
		if name != "" {
			if file, err := app.Open(name); err == nil {
				_ = file.Close()
				static.ServeHTTP(w, r)
				return
			}
		}
		index, err := fs.ReadFile(app, "index.html")
		if err != nil {
			// The binary was built without `make web` — say so rather than serving
			// a blank page that reads as the scanner being broken.
			http.Error(w, "web assets not built; run `make build`", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write(index)
	})

	return mux
}
