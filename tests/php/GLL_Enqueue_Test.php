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
	 * Drop the frontend runtime and every block view script from the queue.
	 *
	 * `$wp_scripts` survives between tests in the same class, so a "must not be
	 * enqueued" assertion would otherwise pass or fail on whatever an earlier
	 * test left behind.
	 *
	 * Dequeued, never deregistered. Both the runtime and the view scripts are
	 * registered once on `init`, and `init` cannot be replayed inside a test
	 * without re-registering every block type and raising a notice. Deregistering
	 * would leave the handles permanently missing for the rest of the class.
	 */
	private function reset_frontend_runtime() {
		wp_dequeue_script( 'gll-info-wasm-exec' );

		foreach ( gll_info_get_block_names() as $block_name ) {
			wp_dequeue_script( str_replace( '/', '-', $block_name ) . '-view-script' );
		}
	}

	/**
	 * Serialized markup for a GLL block that actually renders something.
	 *
	 * The block markup has to carry a `fileUrl` and its saved `<div>`. Every
	 * block's `save()` returns null without a file, and since WordPress 6.9
	 * `WP_Block::render()` snapshots the asset queues before rendering and
	 * *undoes* any enqueue the block made when its rendered content comes out
	 * empty (class-wp-block.php, "Dequeue the newly enqueued assets ... if the
	 * rendered block was empty"). A file-less `<!-- wp:gll-info/gll-info /-->`
	 * therefore loads no assets — correctly, since it also paints no UI — and a
	 * test written against that markup would assert the wrong thing and fail for
	 * a reason that has nothing to do with the enqueue wiring.
	 *
	 * @param string $block_name Fully qualified block name.
	 * @return string Serialized block markup.
	 */
	private function rendered_block_markup( $block_name ) {
		$url = 'https://example.org/wp-content/uploads/sample.gll';

		return sprintf(
			'<!-- wp:%1$s {"fileUrl":"%3$s"} -->'
				. '<div class="wp-block-%2$s gll-info-block" data-file-url="%3$s"></div>'
				. '<!-- /wp:%1$s -->',
			$block_name,
			str_replace( '/', '-', $block_name ),
			$url
		);
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
	 * Every block's view handle gets the settings, not just the first.
	 *
	 * The mirror image of the editor test above, and for the same reason: each
	 * block loads the WASM parser independently, so any one of them can be the
	 * only GLL block on a page. Deriving the handles from the registry is what
	 * makes this impossible to drift — a block added later cannot be forgotten.
	 *
	 * Note there is no `go_to()` here, deliberately. Attaching the settings must
	 * not depend on what the queried post contains, because that is precisely
	 * the assumption that broke template parts, widgets and reusable blocks.
	 */
	public function test_every_view_handle_receives_the_settings() {
		do_action( 'wp_enqueue_scripts' );

		foreach ( gll_info_get_block_names() as $block_name ) {
			$handle   = str_replace( '/', '-', $block_name ) . '-view-script';
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
	 * Script translations reach the view handles, from the bundled catalogue.
	 *
	 * Localized settings and translations were gated behind the same condition,
	 * so both were missing in the same situations — but only the settings had a
	 * hardcoded fallback in wasm-loader. Untranslated frontend strings were the
	 * half of that defect with no safety net at all.
	 *
	 * The assertion is on the *path*, not the domain. Core sets the domain by
	 * itself from `block.json`'s `textdomain` field
	 * (`register_block_script_handle`, blocks.php:279) but passes no path, so it
	 * resolves against `WP_LANG_DIR/plugins/` — the language-pack location, which
	 * is empty on an install that has never fetched one. Pointing at the plugin's
	 * own `/languages` is the entire contribution of
	 * `gll_info_set_block_script_translations()`, so asserting the domain would
	 * be asserting core's behaviour and would stay green with our code deleted.
	 */
	public function test_every_view_handle_uses_the_bundled_translation_catalogue() {
		do_action( 'wp_enqueue_scripts' );

		foreach ( gll_info_get_block_names() as $block_name ) {
			$handle = str_replace( '/', '-', $block_name ) . '-view-script';

			$this->assertSame(
				'gll-info',
				wp_scripts()->registered[ $handle ]->textdomain ?? null,
				"{$handle} has no text domain set for its JSON catalogue."
			);
			$this->assertSame(
				GLL_INFO_LANGUAGES_DIR,
				wp_scripts()->registered[ $handle ]->translations_path ?? null,
				"{$handle} does not resolve translations from the bundled catalogue."
			);
		}
	}

	/**
	 * Rendering a GLL block pulls in the runtime, wherever it is rendered.
	 *
	 * The assertion is made against `do_blocks()` rather than against a queried
	 * post, because rendering is the one thing every delivery path has in
	 * common. A block in a template part, a widget, a reusable block or a
	 * full-site-editing template all reach the renderer; only the main post
	 * content reaches `has_block()`. Testing at the render boundary therefore
	 * covers all of them at once, and covers whichever delivery mechanism core
	 * invents next.
	 */
	public function test_rendering_a_block_enqueues_the_frontend_runtime() {
		$this->reset_frontend_runtime();
		do_action( 'wp_enqueue_scripts' );

		do_blocks( $this->rendered_block_markup( 'gll-info/gll-info' ) );

		$this->assertTrue(
			wp_script_is( 'gll-info-wasm-exec', 'enqueued' ),
			'Rendering a GLL block did not enqueue the Go runtime.'
		);
		$this->assertTrue(
			wp_script_is( 'gll-info-gll-info-view-script', 'enqueued' ),
			'Rendering a GLL block did not enqueue its own view script.'
		);
	}

	/**
	 * A block inside a reusable block gets the settings.
	 *
	 * This was the defect. `has_block()` inspects only the main post content, so
	 * a GLL block reached through a `wp:block` reference got no gllInfoSettings
	 * — while its own viewScript was still enqueued by the renderer. view.js
	 * then ran against wasm-loader's hardcoded
	 * `/wp-content/plugins/gll-info/assets/wasm/...` fallback, which works on a
	 * stock install and breaks on a renamed plugin directory, a subdirectory
	 * install, non-root multisite, or a WP_PLUGIN_URL override. Translations had
	 * no fallback and were simply absent.
	 */
	public function test_a_block_inside_a_reusable_block_receives_the_settings() {
		$reusable_id = self::factory()->post->create(
			array(
				'post_type'    => 'wp_block',
				'post_content' => $this->rendered_block_markup( 'gll-info/polar-plot' ),
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
		do_blocks( get_post_field( 'post_content', $post_id ) );

		$settings = $this->localized_settings( 'gll-info-polar-plot-view-script' );

		$this->assertIsArray(
			$settings,
			'A GLL block reached through a reusable block got no settings.'
		);
		$this->assertStringEndsWith( 'assets/wasm/gll.wasm', $settings['wasmUrl'] );
		$this->assertTrue(
			wp_script_is( 'gll-info-wasm-exec', 'enqueued' ),
			'The runtime was not enqueued for a reusable block.'
		);
	}

	/**
	 * A page with no GLL block still loads nothing.
	 *
	 * This is the property the `has_block()` gate was bought to provide, and it
	 * has to survive the gate's removal — otherwise the fix trades a broken edge
	 * case for 4.2 MB of WASM plumbing on every page of the site. It holds for a
	 * different reason now: nothing is enqueued eagerly at all, so only an
	 * actual block render can pull the runtime in.
	 */
	public function test_a_page_without_a_gll_block_enqueues_nothing() {
		$this->reset_frontend_runtime();

		do_action( 'wp_enqueue_scripts' );
		do_blocks( '<!-- wp:paragraph --><p>Hi</p><!-- /wp:paragraph -->' );

		$this->assertFalse(
			wp_script_is( 'gll-info-wasm-exec', 'enqueued' ),
			'The Go runtime loaded on a page with no GLL block.'
		);

		foreach ( gll_info_get_block_names() as $block_name ) {
			$handle = str_replace( '/', '-', $block_name ) . '-view-script';

			$this->assertFalse(
				wp_script_is( $handle, 'enqueued' ),
				"{$handle} was enqueued on a page with no GLL block."
			);
		}
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
