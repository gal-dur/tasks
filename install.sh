#!/bin/sh
# Install the latest released tasks into $HOME/bins. Putting that on PATH is yours —
# this script never edits a shell profile; it only says when it would matter.
set -eu

# Release assets are named tasks-<goos>-<goarch>; uname maps onto that here.
case "$(uname -s)" in
  Darwin) goos=darwin ;;
  Linux)  goos=linux ;;
  *) echo "tasks: unsupported OS: $(uname -s) (darwin and linux only)" >&2; exit 1 ;;
esac
case "$(uname -m)" in
  x86_64)        goarch=amd64 ;;
  arm64|aarch64) goarch=arm64 ;;
  *) echo "tasks: unsupported architecture: $(uname -m) (amd64 and arm64 only)" >&2; exit 1 ;;
esac
asset="tasks-$goos-$goarch"
base="https://github.com/gal-dur/tasks/releases/latest/download"

# Verified before installed, against the SHA256SUMS the release workflow publishes.
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$base/$asset" -o "$tmp/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
if command -v sha256sum >/dev/null 2>&1; then sum="sha256sum"; else sum="shasum -a 256"; fi
(cd "$tmp" && grep " $asset\$" SHA256SUMS | $sum -c - >/dev/null) \
  || { echo "tasks: $asset failed its checksum; not installing" >&2; exit 1; }

mkdir -p "$HOME/bins"
install -m 0755 "$tmp/$asset" "$HOME/bins/tasks"
echo "tasks: installed $("$HOME/bins/tasks" --version 2>/dev/null || echo tasks) to $HOME/bins/tasks"
case ":$PATH:" in
  *":$HOME/bins:"*) ;;
  *) echo "tasks: note — \$HOME/bins is not on your PATH" ;;
esac
