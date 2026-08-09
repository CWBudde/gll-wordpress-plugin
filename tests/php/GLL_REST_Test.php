<?php
/**
 * Tests for the cached-subset REST routes.
 *
 * Two things are being pinned. The first is that the read route is genuinely
 * public — an anonymous visitor loading a published page is the only case the
 * cache exists to serve, so a permission callback that crept in would silently
 * turn the whole feature off. The second is that the write routes are not: they
 * take a caller-supplied payload straight into post meta.
 *
 * @package
 */

/**
 * Tests for GLL_REST.
 */
class GLL_REST_Test extends WP_UnitTestCase {

	/**
	 * Files written into the uploads directory.
	 *
	 * @var string[]
	 */
	private $written = array();

	/**
	 * Spin up the REST server, which is not running by default in the suite.
	 */
	public function set_up() {
		parent::set_up();

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init' );
	}

	/**
	 * Clean up files and the REST server.
	 */
	public function tear_down() {
		foreach ( $this->written as $path ) {
			if ( file_exists( $path ) ) {
				unlink( $path );
			}
		}
		$this->written = array();

		global $wp_rest_server;
		$wp_rest_server = null;

		parent::tear_down();
	}

	/**
	 * Create a GLL attachment backed by a real file.
	 *
	 * @param string $mime MIME type.
	 * @return int Attachment ID.
	 */
	private function create_attachment( $mime = 'application/x-gll' ) {
		$uploads = wp_upload_dir();
		wp_mkdir_p( $uploads['path'] );

		$path = trailingslashit( $uploads['path'] ) . uniqid( 'gll-rest-' ) . '.gll';
		file_put_contents( $path, "GLL BYTES\n" );
		$this->written[] = $path;

		return $this->factory->attachment->create_object(
			array(
				'file'           => $path,
				'post_mime_type' => $mime,
			)
		);
	}

	/**
	 * A minimal but valid subset.
	 *
	 * @return array Subset.
	 */
	private function subset() {
		return array(
			'Version'   => GLL_Subset::VERSION,
			'GenSystem' => array( 'Label' => 'Example' ),
			'Database'  => array( 'SourceDefinitions' => array() ),
		);
	}

	/**
	 * Dispatch a request against the plugin's namespace.
	 *
	 * @param string $method HTTP method.
	 * @param int    $id     Attachment ID.
	 * @param array  $body   JSON body, if any.
	 * @return WP_REST_Response Response.
	 */
	private function dispatch( $method, $id, $body = null ) {
		$request = new WP_REST_Request( $method, '/' . GLL_REST::NAMESPACE . '/cache/' . $id );

		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}

