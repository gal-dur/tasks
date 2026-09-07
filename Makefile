# Host toolchains stay off this machine: Go and node each run in a container, with
# their caches on named volumes so a warm build fetches and compiles nothing twice.
IMAGE_GO   := docker.io/library/golang:1.27
IMAGE_NODE := docker.io/library/node:22
RUN_GO     := podman run --rm -v $(PWD):/src -v tasks-go:/go -w /src -e CGO_ENABLED=0
# node_modules rides a named volume mounted over the checkout (gitignored; the host
# side is an empty directory podman creates). This repo has exactly one node project,
# so the shadowing that bit a multi-project harness has nothing to evict here.
RUN_NODE   := podman run --rm -v $(PWD)/web:/web -v tasks-node:/web/node_modules \
              -v tasks-npm:/root/.npm -w /web

.PHONY: web build test check install clean

# The version is git's own description, computed on the host (the container's git
# would balk at the mounted repo's ownership) and injected the same way the release
# workflow injects it.
VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)

# The target platform: this machine's, unless overridden (`make build GOOS=linux
# GOARCH=arm64`). Pure Go, so a cross-build is a flag and not a toolchain.
GOOS   ?= $(shell uname -s | tr '[:upper:]' '[:lower:]')
GOARCH ?= $(shell uname -m | sed -e 's/x86_64/amd64/' -e 's/aarch64/arm64/')

# The board app, built into web/dist for go:embed. `npm install` rather than `npm ci`
# deliberately: ci deletes node_modules first, which would cold-start the volume on
# every build — the lockfile still pins what installs.
web:
	$(RUN_NODE) $(IMAGE_NODE) sh -c "npm install --no-audit --no-fund && npm run build"

build: web
	$(RUN_GO) -e GOOS=$(GOOS) -e GOARCH=$(GOARCH) $(IMAGE_GO) \
	  go build -trimpath \
	  -ldflags="-s -w -X main.version=$(VERSION)" -o bin/tasks ./cmd/tasks

test:
	$(RUN_GO) $(IMAGE_GO) go test ./...

# The whole of "am I done": the Go tests, and the app type-checked.
check: test
	$(RUN_NODE) $(IMAGE_NODE) sh -c "npm install --no-audit --no-fund && npm run check"

# One fixed, user-owned destination: $HOME/bins. Putting it on PATH is the user's
# call, and the install says so rather than editing anyone's shell profile.
#
# **Landed by rename, never written through.** The copy goes beside the target and is
# renamed over it, which is atomic on one filesystem: an interrupted install leaves the
# previous binary intact rather than a truncated file that still carries the execute bit.
# The fresh inode is the second reason — replacing an executable's contents underneath a
# path macOS has already validated can leave the kernel holding a stale code signature for
# it, which presents as an immediate `Killed: 9` with nothing logged and no clue at the
# call site. Renaming sidesteps both.
install: build
	@mkdir -p "$$HOME/bins" && cp bin/tasks "$$HOME/bins/.tasks.new" && \
	  chmod 0755 "$$HOME/bins/.tasks.new" && \
	  mv -f "$$HOME/bins/.tasks.new" "$$HOME/bins/tasks" && \
	  echo "tasks: installed to $$HOME/bins/tasks"; \
	case ":$$PATH:" in \
	  *":$$HOME/bins:"*) ;; \
	  *) echo "tasks: note — $$HOME/bins is not on your PATH";; \
	esac

clean:
	rm -rf bin web/dist
	@mkdir -p web/dist && touch web/dist/.keep
