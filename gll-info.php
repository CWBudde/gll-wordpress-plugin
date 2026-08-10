<?php
/**
 * Plugin Name:       GLL Info
 * Description:       Display GLL (Generic Loudspeaker Library) file data with interactive visualizations including frequency response charts, polar plots, and 3D balloon directivity.
 * Version:           0.1.0
 * Requires at least: 6.7
 * Requires PHP:      7.4
 * Author:            MeKo-Tech
 * Author URI:        https://github.com/MeKo-Tech
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       gll-info
 * Domain Path:       /languages
 *
 * @package GllInfo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

// Plugin constants.
define( 'GLL_INFO_VERSION', '0.1.0' );
define( 'GLL_INFO_PLUGIN_FILE', __FILE__ );
define( 'GLL_INFO_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'GLL_INFO_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

/**
 * Plugin activation hook.
 */
function gll_info_activate() {
	// Register post type on activation to flush rewrite rules.
	gll_info_register_post_type();
	flush_rewrite_rules();
}
register_activation_hook( __FILE__, 'gll_info_activate' );

/**
 * Plugin deactivation hook.
 */
function gll_info_deactivate() {
	flush_rewrite_rules();
}
register_deactivation_hook( __FILE__, 'gll_info_deactivate' );

/**
 * Register the GLL File custom post type.
 */
function gll_info_register_post_type() {
	$labels = array(
		'name'                  => _x( 'GLL Files', 'Post type general name', 'gll-info' ),
		'singular_name'         => _x( 'GLL File', 'Post type singular name', 'gll-info' ),
		'menu_name'             => _x( 'GLL Files', 'Admin Menu text', 'gll-info' ),
		'name_admin_bar'        => _x( 'GLL File', 'Add New on Toolbar', 'gll-info' ),
		'add_new'               => __( 'Add New', 'gll-info' ),
		'add_new_item'          => __( 'Add New GLL File', 'gll-info' ),
		'new_item'              => __( 'New GLL File', 'gll-info' ),
		'edit_item'             => __( 'Edit GLL File', 'gll-info' ),
		'view_item'             => __( 'View GLL File', 'gll-info' ),
		'all_items'             => __( 'All GLL Files', 'gll-info' ),
		'search_items'          => __( 'Search GLL Files', 'gll-info' ),
		'not_found'             => __( 'No GLL files found.', 'gll-info' ),
		'not_found_in_trash'    => __( 'No GLL files found in Trash.', 'gll-info' ),
		'archives'              => __( 'GLL File Archives', 'gll-info' ),
		'filter_items_list'     => __( 'Filter GLL files list', 'gll-info' ),
		'items_list_navigation' => __( 'GLL files list navigation', 'gll-info' ),
		'items_list'            => __( 'GLL files list', 'gll-info' ),
	);

	$args = array(
		'labels'             => $labels,
		'public'             => true,
		'publicly_queryable' => true,
		'show_ui'            => true,
		'show_in_menu'       => true,
		'show_in_rest'       => true,
		'query_var'          => true,
		'rewrite'            => array( 'slug' => 'gll-file' ),
		'capability_type'    => 'post',
		'has_archive'        => true,
		'hierarchical'       => false,
		'menu_position'      => 25,
		'menu_icon'          => 'dashicons-format-audio',
		'supports'           => array( 'title', 'editor', 'thumbnail', 'custom-fields' ),
	);

	register_post_type( 'gll_file', $args );
}
add_action( 'init', 'gll_info_register_post_type' );

/**
 * Registers the block using a `blocks-manifest.php` file.
 *
 * @see https://make.wordpress.org/core/2025/03/13/more-efficient-block-type-registration-in-6-8/
 */
function gll_info_block_init() {
	if ( function_exists( 'wp_register_block_types_from_metadata_collection' ) ) {
		wp_register_block_types_from_metadata_collection( __DIR__ . '/build', __DIR__ . '/build/blocks-manifest.php' );
		return;
	}

	if ( function_exists( 'wp_register_block_metadata_collection' ) ) {
		wp_register_block_metadata_collection( __DIR__ . '/build', __DIR__ . '/build/blocks-manifest.php' );
	}

	$manifest_data = require __DIR__ . '/build/blocks-manifest.php';
	foreach ( array_keys( $manifest_data ) as $block_type ) {
		register_block_type( __DIR__ . "/build/{$block_type}" );
	}
}
add_action( 'init', 'gll_info_block_init' );

/**
 * All block types shipped by this plugin.
 *
 * Every block loads the WASM parser on its own, so each one needs the
 * gllInfoSettings URLs — not just the top-level viewer. Derived from the block
 * registry rather than hardcoded, so adding or removing a block cannot leave
 * the enqueue logic silently out of step. Blocks are registered on `init`, and
 * every caller runs later than that.
 *
 * @return string[] Fully qualified block names.
 */
