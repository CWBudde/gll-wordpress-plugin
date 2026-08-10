<?php
/**
 * Tests for backend detection and the server-side caching pipeline.
 *
 * The wp-env PHP container has no Node, which is representative rather than
 * inconvenient: most shared hosting has none either, and "no backend" is a
 * supported configuration that must degrade silently. So the detection tests
 * assert exactly that, and the pipeline tests register a backend of their own
 * through `gll_info_parser_backends` — the same seam a WASI runtime integration
 * would use — so that GLL_Parser, GLL_Subset and GLL_Cache are exercised
 * together for real.
 *
 * The Node runner script itself is covered by
 * `tests/parser-runner.integration.test.ts`, which runs under Jest on the host,
 * where Node exists by definition.
 *
 * @package
 */

/**
 * A backend that returns a fixture instead of spawning anything.
 */
class GLL_Fake_Parser_Backend extends GLL_Parser_Backend {

	/**
	 * What `parse()` returns: raw output, or a WP_Error.
	 *
	 * @var mixed
	 */
	public $result;

	/**
	 * Whether this backend reports itself usable.
	 *
	 * @var bool
	 */
	public $available = true;

	/**
	 * How many times `parse()` was called.
	 *
	 * @var int
	 */
	public $calls = 0;

	/**
	 * Construct with a canned result.
	 *
	 * @param mixed $result Raw parser output, or a WP_Error.
	 */
	public function __construct( $result = array() ) {
		$this->result = $result;
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return string Backend ID.
	 */
	public function id() {
		return 'node';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return string Label.
	 */
	public function label() {
		return 'Fake';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return bool Availability.
	 */
	public function is_available() {
		return $this->available;
	}

	/**
	 * {@inheritDoc}
	 *
	 * @param string $path File path.
	 * @return array|WP_Error Canned result.
	 */
	public function parse( $path ) {
		unset( $path );
		++$this->calls;

		return $this->result;
	}
}

/**
 * Tests for GLL_Parser.
 */
class GLL_Parser_Test extends WP_UnitTestCase {

	/**
	 * Files written into the uploads directory.
	 *
	 * @var string[]
	 */
	private $written = array();

	/**
	 * Reset the memoized backend list before every test.
	 */
	public function set_up() {
		parent::set_up();
		GLL_Parser::reset();
	}

	/**
	 * Reset again, and clean up files.
	 */
	public function tear_down() {
		GLL_Parser::reset();
		delete_option( GLL_Parser::ENABLED_OPTION );

		foreach ( $this->written as $path ) {
			if ( file_exists( $path ) ) {
				unlink( $path );
			}
		}
		$this->written = array();

		parent::tear_down();
	}

	/**
	 * Create a GLL attachment backed by a real file.
	 *
	 * @param int $bytes How many bytes to write.
	 * @return int Attachment ID.
	 */
	private function create_attachment( $bytes = 16 ) {
		$uploads = wp_upload_dir();
		wp_mkdir_p( $uploads['path'] );

		$path = trailingslashit( $uploads['path'] ) . uniqid( 'gll-parser-' ) . '.gll';
		file_put_contents( $path, str_repeat( 'g', $bytes ) );
		$this->written[] = $path;

		return $this->factory->attachment->create_object(
			array(
				'file'           => $path,
				'post_mime_type' => 'application/x-gll',
			)
		);
	}

	/**
	 * Register a backend for the duration of one test.
	 *
	 * @param GLL_Parser_Backend $backend Backend to use.
	 */
	private function use_backend( $backend ) {
		GLL_Parser::reset();
		add_filter(
			'gll_info_parser_backends',
			static function () use ( $backend ) {
				return array( $backend );
			}
		);
	}

	/**
	 * The raw fixture, which the reducer knows how to handle.
	 *
	 * @return array Raw parser output.
	 */
	private function raw_fixture() {
		return json_decode(
			file_get_contents( dirname( __DIR__ ) . '/fixtures/synthetic-raw.json' ),
			true
		);
	}

	/**
	 * Every shipped backend satisfies the contract the registry calls.
	 */
	public function test_the_shipped_backends_are_well_formed() {
		foreach ( GLL_Parser::backends() as $backend ) {
			$this->assertInstanceOf( GLL_Parser_Backend::class, $backend );
			$this->assertNotEmpty( $backend->id() );
			$this->assertNotEmpty( $backend->label() );
			$this->assertIsBool( $backend->is_available() );
			$this->assertGreaterThan( 0, $backend->max_bytes() );
		}
	}

	/**
	 * Detection never fatals, and remembers its answer.
	 *
	 * On this container it finds nothing, which is the case that has to be
	 * harmless.
	 */
	public function test_detection_stores_its_result() {
		$id = GLL_Parser::detect( true );

		$this->assertIsString( $id );

		$stored = get_option( GLL_Parser::DETECTED_OPTION );
		$this->assertSame( $id, $stored['id'] );
		$this->assertSame( GLL_INFO_VERSION, $stored['plugin_version'] );
	}

	/**
	 * A stored result from a different plugin version is re-probed.
	 */
	public function test_an_upgrade_re_probes() {
		update_option(
			GLL_Parser::DETECTED_OPTION,
			array(
				'id'             => 'cli',
				'plugin_version' => '0.0.1-old',
				'checked'        => time(),
			),
			false
		);

		GLL_Parser::detect();

		$this->assertSame(
			GLL_INFO_VERSION,
			get_option( GLL_Parser::DETECTED_OPTION )['plugin_version']
		);
	}

	/**
	 * The administrator's switch wins over whatever was detected.
	 */
	public function test_disabling_server_parsing_yields_no_backend() {
		$this->use_backend( new GLL_Fake_Parser_Backend( $this->raw_fixture() ) );

		$this->assertNotNull( GLL_Parser::backend() );

		update_option( GLL_Parser::ENABLED_OPTION, '0' );

		$this->assertFalse( GLL_Parser::is_enabled() );
		$this->assertNull( GLL_Parser::backend() );
	}

	/**
	 * The pinning filter skips detection entirely, in both directions.
	 */
	public function test_the_backend_filter_pins_and_disables() {
		$this->use_backend( new GLL_Fake_Parser_Backend( $this->raw_fixture() ) );

		add_filter( 'gll_info_parser_backend', '__return_empty_string' );
		$this->assertNull( GLL_Parser::backend() );

		remove_filter( 'gll_info_parser_backend', '__return_empty_string' );
		$this->assertSame( 'node', GLL_Parser::backend()->id() );
	}

	/**
	 * Entries that are not backends are dropped rather than trusted.
	 */
	public function test_the_backends_filter_rejects_impostors() {
		GLL_Parser::reset();
		add_filter(
			'gll_info_parser_backends',
			static function () {
				return array( 'node', new stdClass(), null );
			}
		);

		$this->assertSame( array(), GLL_Parser::backends() );
		$this->assertNull( GLL_Parser::backend() );
	}

	/**
	 * An unavailable backend is skipped, leaving no backend at all.
	 */
	public function test_an_unavailable_backend_is_not_selected() {
		$backend            = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$backend->available = false;
		$this->use_backend( $backend );

		$this->assertNull( GLL_Parser::backend() );
	}

	/**
	 * The whole pipeline: parse, reduce, store, serve.
	 */
	public function test_warming_parses_reduces_and_caches() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		// Creating the attachment fires `add_attachment`, which warms it once
		// already; start from cold so this measures the explicit warm.
		$id = $this->create_attachment();
		GLL_Cache::delete( $id );
		$before = $backend->calls;

		$this->assertTrue( GLL_Parser::warm( $id ) );
		$this->assertSame( $before + 1, $backend->calls );

		$cached = GLL_Cache::get( $id );

		$this->assertEquals(
			GLL_Subset::from_raw( $this->raw_fixture() ),
			$cached
		);
		$this->assertSame( 'node', GLL_Cache::get_envelope( $id )['producer'] );
	}

	/**
	 * With no backend, warming is a silent no-op rather than an error.
	 */
	public function test_warming_without_a_backend_leaves_the_cache_cold() {
		GLL_Parser::reset();
		add_filter( 'gll_info_parser_backends', '__return_empty_array' );

		$id = $this->create_attachment();

		$this->assertFalse( GLL_Parser::warm( $id ) );
		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * A failing parse leaves the cache cold instead of storing rubbish.
	 */
	public function test_a_failed_parse_leaves_the_cache_cold() {
		$this->use_backend(
			new GLL_Fake_Parser_Backend(
				new WP_Error( 'boom', 'the parser fell over' )
			)
		);

		$id = $this->create_attachment();

		$this->assertFalse( GLL_Parser::warm( $id ) );
		$this->assertFalse( GLL_Cache::get_envelope( $id ) );
	}

	/**
	 * Files past the ceiling are not attempted at all.
	 *
	 * The ceiling exists because backends that hand PHP the parser's full output
	 * would need more memory than a normal process is given: a 15.4 MB GLL
	 * expands to 228.7 MB of JSON.
	 */
	public function test_a_file_over_the_ceiling_is_not_parsed() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		add_filter( 'gll_info_parser_max_bytes', static fn() => 8 );

		$result = GLL_Parser::subset_for_attachment( $this->create_attachment( 64 ) );

		$this->assertWPError( $result );
		$this->assertSame( 'gll_info_too_large', $result->get_error_code() );
		$this->assertSame( 0, $backend->calls, 'The backend must not even be invoked.' );
	}

	/**
	 * Parsing a path that is not an attachment.
	 *
	 * Split out of `subset_for_attachment()` so the download proxy can build a
	 * summary from a temp file it has already paid for, instead of the file
	 * having to be in the media library first. The path never comes from request
	 * input on either caller.
	 */
	public function test_a_bare_path_can_be_parsed() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		$path = wp_tempnam( 'gll-path-test' );
		file_put_contents( $path, 'GLL BYTES' );

		$subset = GLL_Parser::subset_for_path( $path );

		unlink( $path );

		$this->assertIsArray( $subset );
		$this->assertSame( GLL_Subset::VERSION, $subset['Version'] );
		$this->assertSame( 1, $backend->calls );
	}

	/**
	 * The extraction left the attachment path intact.
	 */
	public function test_an_attachment_still_resolves_to_its_file() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		// Creating the attachment already parses it once, through the upload
		// hook, so the count is not the interesting part here — the path
		// resolution is.
		$this->assertIsArray( GLL_Parser::subset_for_attachment( $this->create_attachment() ) );
	}

