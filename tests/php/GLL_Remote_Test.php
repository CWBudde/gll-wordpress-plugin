<?php
/**
 * Tests for the editor-only download proxy.
 *
 * This is the one place in the plugin where a logged-in user can make the web
 * server issue an outbound request to an address of their choosing, so the tests
 * are weighted towards what it refuses rather than what it fetches.
 *
 * TWO THINGS ABOUT THE HTTP STUB MATTER, and both shape the code under test.
 * `pre_http_request` fires *before* core's `reject_unsafe_urls` validation, so a
 * stubbed request bypasses core's SSRF check entirely — which is why
 * `GLL_Remote::validate_url()` calls `wp_http_validate_url()` itself, and why the
 * validation tests below install no stub at all. And the production code streams
 * to a file rather than buffering, so a stub has to write `$args['filename']`
 * itself or there is nothing on disk to measure.
 *
 * @package
 */

/**
 * Tests for GLL_Remote.
 */
class GLL_Remote_Test extends WP_UnitTestCase {

	/**
	 * Requests the stub saw.
	 *
	 * @var array
	 */
	private $http_calls = array();

	/**
	 * Boot the REST server and switch the proxy on.
	 */
	public function set_up() {
		parent::set_up();

		global $wp_rest_server;
		$wp_rest_server = new WP_REST_Server();
		do_action( 'rest_api_init' );

		update_option( GLL_Remote::ENABLED_OPTION, '1' );
		$this->http_calls = array();
	}

	/**
	 * Reset everything the tests touched.
	 */
	public function tear_down() {
		remove_all_filters( 'pre_http_request' );
		delete_option( GLL_Remote::ENABLED_OPTION );
		delete_option( GLL_Remote::HOSTS_OPTION );

		global $wp_rest_server;
		$wp_rest_server = null;

		parent::tear_down();
	}

	/**
	 * A public address, written as a literal.
	 *
	 * The suite has no DNS — and must not need any — so every address that is
	 * meant to pass is an IP literal. `wp_http_validate_url()` resolves host
	 * names itself and refuses one it cannot look up, which is a check this code
	 * deliberately keeps rather than works around.
	 *
	 * @var string
	 */
	const PUBLIC_URL = 'https://93.184.216.34/speaker.gll';

