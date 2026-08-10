<?php
/**
 * Tests for the REST routes serving summaries of files on other servers.
 *
 * Two properties carry the design. The read route is public and NEVER fetches —
 * it takes an address, derives a storage key from it, and reads what is under
 * that key — which is what lets an anonymous visitor on a published page be
 * served without turning the route into an outbound-request machine. And the
 * write route is open to anyone who may upload files, which makes cross-author
 * overwriting a real surface: any address in a published page is visible to
 * every other author on the site. First-writer-wins is what bounds it, and it
 * has its own test below.
 *
 * @package
 */

/**
 * Tests for the URL cache routes on GLL_REST.
 */
class GLL_REST_URL_Test extends WP_UnitTestCase {

	/**
	 * A representative address.
	 *
	 * An IP literal, because the suite has no DNS and
	 * `GLL_Remote::validate_url()` — which the write route reuses — resolves host
	 * names and refuses one it cannot look up.
	 *
	 * @var string
	 */
	const URL = 'https://93.184.216.34/speaker.gll';

	/**
	 * Boot the REST server, which the suite does not run by default.
	 */
	public function set_up() {
		parent::set_up();

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init' );

		GLL_URL_Cache::purge_all();
		GLL_URL_Cache::flush_memo();

		// Nothing here should ever make an HTTP request; if something does, the
		// test that caused it fails rather than reaching the network.
		add_filter( 'pre_http_request', array( $this, 'forbid_http' ), 10, 3 );
	}

	/**
	 * Clean up.
	 */
	public function tear_down() {
		remove_all_filters( 'pre_http_request' );
		GLL_URL_Cache::purge_all();
		GLL_URL_Cache::flush_memo();

		global $wp_rest_server;
		$wp_rest_server = null;

		parent::tear_down();
	}

	/**
	 * Fail loudly if anything tries to fetch.
	 *
	 * @return WP_Error Always.
	 */
	public function forbid_http() {
		$this->fail( 'The URL cache routes must never make an HTTP request.' );

		return new WP_Error( 'no' );
	}

	/**
	 * A minimal but valid subset.
	 *
	 * @param string $label System label.
	 * @return array Subset.
	 */
	private function subset( $label = 'Example' ) {
		return array(
			'Version'   => GLL_Subset::VERSION,
			'GenSystem' => array( 'Label' => $label ),
			'Database'  => array( 'SourceDefinitions' => array() ),
		);
	}

	/**
	 * Dispatch against the URL cache route.
	 *
	 * @param string     $method HTTP method.
	 * @param string     $url    Address, for GET and DELETE.
	 * @param array|null $body   JSON body, for POST.
	 * @return WP_REST_Response Response.
	 */
	private function dispatch( $method, $url = self::URL, $body = null ) {
		$request = new WP_REST_Request( $method, '/' . GLL_REST::NAMESPACE . '/url-cache' );

		if ( null !== $url ) {
			$request->set_param( 'url', $url );
		}

		if ( null !== $body ) {
			$request->set_header( 'Content-Type', 'application/json' );
			$request->set_body( wp_json_encode( $body ) );
		}

		return rest_get_server()->dispatch( $request );
	}

	/**
	 * Become a user of the given role.
	 *
	 * @param string $role Role name.
	 * @return int User ID.
	 */
	private function become( $role ) {
		$user = self::factory()->user->create( array( 'role' => $role ) );
		wp_set_current_user( $user );

		return $user;
	}

	/**
	 * The route exists.
	 */
	public function test_the_route_is_registered() {
		$routes = rest_get_server()->get_routes();

		$this->assertArrayHasKey( '/' . GLL_REST::NAMESPACE . '/url-cache', $routes );
	}

	/**
	 * The read route serves an anonymous visitor, which is the only case the
	 * cache exists for.
	 */
	public function test_anyone_may_read_a_stored_summary() {
		GLL_URL_Cache::set( self::URL, $this->subset( 'Public' ) );
		GLL_URL_Cache::flush_memo();
		wp_set_current_user( 0 );

		$response = $this->dispatch( 'GET' );

		$this->assertSame( 200, $response->get_status() );
		$this->assertSame( 'Public', $response->get_data()['GenSystem']['Label'] );
	}

	/**
	 * A cold entry is a 404, which is what the frontend's fallback is keyed on.
	 */
	public function test_a_cold_entry_is_a_404() {
		wp_set_current_user( 0 );

		$this->assertSame( 404, $this->dispatch( 'GET' )->get_status() );
	}

	/**
	 * The read route answers, and fetches nothing, for an address this site
	 * would refuse to download.
	 *
	 * `forbid_http()` is what makes this meaningful: it fails the test if a
	 * request is attempted at all.
	 */
	public function test_reading_never_fetches() {
		wp_set_current_user( 0 );

		$this->assertSame( 404, $this->dispatch( 'GET', 'http://127.0.0.1/a.gll' )->get_status() );
	}

