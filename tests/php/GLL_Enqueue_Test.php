<?php
/**
 * Asset localization, translation loading and the frontend enqueue gate.
 *
 * @package GLL_Info
 */

/**
 * Tests for gll_info_enqueue_*_assets and the i18n wiring.
 */
class GLL_Enqueue_Test extends WP_UnitTestCase {

	/**
	 * Drop the frontend runtime from the queue.
	 *
	 * `$wp_scripts` survives between tests in the same class, so a "must not be
	 * enqueued" assertion would otherwise pass or fail on whatever an earlier
	 * test left behind. Only this one handle is dequeued rather than resetting
	 * the whole global, because a reset would also discard the block editor
	 * script handles registered at `init` — which `wp_localize_script` needs to
	 * exist in order to attach anything to them.
	 */
	private function reset_frontend_runtime() {
		wp_dequeue_script( 'gll-info-wasm-exec' );
		wp_deregister_script( 'gll-info-wasm-exec' );
	}

	/**
	 * Read the inline data attached to a script handle.
	 *
	 * @param string $handle Script handle.
	 * @return string The localized data blob, or an empty string.
	 */
	private function script_data( $handle ) {
		$data = wp_scripts()->get_data( $handle, 'data' );

		return is_string( $data ) ? $data : '';
	}

	/**
	 * Decode the gllInfoSettings object attached to a handle.
	 *
	 * Decoded rather than string-matched because the encoding is not stable
	 * across core versions: WordPress 6.7 escapes forward slashes in the
	 * localized JSON and 7.0 does not, so any assertion against a literal URL
	 * substring passes on one and fails on the other.
	 *
	 * @param string $handle Script handle.
	 * @return array|null The decoded settings, or null when absent.
	 */
	private function localized_settings( $handle ) {
		$data = $this->script_data( $handle );

		if ( ! preg_match( '/var gllInfoSettings = (\{.*?\});/s', $data, $matches ) ) {
			return null;
		}

		return json_decode( $matches[1], true );
	}

	/**
	 * Every block's editor handle gets the settings, not just the first.
	 *
	 * The production code loops over the registry, and a loop that quietly
	 * covers six of seven handles is exactly the bug shape here — the seventh
	 * block would then fall back to a hardcoded plugin path and break on any
	 * install whose directory is not named gll-info.
	 */
	public function test_every_editor_handle_receives_the_settings() {
		do_action( 'enqueue_block_editor_assets' );

		foreach ( gll_info_get_block_names() as $block_name ) {
			$handle   = str_replace( '/', '-', $block_name ) . '-editor-script';
			$settings = $this->localized_settings( $handle );

			$this->assertIsArray(
				$settings,
				"{$handle} did not receive gllInfoSettings."
			);
			$this->assertStringEndsWith(
				'assets/wasm/gll.wasm',
				$settings['wasmUrl'],
				"{$handle} has the wrong WASM URL."
			);
			$this->assertStringEndsWith(
				'assets/wasm/wasm_exec.js',
				$settings['wasmExecUrl']
			);
		}
	}

	/**
	 * The REST base and nonce the editor uses.
	 *
	 * Compared against `rest_url()` after decoding, so the assertion holds under
	 * any permalink structure and on either core version's slash escaping.
	 */
	public function test_the_settings_carry_the_rest_url_and_a_nonce() {
		do_action( 'enqueue_block_editor_assets' );

		$settings = $this->localized_settings( 'gll-info-gll-info-editor-script' );

		$this->assertIsArray( $settings );
		$this->assertSame( rest_url( 'gll-info/v1/' ), $settings['restUrl'] );
		$this->assertNotEmpty( $settings['nonce'] );
	}

	/**
	 * A post containing a GLL block gets the runtime.
	 */
	public function test_the_frontend_runtime_is_enqueued_for_a_post_with_a_block() {
		$post_id = self::factory()->post->create(
			array( 'post_content' => '<!-- wp:gll-info/gll-info /-->' )
		);
		$this->go_to( get_permalink( $post_id ) );

		do_action( 'wp_enqueue_scripts' );

		$this->assertTrue( wp_script_is( 'gll-info-wasm-exec', 'enqueued' ) );
		$this->assertStringContainsString(
			'gllInfoSettings',
			$this->script_data( 'gll-info-wasm-exec' )
		);
	}

	/**
	 * A post without one does not.
	 */
	public function test_the_frontend_runtime_is_skipped_for_an_unrelated_post() {
		$post_id = self::factory()->post->create(
			array( 'post_content' => '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->' )
		);
		$this->reset_frontend_runtime();
		$this->go_to( get_permalink( $post_id ) );

		do_action( 'wp_enqueue_scripts' );

		$this->assertFalse( wp_script_is( 'gll-info-wasm-exec', 'enqueued' ) );
	}

