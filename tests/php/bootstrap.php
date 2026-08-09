<?php
/**
 * PHPUnit bootstrap for the WordPress integration tests.
 *
 * These run against a real WordPress inside wp-env's `tests-wordpress`
 * container, not against mocks. That is deliberate: this plugin's PHP is almost
 * entirely registration glue — `register_block_type`, `upload_mimes`,
 * `wp_check_filetype_and_ext`, `WP_Block_Type_Registry`, `register_block_pattern`
 * — so a mocked harness would assert that the mocks were configured the way
 * they were configured.
 *
 * @package GLL_Info
 */

$gll_tests_dir = getenv( 'WP_TESTS_DIR' );

if ( ! $gll_tests_dir ) {
	$gll_tests_dir = '/wordpress-phpunit';
}

if ( ! file_exists( $gll_tests_dir . '/includes/functions.php' ) ) {
	echo "Could not find the WordPress test suite at {$gll_tests_dir}.\n";
	echo "Run these through wp-env: npm run test:php\n";
	exit( 1 );
}

// The core bootstrap resolves the polyfills relative to its own location, which
// lands outside the plugin, so it has to be told where ours are. Without this
// it aborts before running a single test.
if ( ! defined( 'WP_TESTS_PHPUNIT_POLYFILLS_PATH' ) ) {
	define(
		'WP_TESTS_PHPUNIT_POLYFILLS_PATH',
		dirname( __DIR__, 2 ) . '/vendor/yoast/phpunit-polyfills'
	);
}

require_once $gll_tests_dir . '/includes/functions.php';

/**
 * Load the plugin before WordPress finishes booting.
 *
 * `muplugins_loaded` fires before `init`, which matters: the textdomain hooks
 * `init` at priority 0 and the post type and patterns at 10 and 20, so loading
 * any later would skip the ordering these tests are partly here to verify.
 */
function gll_info_manually_load_plugin() {
	require dirname( __DIR__, 2 ) . '/gll-info.php';
}
tests_add_filter( 'muplugins_loaded', 'gll_info_manually_load_plugin' );

require $gll_tests_dir . '/includes/bootstrap.php';
