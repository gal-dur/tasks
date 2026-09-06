// Package web carries the built board app inside the binary.
//
// `dist/` is esbuild's output, produced by `make web` in a node container — it is
// never committed (a build artifact in git rots in every diff) and never built on the
// host (npm runs in containers, always). A binary built without it says so at the
// door instead of serving a blank page.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var dist embed.FS

// App is the built application as a filesystem rooted at its own index.html.
func App() fs.FS {
	app, err := fs.Sub(dist, "dist")
	if err != nil {
		panic(err) // the embed directive guarantees the directory exists
	}
	return app
}
