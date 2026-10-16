#!/usr/bin/env bash
# Runs the tool-selection eval suite against a temporary copy of the plugin (so evals don't ship in it).
# MCP tools are mocked from evals/mocks; the real ncrypted server never runs. Extra args pass through.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$ROOT/plugins/ncrypted" "$TMP/ncrypted"
cp -R "$ROOT/evals" "$TMP/ncrypted/evals"
mkdir -p "$ROOT/evals/results"
claude plugin eval "$TMP/ncrypted" --trust-plugin --no-publish --ablation none \
  --json "$ROOT/evals/results/latest.json" --output-dir "$ROOT/evals/results/latest" "$@"