	/**
	 * A path that does not exist is reported the same way a missing attachment
	 * file is.
	 */
	public function test_a_missing_path_is_reported() {
		$this->use_backend( new GLL_Fake_Parser_Backend( $this->raw_fixture() ) );

		$result = GLL_Parser::subset_for_path( '/nonexistent/nothing.gll' );

		$this->assertWPError( $result );
		$this->assertSame( 'gll_info_unreadable', $result->get_error_code() );
	}

	/**
	 * An attachment whose file is missing.
	 */
	public function test_an_unreadable_file_is_reported() {
		$this->use_backend( new GLL_Fake_Parser_Backend( $this->raw_fixture() ) );

		$id = $this->create_attachment();
		unlink( get_attached_file( $id ) );

		$result = GLL_Parser::subset_for_attachment( $id );

		$this->assertWPError( $result );
		$this->assertSame( 'gll_info_unreadable', $result->get_error_code() );
	}

	/**
	 * Non-GLL attachments are never warmed.
	 */
	public function test_only_gll_attachments_are_warmed() {
		$this->use_backend( new GLL_Fake_Parser_Backend( $this->raw_fixture() ) );

		$id = $this->factory->attachment->create_object(
			array(
				'file'           => 'notes.txt',
				'post_mime_type' => 'text/plain',
			)
		);

		$this->assertFalse( GLL_Parser::warm( $id ) );
	}