function gll_info_get_block_names() {
	$names = array();

	foreach ( WP_Block_Type_Registry::get_instance()->get_all_registered() as $block_name => $block_type ) {
		if ( 0 === strpos( $block_name, 'gll-info/' ) ) {
			$names[] = $block_name;
		}
	}

	return $names;
}

/**
 * Enqueue editor assets with WASM configuration.
 */
function gll_info_enqueue_editor_assets() {
	$settings = array(
		'wasmUrl'     => GLL_INFO_PLUGIN_URL . 'assets/wasm/gll.wasm',
		'wasmExecUrl' => GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
		'pluginUrl'   => GLL_INFO_PLUGIN_URL,
		'restUrl'     => rest_url( GLL_REST::NAMESPACE . '/' ),
		'nonce'       => wp_create_nonce( 'wp_rest' ),
	);

	// Attach to every block's editor script: any one of them may be the only
	// GLL block on the screen, and each resolves the WASM URLs independently.
	foreach ( gll_info_get_block_names() as $block_name ) {
		wp_localize_script(
			str_replace( '/', '-', $block_name ) . '-editor-script',
			'gllInfoSettings',
			$settings
		);
	}

	// Same moment, same handles: the editor bundles carry the bulk of the
	// translated strings, so their JSON catalogues have to be attached here.
	gll_info_set_block_script_translations( 'editor-script' );
}
add_action( 'enqueue_block_editor_assets', 'gll_info_enqueue_editor_assets' );

/**
 * Register the Go WebAssembly runtime.
 *
 * Registered, never enqueued here. Every block lists this handle in its
 * `viewScript` array, so the block renderer enqueues it exactly when a GLL block
 * is actually rendered — on a page with no GLL block nothing is queued at all.
 *
 * Priority 5 keeps it ahead of `gll_info_block_init()` at 10. Core resolves a
 * non-`file:` entry in `viewScript` to a bare handle without checking that it
 * exists (`register_block_script_handle()`), and an unregistered handle is a
 * silent no-op at enqueue time, so registering late would fail invisibly.
 *
 * wasm-loader injects this script itself when `window.Go` is undefined, so the
 * eager load is an optimization rather than a requirement: it saves a serial
 * round trip before the 4.2 MB WASM fetch can start.
 */
function gll_info_register_frontend_runtime() {
	wp_register_script(
		'gll-info-wasm-exec',
		GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
		array(),
		GLL_INFO_VERSION,
		true
	);
}
add_action( 'init', 'gll_info_register_frontend_runtime', 5 );

/**
 * Attach WASM configuration and translations to every block's view script.
 *
 * This deliberately does not ask whether the page contains a GLL block. It used
 * to, via `has_block()`, which inspects only the main post content — so a block
 * delivered through a template part, a widget, a reusable block or a
 * full-site-editing template got neither the settings nor its translations. The
 * settings had a hardcoded fallback in wasm-loader and so appeared to work on a
 * stock install; the translations had none and were simply missing.
 *
 * Attaching unconditionally costs nothing. `wp_localize_script()` and
 * `wp_set_script_translations()` write to the registered handle, and a
 * registered handle that is never enqueued prints nothing at all. The block
 * renderer remains the only thing that can put these scripts on a page, which is
 * the property the old gate was there to provide.
 *
 * The handles come from `gll_info_get_block_names()` for the same reason the
 * editor path does: derived from the registry, a block added later cannot be
 * left out.
 */
function gll_info_enqueue_frontend_assets() {
	$settings = array(
		'wasmUrl'     => GLL_INFO_PLUGIN_URL . 'assets/wasm/gll.wasm',
		'wasmExecUrl' => GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
		'pluginUrl'   => GLL_INFO_PLUGIN_URL,
		// The cached-subset endpoint the views try before booting WASM. No
		// nonce goes with it: the read route is public, because the visitors
		// who benefit from the cache are anonymous by definition, and a nonce
		// printed on a page served from a full-page cache would be stale anyway.
		'restUrl'     => rest_url( GLL_REST::NAMESPACE . '/' ),
	);

	foreach ( gll_info_get_block_names() as $block_name ) {
		wp_localize_script(
			str_replace( '/', '-', $block_name ) . '-view-script',
			'gllInfoSettings',
			$settings
		);
	}

	gll_info_set_block_script_translations( 'view-script' );
}
add_action( 'wp_enqueue_scripts', 'gll_info_enqueue_frontend_assets' );

// Include additional plugin files.
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-i18n.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-media.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-patterns.php';
// Ordered by dependency: the cache reads `GLL_Subset::VERSION` and writes
// through `GLL_Media`, and the REST routes use both.
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-subset.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-cache.php';
// The external-file tier sits on top of both: `GLL_URL_Cache` reuses
// `GLL_Cache::validate()`, and `GLL_Remote` warms it through `GLL_Parser`.
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-url-cache.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/parser/class-gll-parser-backend.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/parser/class-gll-parser-node.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/parser/class-gll-parser-cli.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/parser/class-gll-parser-phpwasm.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/parser/class-gll-parser.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-remote.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-rest.php';
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-settings.php';
