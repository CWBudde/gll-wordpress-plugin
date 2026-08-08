<?php
/**
 * GLL Info internationalization
 *
 * Two separate jobs live here:
 *
 *   1. The PHP text domain, loaded from `/languages` so the strings in
 *      `gll-info.php` and `class-gll-patterns.php` can be translated.
 *   2. The JavaScript text domain, wired up per block script handle so the
 *      ~475 `__()` calls in the built bundles resolve against the
 *      `gll-info-<locale>-<handle>.json` files that WP-CLI generates from the
 *      POT/PO catalogue.
 *
 * Nothing here generates the catalogue itself; `languages/` ships empty and is
 * filled by the release tooling (`wp i18n make-pot` / `make-json`).
 *
 * Despite the `class-` filename — kept for consistency with the sibling files
 * in this directory — this file registers plain `gll_info_`-prefixed
 * functions, matching the registration style used throughout `gll-info.php`.
 *
 * @package GllInfo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Absolute filesystem path of the bundled translation directory.
 *
 * `wp_set_script_translations()` wants a real path here, while
 * `load_plugin_textdomain()` wants one relative to WP_PLUGIN_DIR — hence the
 * two different expressions below.
 */
define( 'GLL_INFO_LANGUAGES_DIR', GLL_INFO_PLUGIN_DIR . 'languages' );

/**
 * Load the PHP text domain.
 *
 * Hooked to `init` at priority 0 rather than `plugins_loaded`.
 *
 * Since WordPress 6.7 a text domain may not be loaded before `init`: doing so
 * fires a `_doing_it_wrong()` notice ("Translation loading for the <domain>
 * domain was triggered too early"), because the just-in-time loader needs the
 * locale, which user/filter code is only free to change up to `init`. The
 * plugin's stated minimum is WordPress 6.7, so `plugins_loaded` is simply
 * wrong here.
 *
 * Priority 0 keeps it ahead of the other `init` callbacks in this plugin that
 * translate at registration time — `gll_info_register_post_type()` (priority
 * 10) and `gll_info_register_block_patterns()` (priority 20).
 *
 * Strictly speaking WordPress 4.6+ would load the catalogue just in time on
 * the first `__()` call anyway; the explicit call is kept because it is what
 * makes a locally bundled `/languages` directory take precedence in a
 * predictable way, and it documents the Domain Path header.
 */
function gll_info_load_textdomain() {
	load_plugin_textdomain(
		'gll-info',
		false,
		dirname( plugin_basename( GLL_INFO_PLUGIN_FILE ) ) . '/languages'
	);
}
add_action( 'init', 'gll_info_load_textdomain', 0 );

/**
 * Point every block script of one kind at the plugin's JSON translations.
 *
 * WordPress derives block asset handles as
 * `str_replace( '/', '-', $block_name ) . '-' . $field` (see
 * `generate_block_asset_handle()`), so `gll-info/polar-plot` becomes
 * `gll-info-polar-plot-editor-script` / `-view-script`. The block names come
 * from `gll_info_get_block_names()` so this cannot drift from the registry.
 *
 * Handles are skipped when not registered: `wp_set_script_translations()` on
 * an unknown handle is a silent no-op today, but a block.json without the
 * matching `editorScript`/`viewScript` field would still leave a dangling
 * dependency behind. All seven current blocks declare both.
 *
 * @param string $field Asset handle suffix, either 'editor-script' or 'view-script'.
 */
function gll_info_set_block_script_translations( $field ) {
	if ( ! function_exists( 'wp_set_script_translations' ) ) {
		return;
	}

	foreach ( gll_info_get_block_names() as $block_name ) {
		$handle = str_replace( '/', '-', $block_name ) . '-' . $field;

		if ( ! wp_script_is( $handle, 'registered' ) ) {
			continue;
		}

		wp_set_script_translations( $handle, 'gll-info', GLL_INFO_LANGUAGES_DIR );
	}
}
