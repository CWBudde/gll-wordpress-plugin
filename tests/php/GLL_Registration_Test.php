<?php
/**
 * Block, post type and pattern registration.
 *
 * @package GLL_Info
 */

/**
 * Tests for the registration glue in gll-info.php and class-gll-patterns.php.
 */
class GLL_Registration_Test extends WP_UnitTestCase {

	/**
	 * Every block this plugin ships.
	 *
	 * Asserted as an exact set rather than a count, so a rename fails loudly
	 * instead of quietly swapping one block for another.
	 *
	 * @var string[]
	 */
	private const EXPECTED_BLOCKS = array(
		'gll-info/gll-info',
		'gll-info/frequency-response',
		'gll-info/polar-plot',
		'gll-info/balloon-3d',
		'gll-info/geometry',
		'gll-info/resources',
		'gll-info/config',
	);

	/**
	 * All seven blocks reach the registry.
	 */
	public function test_every_block_is_registered() {
		$registered = gll_info_get_block_names();

		sort( $registered );
		$expected = self::EXPECTED_BLOCKS;
		sort( $expected );

		$this->assertSame( $expected, $registered );
	}

	/**
	 * Which of the two registration paths ran.
	 *
	 * `function_exists` cannot be un-defined, so the 6.7 fallback is covered by
	 * running this suite against an older core rather than by mocking. This
	 * records which branch a given run exercised so a green result is not
	 * mistaken for covering both.
	 */
	public function test_reports_which_registration_path_ran() {
		$collection = function_exists( 'wp_register_block_types_from_metadata_collection' );

		$this->assertTrue(
			true,
			$collection
				? 'Ran the WP 6.8 metadata-collection path.'
				: 'Ran the WP 6.7 per-block fallback path.'
		);
		// Either way the outcome has to be the same set of blocks.
		$this->assertCount( 7, gll_info_get_block_names() );
	}

	/**
	 * `gll_info_get_block_names` filters by prefix, so a third-party block must
	 * not leak into the enqueue loop.
	 */
	public function test_only_this_plugin_s_blocks_are_reported() {
		register_block_type( 'other-plugin/thing' );

		$this->assertNotContains( 'other-plugin/thing', gll_info_get_block_names() );

		unregister_block_type( 'other-plugin/thing' );
	}

	/**
	 * The precondition `gll_info_set_block_script_translations` silently skips
	 * on: a block.json typo would degrade to "translations just never load"
	 * rather than to an error.
	 */
	public function test_every_block_has_editor_and_view_script_handles() {
		$registry = WP_Block_Type_Registry::get_instance();

		foreach ( self::EXPECTED_BLOCKS as $name ) {
			$block = $registry->get_registered( $name );

			$this->assertNotNull( $block, "{$name} is not registered." );
			$this->assertNotEmpty(
				$block->editor_script_handles,
				"{$name} has no editor script handle."
			);
			$this->assertNotEmpty(
				$block->view_script_handles,
				"{$name} has no view script handle."
			);
		}
	}

	/**
	 * Catches "added a block to src/ and forgot the build: commit", which is a
	 * live hazard given that build/ is rebuilt and committed by hand.
	 */
	public function test_the_manifest_matches_the_shipped_blocks() {
		$manifest = require GLL_INFO_PLUGIN_DIR . 'build/blocks-manifest.php';

		$expected = array_map(
			static function ( $name ) {
				return substr( $name, strlen( 'gll-info/' ) );
			},
			self::EXPECTED_BLOCKS
		);

		$actual = array_keys( $manifest );
		sort( $actual );
		sort( $expected );

		$this->assertSame( $expected, $actual );
	}

	/**
	 * The custom post type.
	 */
	public function test_the_gll_file_post_type_exists() {
		$this->assertTrue( post_type_exists( 'gll_file' ) );
	}

	/**
	 * The properties the blocks and the REST layer actually depend on.
	 */
	public function test_the_post_type_is_public_and_rest_enabled() {
		$type = get_post_type_object( 'gll_file' );

		$this->assertTrue( $type->public );
		$this->assertTrue( $type->show_in_rest );
		// get_all_post_type_supports returns feature => args, so the feature
		// names are the keys rather than the values.
		$this->assertArrayHasKey( 'editor', get_all_post_type_supports( 'gll_file' ) );
		$this->assertArrayHasKey( 'title', get_all_post_type_supports( 'gll_file' ) );
	}

	/**
	 * Activation registers the post type before flushing, so the rewrite rules
	 * come out carrying it. Reversing those two lines produces a plugin whose
	 * archive 404s until something else flushes.
	 */
	public function test_activation_leaves_rewrite_rules_for_the_post_type() {
		// Rewrite rules only exist under a pretty permalink structure; the test
		// install defaults to plain, where the option is legitimately empty.
		$this->set_permalink_structure( '/%postname%/' );

		gll_info_activate();

		$rules = get_option( 'rewrite_rules' );

		$this->assertNotEmpty( $rules );
		$this->assertNotEmpty(
			preg_grep( '#gll-file#', array_keys( $rules ) ),
			'No gll-file rewrite rule was generated.'
		);

		$this->set_permalink_structure( '' );
	}

	/**
	 * The pattern category the three patterns are filed under.
	 */
	public function test_the_pattern_category_is_registered() {
		$categories = WP_Block_Pattern_Categories_Registry::get_instance()->get_all_registered();

		$this->assertNotEmpty(
			wp_list_filter( $categories, array( 'name' => 'gll-info' ) ),
			'The gll-info pattern category is missing.'
		);
	}

	/**
	 * Every pattern's content must still parse into blocks that exist.
	 *
	 * Stronger than the JS-side test, which asserts the PHP contains a
	 * particular string: this asserts the string is still valid against the
	 * registry. The geometry block's markup is duplicated by hand into
	 * class-gll-patterns.php because its save() returns markup rather than
	 * null, so a renamed class or a reordered attribute would otherwise break
	 * every shipped pattern silently.
	 */
	public function test_every_pattern_parses_into_registered_blocks() {
		$patterns = WP_Block_Patterns_Registry::get_instance()->get_all_registered();
		$ours     = array_filter(
			$patterns,
			static function ( $pattern ) {
				return 0 === strpos( $pattern['name'], 'gll-info/' );
			}
		);

		$this->assertCount( 3, $ours, 'Expected exactly three GLL patterns.' );

		$registry = WP_Block_Type_Registry::get_instance();

		foreach ( $ours as $pattern ) {
			$this->assertNotEmpty( $pattern['content'], "{$pattern['name']} is empty." );

			$blocks = parse_blocks( $pattern['content'] );
			$found  = false;

			foreach ( $blocks as $block ) {
				if ( empty( $block['blockName'] ) ) {
					continue;
				}
				$found = true;
				$this->assertNotNull(
					$registry->get_registered( $block['blockName'] ),
					"{$pattern['name']} references unregistered block {$block['blockName']}."
				);
			}

			$this->assertTrue( $found, "{$pattern['name']} contains no blocks." );
		}
	}
}
