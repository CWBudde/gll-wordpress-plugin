#!/usr/bin/env bash
#
# Regenerate languages/gll-info.pot.
#
# Two things about this are load-bearing and neither is obvious.
#
# It must scan build/, not just src/. Core resolves a script translation by
# hashing the script's path relative to the plugin directory:
#
#     gll-info-<locale>-<md5 of e.g. "build/polar-plot/view.js">.json
#
# and `wp i18n make-json` computes that md5 from the source references recorded
# in the POT. A POT that references src/polar-plot/view.ts therefore produces
# JSON files named after paths that do not exist in the shipped plugin, core
# never finds them, and all ~476 strings stay English with nothing failing.
# Verified end to end: make-json emits a `source` field naming the built bundle,
# and the filename is exactly md5 of that value.
#
# It also needs far more memory than the default. WP-CLI parses JavaScript with
# peast, and the minified bundles (the largest is over 700 KB) exhaust the 128 MB
# default with a fatal error. WP_CLI_PHP_ARGS is ignored by the phar, so the
# limit has to be passed to the php binary directly.
#
# Because the POT reads build/, run `npm run build` first.
#
# Usage: npm run i18n:pot

set -euo pipefail

PLUGIN_DIR=/var/www/html/wp-content/plugins/gll-info

npx wp-env run cli /bin/bash -c "
	cd $PLUGIN_DIR &&
	php -d memory_limit=3G /usr/local/bin/wp i18n make-pot . languages/gll-info.pot \
		--slug=gll-info \
		--domain=gll-info \
		--exclude=node_modules,tests,docs,.github,.trunk,scripts,coverage \
		--allow-root
"
