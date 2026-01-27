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
 *
 * @package GllInfo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Exit if accessed directly.
}

// Plugin constants.
define( 'GLL_INFO_VERSION', '0.1.0' );
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
 * Enqueue editor assets with WASM configuration.
 */
function gll_info_enqueue_editor_assets() {
	// Pass WASM URLs to JavaScript.
	wp_localize_script(
		'gll-info-gll-info-editor-script',
		'gllInfoSettings',
		array(
			'wasmUrl'     => GLL_INFO_PLUGIN_URL . 'assets/wasm/gll.wasm',
			'wasmExecUrl' => GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
			'pluginUrl'   => GLL_INFO_PLUGIN_URL,
			'restUrl'     => rest_url( 'gll-info/v1/' ),
			'nonce'       => wp_create_nonce( 'wp_rest' ),
		)
	);
}
add_action( 'enqueue_block_editor_assets', 'gll_info_enqueue_editor_assets' );

/**
 * Enqueue frontend assets for GLL blocks.
 */
function gll_info_enqueue_frontend_assets() {
	// Only enqueue if a GLL block is present.
	if ( ! has_block( 'gll-info/gll-info' ) ) {
		return;
	}

	// Enqueue wasm_exec.js for frontend.
	wp_enqueue_script(
		'gll-info-wasm-exec',
		GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
		array(),
		GLL_INFO_VERSION,
		true
	);

	// Pass WASM URL to frontend.
	wp_localize_script(
		'gll-info-wasm-exec',
		'gllInfoSettings',
		array(
			'wasmUrl'     => GLL_INFO_PLUGIN_URL . 'assets/wasm/gll.wasm',
			'wasmExecUrl' => GLL_INFO_PLUGIN_URL . 'assets/wasm/wasm_exec.js',
			'pluginUrl'   => GLL_INFO_PLUGIN_URL,
		)
	);
}
add_action( 'wp_enqueue_scripts', 'gll_info_enqueue_frontend_assets' );

// Include additional plugin files.
require_once GLL_INFO_PLUGIN_DIR . 'includes/class-gll-media.php';