	/**
	 * Install an HTTP stub that streams a body to the requested file.
	 *
	 * @param string $bytes Body to write.
	 * @param int    $code  Response code.
	 */
	private function stub_streamed_body( $bytes, $code = 200 ) {
		$calls = &$this->http_calls;

		add_filter(
			'pre_http_request',
			static function ( $pre, $args, $url ) use ( $bytes, $code, &$calls ) {
				$calls[] = array(
					'url'  => $url,
					'args' => $args,
				);

				if ( ! empty( $args['stream'] ) && ! empty( $args['filename'] ) ) {
					file_put_contents( $args['filename'], $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				}

				return array(
					'headers'  => array( 'content-length' => (string) strlen( $bytes ) ),
					'body'     => empty( $args['stream'] ) ? $bytes : '',
					'response' => array(
						'code'    => $code,
						'message' => 200 === $code ? 'OK' : 'Error',
					),
					'cookies'  => array(),
					'filename' => isset( $args['filename'] ) ? $args['filename'] : null,
				);
			},
			10,
			3
		);
	}

	/**
	 * Install an HTTP stub that fails.
	 *
	 * @param WP_Error|array $result What every request returns.
	 */
	private function stub_http_result( $result ) {
		add_filter(
			'pre_http_request',
			static function () use ( $result ) {
				return $result;
			},
			10,
			3
		);
	}

	/**
	 * Dispatch a proxy request.
	 *
	 * @param string $url Address to fetch.
	 * @return WP_REST_Response Response.
	 */
	private function dispatch( $url ) {
		$request = new WP_REST_Request( 'GET', '/' . GLL_REST::NAMESPACE . '/remote' );
		$request->set_param( 'url', $url );

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

		$this->assertArrayHasKey( '/' . GLL_REST::NAMESPACE . '/remote', $routes );
	}

	/* ---------------------------------------------------------------------
	 * Address validation. No HTTP stub is installed for any of these: they
	 * must be decided before a packet leaves, and a stub would hide that.
	 * ------------------------------------------------------------------ */

	/**
	 * The ordinary case.
	 */
	public function test_a_public_address_validates() {
		$this->assertSame( self::PUBLIC_URL, GLL_Remote::validate_url( self::PUBLIC_URL ) );
	}

	/**
	 * Schemes that are not the web.
	 *
	 * @dataProvider bad_scheme_provider
	 * @param string $url Address.
	 */
	public function test_a_non_web_scheme_is_refused( $url ) {
		$this->assertWPError( GLL_Remote::validate_url( $url ) );
	}

	/**
	 * Addresses with schemes this site will not speak.
	 *
	 * @return array[] Test cases.
	 */
	public function bad_scheme_provider() {
		return array(
			array( 'file:///etc/passwd' ),
			array( 'javascript:alert(1)' ),
			array( 'gopher://93.184.216.34/x' ),
			array( 'ftp://93.184.216.34/speaker.gll' ),
			array( 'dict://93.184.216.34:11211/stat' ),
			array( '' ),
			array( 'speaker.gll' ),
		);
	}

	/**
	 * Credentials in an address are the classic host-confusion trick.
	 */
	public function test_an_address_with_credentials_is_refused() {
		$this->assertWPError(
			GLL_Remote::validate_url( 'http://93.184.216.34@169.254.169.254/latest/' )
		);
	}

	/**
	 * Addresses inside this network.
	 *
	 * @dataProvider private_address_provider
	 * @param string $url Address.
	 */
	public function test_a_private_address_is_refused( $url ) {
		$this->assertWPError( GLL_Remote::validate_url( $url ) );
	}

	/**
	 * Addresses no outbound request may target.
	 *
	 * @return array[] Test cases.
	 */
	public function private_address_provider() {
		return array(
			'loopback'          => array( 'http://127.0.0.1/speaker.gll' ),
			'private class A'   => array( 'http://10.0.0.5/speaker.gll' ),
			'private class B'   => array( 'http://172.16.0.5/speaker.gll' ),
			'private class C'   => array( 'http://192.168.1.5/speaker.gll' ),
			'cgnat'             => array( 'http://100.64.0.1/speaker.gll' ),
			'benchmarking'      => array( 'http://198.18.0.1/speaker.gll' ),
			'multicast'         => array( 'http://224.0.0.1/speaker.gll' ),
			'ipv6 loopback'     => array( 'http://[::1]/speaker.gll' ),
			'ipv6 unique local' => array( 'http://[fd00::1]/speaker.gll' ),
		);
	}

	/**
	 * The cloud metadata service.
	 *
	 * `169.254.169.254` is the instance-metadata address on AWS, GCP, Azure and
	 * DigitalOcean, and the most valuable target any server-side request forgery
	 * has. Current WordPress refuses the whole link-local range itself, so this
	 * asserts the outcome rather than claiming credit for it: the plugin supports
	 * 6.7, whose list is shorter, and the check here does not depend on which
	 * release is installed.
	 */
	public function test_the_cloud_metadata_address_is_refused() {
		$this->assertWPError(
			GLL_Remote::validate_url( 'http://169.254.169.254/latest/meta-data/' )
		);
	}

	/**
	 * This site's own host is always allowed.
	 *
	 * Core makes the same exemption, for the same reason: an address on this host
	 * grants nothing an ordinary request does not. It matters in practice for a
	 * WordPress on an intranet, and for a developer on `localhost`, where the
	 * site's own uploads would otherwise be refused as a private address.
	 */
	public function test_this_sites_own_host_is_allowed() {
		$home = get_option( 'home' );

		$this->assertNotWPError(
			GLL_Remote::validate_url( $home . '/wp-content/uploads/speaker.gll' )
		);

		// Even with an allowlist that does not name it.
		update_option( GLL_Remote::HOSTS_OPTION, 'files.example' );
		$this->assertNotWPError(
			GLL_Remote::validate_url( $home . '/wp-content/uploads/speaker.gll' )
		);
	}

	/**
	 * A name nothing can resolve fails closed.
	 */
	public function test_an_unresolvable_host_is_refused() {
		add_filter( 'gll_info_remote_resolve', '__return_empty_array', 20 );

		$this->assertWPError( GLL_Remote::validate_url( 'https://nowhere.invalid/a.gll' ) );

		remove_filter( 'gll_info_remote_resolve', '__return_empty_array', 20 );
	}

	/**
	 * The resolution seam is consulted, and one bad address is enough.
	 */
	public function test_every_address_a_name_resolves_to_is_checked() {
		add_filter( 'gll_info_remote_resolve', array( $this, 'resolve_dual_stack' ), 20 );

		$this->assertWPError( GLL_Remote::validate_url( self::PUBLIC_URL ) );

		remove_filter( 'gll_info_remote_resolve', array( $this, 'resolve_dual_stack' ), 20 );
	}

	/**
	 * A host publishing one public and one private address is refused.
	 *
	 * Core resolves with `gethostbyname()`, which is IPv4-only, so a name with a
	 * public A record and a loopback AAAA record passes core's check while the
	 * transport may well connect over IPv6.
	 */
	public function test_a_dual_stack_host_with_a_private_address_is_refused() {
		add_filter( 'gll_info_remote_resolve', array( $this, 'resolve_dual_stack' ), 20 );

		$this->assertWPError( GLL_Remote::validate_url( self::PUBLIC_URL ) );

		remove_filter( 'gll_info_remote_resolve', array( $this, 'resolve_dual_stack' ), 20 );
	}

	/**
	 * One public IPv4 address and one loopback IPv6 address.
	 *
	 * @return string[] Addresses.
	 */
	public function resolve_dual_stack() {
		return array( '93.184.216.34', '::1' );
	}

	/**
	 * An empty allowlist means any public host.
	 */
	public function test_an_empty_allowlist_allows_any_public_host() {
		$this->assertTrue( GLL_Remote::host_allowed( 'files.example' ) );
		$this->assertSame( self::PUBLIC_URL, GLL_Remote::validate_url( self::PUBLIC_URL ) );
	}

	/**
	 * A configured allowlist is exhaustive.
	 */
	public function test_the_allowlist_refuses_a_host_that_is_not_on_it() {
		update_option( GLL_Remote::HOSTS_OPTION, "files.example\n*.cdn.example" );

		$this->assertTrue( GLL_Remote::host_allowed( 'files.example' ) );
		$this->assertTrue( GLL_Remote::host_allowed( 'eu.cdn.example' ) );
		$this->assertFalse( GLL_Remote::host_allowed( 'other.example' ) );

		// End to end: an address that would otherwise pass every check is
		// refused because its host is not on the list.
		$this->assertWPError( GLL_Remote::validate_url( self::PUBLIC_URL ) );
	}

	/* ---------------------------------------------------------------------
	 * Permissions.
	 * ------------------------------------------------------------------ */

	/**
	 * The proxy ships off, because it is the plugin's only outbound-fetch
	 * capability and the residual rebinding exposure cannot be closed here.
	 */
	public function test_the_proxy_is_off_by_default() {
		delete_option( GLL_Remote::ENABLED_OPTION );
		$this->become( 'administrator' );

		$response = $this->dispatch( self::PUBLIC_URL );

		$this->assertSame( 403, $response->get_status() );
		$this->assertSame( 'gll_info_remote_disabled', $response->as_error()->get_error_code() );
	}

	/**
	 * An anonymous visitor never reaches this route.
	 */
	public function test_an_anonymous_caller_may_not_fetch() {
		wp_set_current_user( 0 );

		$this->assertSame( 401, $this->dispatch( self::PUBLIC_URL )->get_status() );
	}

	/**
	 * A contributor holds `edit_posts` but not `upload_files`, and is
	 * deliberately not allowed to bring foreign bytes into the site.
	 */
	public function test_a_contributor_may_not_fetch() {
		$this->become( 'contributor' );

		$this->assertSame( 403, $this->dispatch( self::PUBLIC_URL )->get_status() );
	}

	/**
	 * An author may.
	 */
	public function test_an_author_may_fetch() {
		$this->become( 'author' );
		$this->stub_streamed_body( 'GLL BYTES' );

		$this->assertSame( 200, $this->dispatch( self::PUBLIC_URL )->get_status() );
	}

	/* ---------------------------------------------------------------------
	 * Downloading.
	 * ------------------------------------------------------------------ */

	/**
	 * The body never enters PHP memory.
	 *
	 * Pinned as a test because the whole size story rests on it: without
	 * streaming, a 64 MB ceiling would be a 64 MB allocation.
	 */
	public function test_the_body_is_streamed_to_a_file() {
		$this->become( 'author' );
		$this->stub_streamed_body( 'GLL BYTES' );

		$this->dispatch( self::PUBLIC_URL );

		$get = end( $this->http_calls );
		$this->assertTrue( (bool) $get['args']['stream'] );
		$this->assertNotEmpty( $get['args']['filename'] );
	}

	/**
	 * An obviously oversized file costs one round trip, not a download.
	 */
	public function test_a_declared_size_over_the_ceiling_is_refused() {
		$this->become( 'author' );
		add_filter( 'gll_info_remote_max_bytes', array( $this, 'filter_tiny_ceiling' ) );
		$this->stub_streamed_body( str_repeat( 'x', 64 ) );

		$response = $this->dispatch( self::PUBLIC_URL );

		remove_filter( 'gll_info_remote_max_bytes', array( $this, 'filter_tiny_ceiling' ) );

		$this->assertSame( 413, $response->get_status() );
	}

	/**
	 * `Content-Length` is advisory; the file on disk is not.
	 *
	 * Both transports truncate at `limit_response_size` rather than erroring, so
	 * without this check an oversized download would arrive as a corrupt file
	 * that looks perfectly well-formed.
	 */
	public function test_a_body_over_the_ceiling_is_refused_even_when_the_header_lied() {
		$this->become( 'author' );
		$bytes = str_repeat( 'x', 64 );
		$calls = &$this->http_calls;

		add_filter(
			'pre_http_request',
			static function ( $pre, $args, $url ) use ( $bytes, &$calls ) {
				$calls[] = array(
					'url'  => $url,
					'args' => $args,
				);

				if ( ! empty( $args['filename'] ) ) {
					file_put_contents( $args['filename'], $bytes ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_file_put_contents
				}

				return array(
					'headers'  => array( 'content-length' => '4' ),
					'body'     => '',
					'response' => array(
						'code'    => 200,
						'message' => 'OK',
					),
					'cookies'  => array(),
					'filename' => isset( $args['filename'] ) ? $args['filename'] : null,
				);
			},
			10,
			3
		);

		add_filter( 'gll_info_remote_max_bytes', array( $this, 'filter_tiny_ceiling' ) );
		$response = $this->dispatch( self::PUBLIC_URL );
		remove_filter( 'gll_info_remote_max_bytes', array( $this, 'filter_tiny_ceiling' ) );

		$this->assertSame( 413, $response->get_status() );
	}

	/**
	 * A ceiling of 32 bytes.
	 *
	 * @return int Ceiling in bytes.
	 */
	public function filter_tiny_ceiling() {
		return 32;
	}

	/**
	 * An empty file is not a GLL file.
	 */
	public function test_an_empty_body_is_refused() {
		$this->become( 'author' );
		$this->stub_streamed_body( '' );

		$this->assertSame( 413, $this->dispatch( self::PUBLIC_URL )->get_status() );
	}

	/**
	 * Every upstream failure reads the same.
	 *
	 * Deliberate: differentiating them would turn the route into a port scanner
	 * and an existence oracle for whatever this server can reach.
	 */
	public function test_upstream_failures_are_indistinguishable() {
		$this->become( 'author' );

		$this->stub_streamed_body( '', 404 );
		$not_found = $this->dispatch( self::PUBLIC_URL );
		remove_all_filters( 'pre_http_request' );

		$this->stub_http_result( new WP_Error( 'http_request_failed', 'Connection refused' ) );
		$refused = $this->dispatch( self::PUBLIC_URL );

		$this->assertSame( 502, $not_found->get_status() );
		$this->assertSame( 502, $refused->get_status() );
		$this->assertSame(
			$not_found->as_error()->get_error_code(),
			$refused->as_error()->get_error_code()
		);
		$this->assertSame(
			$not_found->as_error()->get_error_message(),
			$refused->as_error()->get_error_message()
		);
	}

	/**
	 * The remote's content type is never echoed back.
	 *
	 * The response comes from this site's origin, so reflecting `text/html` would
	 * make the proxy a same-origin mirror for arbitrary markup.
	 */
	public function test_the_response_is_always_an_opaque_download() {
		$headers = GLL_Remote::response_headers( 128 );

		$this->assertSame( 'application/octet-stream', $headers['Content-Type'] );
		$this->assertSame( 'nosniff', $headers['X-Content-Type-Options'] );
		$this->assertSame( '128', $headers['Content-Length'] );
		$this->assertStringContainsString( 'sandbox', $headers['Content-Security-Policy'] );
		$this->assertStringContainsString( 'no-store', $headers['Cache-Control'] );
	}

	/**
	 * Repeated fetching is bounded.
	 */
	public function test_the_rate_limit_closes_after_its_allowance() {
		add_filter( 'gll_info_remote_rate_limit', array( $this, 'filter_two_fetches' ) );
		$user = $this->become( 'author' );

		$this->assertTrue( GLL_Remote::throttle_ok( $user ) );
		$this->assertTrue( GLL_Remote::throttle_ok( $user ) );
		$this->assertFalse( GLL_Remote::throttle_ok( $user ) );

		remove_filter( 'gll_info_remote_rate_limit', array( $this, 'filter_two_fetches' ) );
	}

	/**
	 * Allow two fetches per window.
	 *
	 * @return int Limit.
	 */
	public function filter_two_fetches() {
		return 2;
	}

	/**
	 * The CIDR helper, which the address checks rest on.
	 */
	public function test_cidr_matching_handles_both_address_families() {
		$this->assertTrue( GLL_Remote::in_cidr( '100.64.0.1', '100.64.0.0/10' ) );
		$this->assertFalse( GLL_Remote::in_cidr( '100.128.0.1', '100.64.0.0/10' ) );
		$this->assertTrue( GLL_Remote::in_cidr( 'fd00::1', 'fc00::/7' ) );
		$this->assertFalse( GLL_Remote::in_cidr( '2001:db8::1', 'fc00::/7' ) );

		// A v4 address is never inside a v6 block, and the reverse.
		$this->assertFalse( GLL_Remote::in_cidr( '10.0.0.1', 'fc00::/7' ) );
		$this->assertFalse( GLL_Remote::in_cidr( 'fd00::1', '10.0.0.0/8' ) );
	}
}
