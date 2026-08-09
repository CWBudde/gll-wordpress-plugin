#!/usr/bin/env bash
#
# Bring both wp-env environments into a usable state after `wp-env start`.
#
# Two things need doing, and neither is optional.
#
# The plugin is mounted through `mappings` rather than `plugins` so that it
# lands at the `gll-info` slug — src/shared/wasm-loader.ts falls back to
# /wp-content/plugins/gll-info/assets/wasm/... when gllInfoSettings is absent,
# and a directory named after the repository would silently exercise a path no
# real install takes. The cost is that wp-env does not auto-activate it, and a
# plain `wp-env start` otherwise leaves it switched off.
#
# A theme must be active, which sounds cosmetic and is not. Core's
# get_block_asset_url() resolves a block's stylesheet URL by testing the asset
# path against `realpath( get_template_directory() )`. With no valid theme that
# realpath returns false, wp_normalize_path turns it into an empty string, and
# the resulting `str_starts_with( $path, '/' )` matches EVERY absolute path — so
# every block stylesheet is emitted as a theme URL with the server's absolute
# filesystem path glued on, 404s, and no block renders in the editor at all.
#
# Usage: run automatically via .wp-env.json lifecycleScripts.afterStart

set -euo pipefail

for env in cli tests-cli; do
	npx wp-env run "$env" wp plugin activate gll-info >/dev/null
	npx wp-env run "$env" wp theme activate twentytwentyfour >/dev/null
done

echo "wp-env: gll-info activated and a theme is in place in both environments."