		return rest_get_server()->dispatch( $request );
	}

	/**
	 * The namespace that has been advertised to the editor since Phase 1 now
	 * has something behind it.
	 */
	public function test_the_routes_are_registered() {
		$routes = rest_get_server()->get_routes();

		$this->assertArrayHasKey( '/' . GLL_REST::NAMESPACE . '/cache/(?P<id>\d+)', $routes );
	}

	/**
	 * The read route serves an anonymous visitor.
	 */
	public function test_anyone_may_read_a_cached_subset() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset(), 'node' );

		wp_set_current_user( 0 );
		$response = $this->dispatch( 'GET', $id );

		$this->assertSame( 200, $response->get_status() );
		$this->assertEquals( $this->subset(), $response->get_data() );
	}

	/**
	 * A cold cache is a 404, which is the signal the frontend falls back on.
	 */
	public function test_a_cold_cache_is_a_404() {
		$response = $this->dispatch( 'GET', $this->create_attachment() );

		$this->assertSame( 404, $response->get_status() );
	}

	/**
	 * A stale cache reports as cold, so all three staleness cases take one path.
	 */
	public function test_a_replaced_file_reads_as_cold() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset(), 'node' );

		file_put_contents( get_attached_file( $id ), "DIFFERENT BYTES\n" );

		$this->assertSame( 404, $this->dispatch( 'GET', $id )->get_status() );
	}

	/**
	 * An attachment that is not a GLL file.
	 */
	public function test_reading_a_non_gll_attachment_is_a_404() {
		$id = $this->create_attachment( 'text/plain' );

		$this->assertSame( 404, $this->dispatch( 'GET', $id )->get_status() );
	}

	/**
	 * An author may store what their browser parsed.
	 */
	public function test_an_author_may_store_a_subset() {
		$id = $this->create_attachment();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$response = $this->dispatch( 'POST', $id, array( 'data' => $this->subset() ) );

		$this->assertSame( 200, $response->get_status() );
		$this->assertEquals( $this->subset(), GLL_Cache::get( $id ) );
		$this->assertSame( 'browser', GLL_Cache::get_envelope( $id )['producer'] );
	}

	/**
	 * A logged-out caller may not write.
	 */
	public function test_an_anonymous_caller_may_not_store_a_subset() {
		$id = $this->create_attachment();
		wp_set_current_user( 0 );

		$response = $this->dispatch( 'POST', $id, array( 'data' => $this->subset() ) );

		$this->assertSame( 401, $response->get_status() );
		$this->assertFalse( GLL_Cache::get_envelope( $id ) );
	}

	/**
	 * Nor may a subscriber, who cannot edit the attachment.
	 */
	public function test_a_subscriber_may_not_store_a_subset() {
		$id = $this->create_attachment();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'subscriber' ) ) );

		$response = $this->dispatch( 'POST', $id, array( 'data' => $this->subset() ) );

		$this->assertSame( 403, $response->get_status() );
		$this->assertFalse( GLL_Cache::get_envelope( $id ) );
	}

	/**
	 * A payload that would not survive validation is refused, not stored.
	 */
	public function test_an_invalid_payload_is_refused() {
		$id = $this->create_attachment();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		foreach ( array(
			array( 'data' => array( 'Version' => 999, 'Database' => array() ) ),
			array( 'data' => 'a string' ),
			array( 'data' => array( 'Version' => GLL_Subset::VERSION ) ),
			array(),
		) as $body ) {
			$response = $this->dispatch( 'POST', $id, $body );

			$this->assertSame( 400, $response->get_status() );
		}

		$this->assertFalse( GLL_Cache::get_envelope( $id ) );
	}

	/**
	 * An oversized payload cannot be used to fill `wp_postmeta`.
	 */
	public function test_an_oversized_payload_is_refused() {
		$id = $this->create_attachment();
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$subset                     = $this->subset();
		$subset['Database']['Blob'] = str_repeat( 'x', GLL_Cache::MAX_BYTES );

		$response = $this->dispatch( 'POST', $id, array( 'data' => $subset ) );

		$this->assertSame( 400, $response->get_status() );
	}

	/**
	 * Writing to something that is not a GLL file.
	 */
	public function test_storing_against_a_non_gll_attachment_is_refused() {
		$id = $this->create_attachment( 'text/plain' );
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$response = $this->dispatch( 'POST', $id, array( 'data' => $this->subset() ) );

		$this->assertSame( 400, $response->get_status() );
	}

	/**
	 * The delete route backs the editor's refresh control.
	 */
	public function test_an_author_may_discard_a_subset() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset(), 'node' );
		wp_set_current_user( $this->factory->user->create( array( 'role' => 'administrator' ) ) );

		$response = $this->dispatch( 'DELETE', $id );

		$this->assertSame( 200, $response->get_status() );
		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * Deleting is a write, and is gated like one.
	 */
	public function test_an_anonymous_caller_may_not_discard_a_subset() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset(), 'node' );
		wp_set_current_user( 0 );

		$response = $this->dispatch( 'DELETE', $id );

		$this->assertSame( 401, $response->get_status() );
		$this->assertNotFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * The URL the blocks are given points at the routes that exist.
	 *
	 * `restUrl` was localized and asserted long before any route served it; this
	 * closes the loop by dispatching against the advertised namespace.
	 */
	public function test_the_advertised_rest_url_matches_the_namespace() {
		$this->assertSame(
			rest_url( GLL_REST::NAMESPACE . '/' ),
			rest_url( 'gll-info/v1/' )
		);
	}
}
