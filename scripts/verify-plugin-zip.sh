#!/usr/bin/env bash
#
# Assert that the packaged plugin is actually installable.
#
# `wp-scripts plugin-zip` prints what it added, but reading that log is not a
# check — it is a hope. This asserts against the archive itself.
#
# The rule this exists to enforce: the packer only honours the `files` field in
# package.json. It does NOT read .distignore or .gitattributes, and its fallback
# glob omits assets/**. A ZIP without gll.wasm installs cleanly and then cannot
# parse a single file, because every block parses client-side through that
# module.
#
# Usage: scripts/verify-plugin-zip.sh [path-to-zip]

set -euo pipefail

ZIP="${1:-gll-info.zip}"

if [ ! -f "$ZIP" ]; then
	echo "verify-plugin-zip: no archive at $ZIP (run 'npm run plugin-zip' first)" >&2
	exit 1
fi

fail=0

# Print the archive listing once; every check greps this rather than re-reading.
listing="$(unzip -l "$ZIP")"

require() {
	if printf '%s' "$listing" | grep -Fq "$1"; then
		echo "  ok       $1"
	else
		echo "  MISSING  $1" >&2
		fail=1
	fi
}

forbid() {
	if printf '%s' "$listing" | grep -Eq "$1"; then
		echo "  PRESENT  $1 (must not ship)" >&2
		fail=1
	else
		echo "  ok       absent: $1"
	fi
}

echo "Verifying $ZIP"
echo
echo "WASM parser and icon (the files the fallback glob drops):"
require 'gll-info/assets/wasm/gll.wasm'
require 'gll-info/assets/wasm/wasm_exec.js'
require 'gll-info/assets/images/gll-icon.svg'

echo
echo "Plugin bootstrap:"
require 'gll-info/gll-info.php'
require 'gll-info/includes/class-gll-media.php'
require 'gll-info/includes/class-gll-i18n.php'
require 'gll-info/includes/class-gll-patterns.php'
require 'gll-info/build/blocks-manifest.php'
require 'gll-info/readme.txt'

echo
echo "All seven blocks:"
for block in gll-info frequency-response polar-plot balloon-3d geometry resources config; do
	require "gll-info/build/$block/block.json"
done

echo
echo "Nothing that must never ship:"
forbid 'gll-info/node_modules/'
forbid 'gll-info/src/'
forbid 'gll-info/tests/'
forbid 'gll-info/package-lock\.json'

echo
echo "Payload integrity:"
# Present-but-truncated is a real failure mode, and a listing check cannot see
# it. The real module is around 4.8 MB.
# `|| true` inside the group: with `set -o pipefail`, an absent member makes
# unzip exit 11 and would abort the script before the check below could report
# it as a normal failure.
wasm_bytes="$(
	{ unzip -p "$ZIP" 'gll-info/assets/wasm/gll.wasm' 2>/dev/null || true; } |
		wc -c
)"
if [ "$wasm_bytes" -gt 4000000 ]; then
	echo "  ok       gll.wasm is $wasm_bytes bytes"
else
	echo "  TOO SMALL gll.wasm is $wasm_bytes bytes, expected > 4000000" >&2
	fail=1
fi

echo
if [ "$fail" -ne 0 ]; then
	echo "verify-plugin-zip: FAILED" >&2
	exit 1
fi
echo "verify-plugin-zip: all checks passed"