	/**
	 * The ordinary write.
	 */
	public function test_an_author_may_store_a_summary() {
		$this->become( 'author' );

		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'Written' ),
				'hash' => str_repeat( 'a', 64 ),
			)
		);

		$this->assertSame( 200, $response->get_status() );
		$this->assertTrue( $response->get_data()['stored'] );

		GLL_URL_Cache::flush_memo();
		$this->assertSame( 'Written', GLL_URL_Cache::get( self::URL )['GenSystem']['Label'] );
	}

	/**
	 * An anonymous caller may not write.
	 */
	public function test_an_anonymous_caller_may_not_store() {
		wp_set_current_user( 0 );

		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset(),
			)
		);

		$this->assertSame( 401, $response->get_status() );
	}

	/**
	 * Neither may a subscriber.
	 */
	public function test_a_subscriber_may_not_store() {
		$this->become( 'subscriber' );

		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset(),
			)
		);

		$this->assertSame( 403, $response->get_status() );
	}

	/**
	 * Addresses this site would not fetch do not enter the store either.
	 *
	 * Nothing is downloaded on this path, so the check is not about SSRF — it is
	 * about not letting the store fill with addresses the site has already
	 * decided it will not deal with.
	 *
	 * @dataProvider refused_address_provider
	 * @param string $url Address.
	 */
	public function test_a_refused_address_may_not_be_stored( $url ) {
		$this->become( 'author' );

		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => $url,
				'data' => $this->subset(),
			)
		);

		$this->assertSame( 400, $response->get_status() );
		$this->assertSame( 'gll_info_invalid_url', $response->as_error()->get_error_code() );
	}

	/**
	 * Addresses the write route refuses.
	 *
	 * @return array[] Test cases.
	 */
	public function refused_address_provider() {
		return array(
			array( 'http://127.0.0.1/a.gll' ),
			array( 'http://169.254.169.254/latest/' ),
			array( 'file:///etc/passwd' ),
			array( '' ),
		);
	}

	/**
	 * A host an administrator has excluded stays out of the store.
	 */
	public function test_a_host_outside_the_allowlist_may_not_be_stored() {
		update_option( GLL_Remote::HOSTS_OPTION, 'allowed.example' );
		$this->become( 'author' );

		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset(),
			)
		);

		delete_option( GLL_Remote::HOSTS_OPTION );

		$this->assertSame( 400, $response->get_status() );
	}

	/**
	 * The structural guard rejects a payload that is not a subset.
	 */
	public function test_an_invalid_payload_is_refused() {
		$this->become( 'author' );

		foreach ( array( null, 'text', array( 'Version' => 999 ), array( 'Version' => GLL_Subset::VERSION ) ) as $payload ) {
			$response = $this->dispatch(
				'POST',
				null,
				array(
					'url'  => self::URL,
					'data' => $payload,
				)
			);

			$this->assertSame( 400, $response->get_status() );
		}
	}

	/**
	 * ONE AUTHOR MAY NOT REWRITE ANOTHER AUTHOR'S ENTRY.
	 *
	 * Every address in a published page is readable by every other author on the
	 * site, so without this an Author could replace the manufacturer and labels
	 * anonymous visitors see on a colleague's post — something WordPress
	 * otherwise prevents. It is a bound rather than a fix: whoever writes first
	 * holds the entry for its lifetime.
	 */
	public function test_a_second_author_may_not_overwrite_the_first() {
		$this->become( 'author' );
		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'First' ),
			)
		);

		$this->become( 'author' );
		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'Second' ),
			)
		);

		$this->assertSame( 409, $response->get_status() );
		$this->assertSame( 'gll_info_url_cache_owned', $response->as_error()->get_error_code() );

		GLL_URL_Cache::flush_memo();
		$this->assertSame( 'First', GLL_URL_Cache::get( self::URL )['GenSystem']['Label'] );
	}

	/**
	 * The author who wrote it may write it again — that is what "refresh the
	 * stored summary" does for an external file.
	 */
	public function test_an_author_may_overwrite_their_own_entry() {
		$user = $this->become( 'author' );

		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'First' ),
			)
		);

		wp_set_current_user( $user );
		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'Refreshed' ),
			)
		);

		$this->assertSame( 200, $response->get_status() );

		GLL_URL_Cache::flush_memo();
		$this->assertSame( 'Refreshed', GLL_URL_Cache::get( self::URL )['GenSystem']['Label'] );
	}

	/**
	 * Someone who could edit the post anyway may overwrite.
	 */
	public function test_an_editor_may_overwrite_another_users_entry() {
		$this->become( 'author' );
		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'First' ),
			)
		);

		$this->become( 'editor' );
		$response = $this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'Corrected' ),
			)
		);

		$this->assertSame( 200, $response->get_status() );
	}

	/**
	 * Two addresses are two entries.
	 */
	public function test_two_addresses_do_not_share_an_entry() {
		$this->become( 'author' );

		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset( 'One' ),
			)
		);
		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => 'https://93.184.216.34/other.gll',
				'data' => $this->subset( 'Two' ),
			)
		);

		GLL_URL_Cache::flush_memo();

		$this->assertSame( 'One', GLL_URL_Cache::get( self::URL )['GenSystem']['Label'] );
		$this->assertSame(
			'Two',
			GLL_URL_Cache::get( 'https://93.184.216.34/other.gll' )['GenSystem']['Label']
		);
	}

	/**
	 * Discarding an entry.
	 */
	public function test_the_owner_may_discard_an_entry() {
		$user = $this->become( 'author' );
		$this->dispatch(
			'POST',
			null,
			array(
				'url'  => self::URL,
				'data' => $this->subset(),
			)
		);

		wp_set_current_user( $user );
		$response = $this->dispatch( 'DELETE' );

		$this->assertSame( 200, $response->get_status() );

		GLL_URL_Cache::flush_memo();
		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * An anonymous caller may not.
	 */
	public function test_an_anonymous_caller_may_not_discard() {
		wp_set_current_user( 0 );

		$this->assertSame( 401, $this->dispatch( 'DELETE' )->get_status() );
	}
}
