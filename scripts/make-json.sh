#!/usr/bin/env bash
#
# Build the per-script translation JSON that Gutenberg reads at runtime.
#
# Not part of the release path, deliberately. If this plugin is ever listed on
# WordPress.org, translate.wordpress.org generates the language packs and
# WordPress fetches them; bundled JSON would only go stale. This exists for
# off-directory distribution, and for verifying the chain by hand.
#
# Run it after `npm run i18n:pot` and after dropping a translated
# languages/gll-info-<locale>.po alongside the POT.
#
# Usage: npm run i18n:json

set -euo pipefail

PLUGIN_DIR=/var/www/html/wp-content/plugins/gll-info

npx wp-env run cli /bin/bash -c "
	cd $PLUGIN_DIR &&
	php -d memory_limit=2G /usr/local/bin/wp i18n make-json languages \
		--no-purge \
		--pretty-print \
		--allow-root
"