	/**
	 * Uploading a GLL warms its cache, which is the point of the whole backend.
	 */
	public function test_uploading_a_gll_warms_its_cache() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		// Nothing is called explicitly here: creating the attachment fires
		// `add_attachment`, and that alone must leave the cache warm. This is
		// the behaviour the whole server-side backend exists to provide — a file
		// nobody has opened in the editor is still served from cache.
		$id = $this->create_attachment();

		$this->assertSame( 1, $backend->calls, 'The upload must parse exactly once.' );
		$this->assertNotFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * Uploading anything else parses nothing.
	 */
	public function test_uploading_a_non_gll_parses_nothing() {
		$backend = new GLL_Fake_Parser_Backend( $this->raw_fixture() );
		$this->use_backend( $backend );

		$this->factory->attachment->create_object(
			array(
				'file'           => 'notes.txt',
				'post_mime_type' => 'text/plain',
			)
		);

		$this->assertSame( 0, $backend->calls );
	}

	/**
	 * The CLI backend stays out of the way unless it is configured.
	 *
	 * It is never discovered from PATH: running whatever `gllinfo` happens to be
	 * installed would be a surprising thing for a plugin to do with a
	 * subprocess.
	 */
	public function test_the_cli_backend_is_opt_in() {
		$this->assertSame( '', GLL_Parser_CLI::binary() );
		$this->assertFalse( ( new GLL_Parser_CLI() )->is_available() );

		// A relative name is refused; an administrator names an absolute path.
		add_filter( 'gll_info_parser_bin', static fn() => 'gllinfo' );
		$this->assertSame( '', GLL_Parser_CLI::binary() );
		remove_all_filters( 'gll_info_parser_bin' );

		// A path that does not exist is refused too.
		add_filter( 'gll_info_parser_bin', static fn() => '/nonexistent/gllinfo' );
		$this->assertSame( '', GLL_Parser_CLI::binary() );
	}

	/**
	 * The in-process backend is inert, and says why.
	 *
	 * The bundled parser is a `js/wasm` build whose imports only a JavaScript
	 * engine can satisfy, so no PHP WebAssembly runtime can instantiate it. The
	 * class ships anyway so the settings screen can explain that rather than
	 * silently omitting the option.
	 */
	public function test_the_in_process_backend_reports_why_it_is_unavailable() {
		$backend = new GLL_Parser_PHP_Wasm();

		$this->assertFalse( $backend->is_available() );
		$this->assertNotEmpty( $backend->unavailable_reason() );
		$this->assertSame( '', GLL_Parser_PHP_Wasm::module_path() );

		$result = $backend->parse( __FILE__ );
		$this->assertWPError( $result );
	}

	/**
	 * The Node backend knows where its runner is, and it ships.
	 */
	public function test_the_node_runner_script_is_present() {
		$this->assertFileExists( GLL_Parser_Node::runner_path() );
		$this->assertSame( 'node', GLL_Parser_Node::binary() );
	}

	/**
	 * The Node backend's ceiling is high because its runner prunes.
	 */
	public function test_the_node_backend_allows_larger_files_than_the_others() {
		$this->assertGreaterThan(
			( new GLL_Parser_CLI() )->max_bytes(),
			( new GLL_Parser_Node() )->max_bytes()
		);
	}
}
