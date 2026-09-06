// Command tasks views a repository's task tree and installs the convention that
// feeds it.
//
//	tasks                 serve the nearest tasks/ tree on 127.0.0.1
//	tasks serve [-dir D] [-port P]
//	tasks skill           install the agent-facing skill into ~/.claude/skills/tasks
//	tasks --version
//
// The files stay the source of truth — the folder is the status, git is the history —
// and the server is a lens over them, never a hand on them.
package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/gal-dur/tasks/internal/board"
	"github.com/gal-dur/tasks/skills"
	"github.com/gal-dur/tasks/web"
)

// Injected by the build; `dev` outside one.
var version = "dev"

// Loopback, deliberately hard-coded: a task board is a private window onto a
// checkout, and a bind-any address would publish it to every device on the network.
// There is no flag to widen this.
const host = "127.0.0.1"

func main() {
	args := os.Args[1:]
	if len(args) > 0 {
		switch args[0] {
		case "--version", "-v", "version":
			fmt.Println("tasks", version)
			return
		case "skill":
			if err := installSkill(); err != nil {
				log.Fatal(err)
			}
			return
		case "serve":
			args = args[1:]
		}
	}
	if err := serve(args); err != nil {
		log.Fatal(err)
	}
}

func serve(args []string) error {
	flags := flag.NewFlagSet("serve", flag.ExitOnError)
	dir := flags.String("dir", "", "task tree to serve (default: the nearest tasks/ walking up from here)")
	port := flags.Int("port", 8140, "port on 127.0.0.1")
	if err := flags.Parse(args); err != nil {
		return err
	}

	root := *dir
	if root == "" {
		here, err := os.Getwd()
		if err != nil {
			return err
		}
		found, ok := board.FindRoot(here)
		if !ok {
			return fmt.Errorf("no tasks/ tree between here and /; create tasks/planned/ or pass -dir")
		}
		root = found
	}

	address := fmt.Sprintf("%s:%d", host, *port)
	server := &http.Server{
		Addr:              address,
		Handler:           board.Handler(root, web.App()),
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Printf("tasks: %s on http://%s", root, address)
	return server.ListenAndServe()
}

// installSkill writes the embedded convention into the user-level skill directory,
// where every project's agents find it. Overwrites: the binary's copy is the version
// being distributed, and a stale skill kept out of politeness is worse than none.
func installSkill() error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	target := filepath.Join(home, ".claude", "skills", "tasks")
	if err := os.MkdirAll(target, 0o755); err != nil {
		return err
	}
	path := filepath.Join(target, "SKILL.md")
	if err := os.WriteFile(path, skills.Tasks, 0o644); err != nil {
		return err
	}
	fmt.Println("tasks: skill installed to", path)
	return nil
}