	/**
	 * Characterization of a known defect, not an endorsement of it.
	 *
	 * `gll_info_enqueue_frontend_assets` gates on `has_block()`, which inspects
	 * only the main post's content. A GLL block inside a template part, a widget
	 * or a reusable block therefore gets no gllInfoSettings — yet the block's own
	 * viewScript is still enqueued by the block renderer, so view.js runs and
	 * wasm-loader falls back to a hardcoded
	 * /wp-content/plugins/gll-info/assets/wasm/... path. On a stock install that
	 * works anyway, which is why nobody has hit it. It breaks when the plugin
	 * directory is renamed, when WordPress lives in a subdirectory, on non-root
	 * multisite, or behind a WP_PLUGIN_URL override.
	 *
	 * This test passes today and describes what actually happens. It will fail
	 * the day the gate is replaced with a per-block viewScript dependency, which
	 * is the correct fix and is a change across seven block.json files plus a
	 * rebuild — deliberately out of scope for a testing phase. A red test left
	 * in a release branch would only teach people to ignore CI.
	 */
	public function test_reusable_block_content_does_not_trigger_the_frontend_gate() {
		$reusable_id = self::factory()->post->create(
			array(
				'post_type'    => 'wp_block',
				'post_content' => '<!-- wp:gll-info/polar-plot /-->',
			)
		);
		$post_id     = self::factory()->post->create(
			array(
				'post_content' => sprintf(
					'<!-- wp:block {"ref":%d} /-->',
					$reusable_id
				),
			)
		);
		$this->reset_frontend_runtime();
		$this->go_to( get_permalink( $post_id ) );

		do_action( 'wp_enqueue_scripts' );

		$this->assertFalse(
			wp_script_is( 'gll-info-wasm-exec', 'enqueued' ),
			'If this now passes the runtime, the has_block gate was fixed — '
				. 'update this test and close the tracking issue.'
		);
	}

	/**
	 * The loader is hooked, and early enough.
	 *
	 * `is_textdomain_loaded()` is not the check to make here: with no .mo file
	 * for the active locale there is nothing to load and it reports false even
	 * when the wiring is perfect. What matters is the hook and its priority —
	 * `init` at 0, ahead of the post type at 10 and the patterns at 20, both of
	 * which translate their labels at registration time.
	 */
	public function test_the_text_domain_loader_runs_first_on_init() {
		$this->assertSame(
			0,
			has_action( 'init', 'gll_info_load_textdomain' ),
			'The text domain must load at init priority 0.'
		);
		$this->assertSame( 10, has_action( 'init', 'gll_info_register_post_type' ) );
		$this->assertSame( 20, has_action( 'init', 'gll_info_register_block_patterns' ) );
	}

	/**
	 * The specific wrong hook, named.
	 *
	 * `plugins_loaded` is the conventional place to load a text domain and it is
	 * wrong on WordPress 6.7+, which fires `_doing_it_wrong()` for any domain
	 * loaded before `init`. This plugin's declared minimum is 6.7, so using it
	 * would put a notice on every admin screen. Asserting the anti-pattern is
	 * absent states the rule directly, where re-running `init` inside a test
	 * would only re-register the blocks and raise an unrelated notice.
	 */
	public function test_the_text_domain_does_not_load_on_plugins_loaded() {
		$this->assertFalse(
			has_action( 'plugins_loaded', 'gll_info_load_textdomain' ),
			'Loading the text domain on plugins_loaded is too early for WP 6.7+.'
		);
	}

	/**
	 * Pattern titles are translated at registration, which only works because
	 * the domain is already loaded by then. An empty title would mean the
	 * ordering broke.
	 */
	public function test_pattern_titles_survive_registration() {
		$patterns = WP_Block_Patterns_Registry::get_instance()->get_all_registered();

		foreach ( $patterns as $pattern ) {
			if ( 0 !== strpos( $pattern['name'], 'gll-info/' ) ) {
				continue;
			}
			$this->assertNotEmpty( $pattern['title'], "{$pattern['name']} has no title." );
		}
	}

	/**
	 * The translation helper skips handles that were never registered rather
	 * than warning.
	 */
	public function test_setting_script_translations_tolerates_missing_handles() {
		gll_info_set_block_script_translations( 'editor-script' );
		gll_info_set_block_script_translations( 'view-script' );
		gll_info_set_block_script_translations( 'no-such-field' );

		$this->assertTrue( true, 'No warning was raised for absent handles.' );
	}
}
