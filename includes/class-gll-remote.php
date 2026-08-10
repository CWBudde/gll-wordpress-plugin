<?php
/**
 * Fetch an external GLL file on the author's behalf.
 *
 * This is the most dangerous code in the plugin and should be reviewed on that
 * basis rather than as a convenience feature. It makes the web server issue an
 * outbound HTTP request to an address a logged-in user chose, which is the shape
 * of every server-side request forgery there has ever been.
 *
 * What bounds it:
 *
 * - IT IS NEVER REACHED BY A VISITOR. Only the block editor calls it, only with
 *   `upload_files`, and only after an administrator has switched it on. A
 *   published page fetches an external file directly from the reader's browser,
 *   which is why the remote host must send `Access-Control-Allow-Origin` and why
 *   that requirement is documented rather than worked around.
 * - It returns bytes and does not parse. The editor needs the FULL parse for the
 *   five measurement blocks, which the display subset deliberately drops, and
 *   most hosts have no server-side parser at all — so a parse-and-return proxy
 *   would be dead code exactly where the proxy is needed.
 * - Nothing is held in memory: the body is streamed to a temp file and read back
 *   with `readfile()`.
 *
 * `upload_files` rather than `edit_posts` is the capability, and the difference
 * matters. Contributors hold `edit_posts` and are deliberately denied the media
 * library — they may not bring foreign bytes into the site. Handing them a
 * server-side fetcher would be a privilege escalation relative to that. Authors
 * and above already hold "may introduce foreign file bytes", so this grants
 * nothing new in kind.
 *
 * WHAT CORE ALREADY DOES, so it is not re-implemented here: `wp_safe_remote_*`
 * sets `reject_unsafe_urls`, which runs `wp_http_validate_url()` — forcing the
 * scheme to http/https, rejecting credentials in the URL, restricting the port to
 * 80/443/8080, refusing a host it cannot resolve, and rejecting the IPv4
 * special-purpose ranges. Current WordPress covers those thoroughly, link-local
 * `169.254.0.0/16` — the cloud metadata address — included. Redirects are capped
 * and, contrary to the usual assumption, EVERY hop is revalidated through
 * `WP_Http::validate_redirects`.
 *
 * WHY `validate_url()` STILL EXISTS, given all that:
 *
 * 1. **IPv6 is not evaluated at all.** Core resolves with `gethostbyname()`,
 *    which is IPv4-only, and its range table is a list of IPv4 octets. A host
 *    publishing a public A record and a loopback or unique-local AAAA record
 *    passes core's check while the transport may well connect over v6. This is
 *    the one genuine gap, and it is what `resolve()` and `is_public_ip()` close.
 * 2. **This plugin supports WordPress 6.7.** Core's list grew over time; a site
 *    on an older release does not have all of it. Repeating the ranges here
 *    costs a few lines and does not depend on which release is installed.
 * 3. A rejection decided here happens before any request, so it can be reported
 *    as a distinct error rather than as an upstream failure — and it is testable
 *    without a network, which core's is not (see the note about the stub above).
 *
 * WHAT NOBODY CAN DO IN USERLAND: DNS rebinding. Validation resolves the name,
 * then the transport resolves it again to connect, and WordPress exposes no way
 * to pin the address that was validated. A zero-TTL name can answer public and
 * then private. That residual hole is the honest reason the host allowlist
 * exists and the reason this ships switched off.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Downloads external GLL files for the block editor.
 */
class GLL_Remote {

	/**
	 * Option switching the proxy on.
	 *
	 * Off by default, deliberately. See the class docblock.
	 *
	 * @var string
	 */
	const ENABLED_OPTION = 'gll_info_remote_proxy';

	/**
	 * Option holding the newline-separated host allowlist.
	 *
	 * @var string
	 */
	const HOSTS_OPTION = 'gll_info_remote_allowed_hosts';

	/**
	 * Option holding the size ceiling, in megabytes.
	 *
	 * @var string
	 */
	const MAX_MB_OPTION = 'gll_info_remote_max_mb';

	/**
	 * Largest download accepted, in bytes.
	 *
	 * Matched to what a browser can actually parse afterwards rather than to what
	 * a server can hold — nothing is held.
	 *
	 * @var int
	 */
	const MAX_BYTES = 67108864;

	/**
	 * Seconds allowed for the download.
	 *
	 * @var int
	 */
	const TIMEOUT = 30;

	/**
	 * Fetches allowed per user per five minutes.
	 *
	 * @var int
	 */
	const RATE_LIMIT = 20;

	/**
	 * Redirect hops followed before giving up.
	 *
	 * @var int
	 */
	const MAX_REDIRECTS = 3;

	/**
	 * Ranges the PHP filter flags leave reachable.
	 *
	 * `FILTER_FLAG_NO_PRIV_RANGE|NO_RES_RANGE` covers 10/8, 172.16/12, 192.168/16,
	 * 127/8, 0/8, 169.254/16, 240/4, `::1`, `::` and `fe80::/10`. These are what
	 * remains — and the IPv6 entries are the ones that matter most, since they are
	 * the family core does not look at.
	 *
	 * @var string[]
	 */
	const EXTRA_BLOCKED = array(
		'100.64.0.0/10',   // CGNAT.
		'192.0.0.0/24',    // IETF protocol assignments.
		'198.18.0.0/15',   // Benchmarking.
		'224.0.0.0/4',     // Multicast.
		'fc00::/7',        // Unique local.
		'64:ff9b::/96',    // NAT64.
		'::ffff:0:0/96',   // IPv4-mapped, which would otherwise smuggle v4 past the v6 checks.
	);

	/**
	 * Temp file the current request will stream back, if any.
	 *
	 * @var string|null
	 */
	private static $streaming = null;

	/**
	 * Whether an administrator has switched the proxy on.
	 *
	 * @return bool True when external files may be fetched by this server.
	 */
	public static function is_enabled() {
		/**
		 * Filter whether the server may fetch external GLL files.
		 *
		 * @param bool $enabled Whether the proxy is on.
		 */
		return (bool) apply_filters( 'gll_info_remote_enabled', '1' === get_option( self::ENABLED_OPTION, '0' ) );
	}

	/**
	 * Whether the current user may ask this server to fetch a URL.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error True when allowed.
	 */
	public static function can_fetch( $request ) {
		unset( $request );

		if ( ! self::is_enabled() ) {
			return new WP_Error(
				'gll_info_remote_disabled',
				__( 'This site is not set up to load GLL files from other websites. An administrator can turn that on under Settings → GLL Info.', 'gll-info' ),
				array( 'status' => 403 )
			);
		}

		if ( ! current_user_can( 'upload_files' ) ) {
			return new WP_Error(
				'gll_info_cannot_fetch',
				__( 'You are not allowed to load files from other websites.', 'gll-info' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * Fetch an external GLL file and hand its bytes back.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error The bytes, or an error.
	 */
	public static function proxy( $request ) {
		$url = self::validate_url( $request['url'] );

		if ( is_wp_error( $url ) ) {
			return $url;
		}

		if ( ! self::throttle_ok( get_current_user_id() ) ) {
			return new WP_Error(
				'gll_info_remote_throttled',
				__( 'Too many external files have been loaded recently. Try again in a few minutes.', 'gll-info' ),
				array( 'status' => 429 )
			);
		}

		$tmp = self::download( $url );

		if ( is_wp_error( $tmp ) ) {
			return $tmp;
		}

		// Free of charge on the minority of hosts that have a parser: the bytes
		// are already here, so the cached summary can be built without a second
		// download. A no-op everywhere else, and never fatal.
		self::warm_from_path( $url, $tmp );

		self::$streaming = $tmp;
		add_filter( 'rest_pre_serve_request', array( __CLASS__, 'serve_bytes' ), 10, 3 );
		add_action( 'shutdown', array( __CLASS__, 'cleanup' ) );

		return new WP_REST_Response( null, 200 );
	}

	/**
	 * Write the downloaded bytes as the response body.
	 *
	 * @param bool            $served  Whether the request has already been served.
	 * @param WP_REST_Response $result  Response object.
	 * @param WP_REST_Request  $request Request.
	 * @return bool Whether the request was served here.
	 */
	public static function serve_bytes( $served, $result, $request ) {
		unset( $result );

		if ( null === self::$streaming || '/' . GLL_REST::NAMESPACE . '/remote' !== $request->get_route() ) {
			return $served;
		}

		$tmp             = self::$streaming;
		self::$streaming = null;

		foreach ( self::response_headers( (int) @filesize( $tmp ) ) as $name => $value ) { // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			header( $name . ': ' . $value );
		}

		readfile( $tmp ); // phpcs:ignore WordPress.WP.AlternativeFunctions.file_system_operations_readfile
		wp_delete_file( $tmp );

		return true;
	}

	/**
	 * Headers the proxied bytes are served with.
	 *
	 * THE REMOTE'S OWN CONTENT TYPE IS NEVER REFLECTED. This response comes from
	 * this site's origin, so echoing back `text/html` would turn the proxy into a
	 * same-origin mirror for arbitrary markup — which is a stored-XSS primitive,
	 * not a content-negotiation nicety. It is always an opaque download.
	 *
	 * Split out from the emission so it can be asserted in a test without needing
	 * a real SAPI.
	 *
	 * @param int $length Body length in bytes.
	 * @return array Header name => value.
	 */
	public static function response_headers( $length ) {
		return array(
			'Content-Type'            => 'application/octet-stream',
			'Content-Length'          => (string) $length,
			'Content-Disposition'     => 'attachment; filename="external.gll"',
			'X-Content-Type-Options'  => 'nosniff',
			'Content-Security-Policy' => "default-src 'none'; sandbox",
			'Cache-Control'           => 'private, no-store, max-age=0',
			'X-Robots-Tag'            => 'noindex',
		);
	}

	/**
	 * Remove a temp file the response never got to.
	 *
	 * A client that disconnects between the download and the write would otherwise
	 * leave the file behind.
	 */
	public static function cleanup() {
		if ( null !== self::$streaming ) {
			wp_delete_file( self::$streaming );
			self::$streaming = null;
		}
	}

	/**
	 * Check a URL against everything this site is willing to fetch.
	 *
	 * `wp_http_validate_url()` is called HERE rather than being left to
	 * `reject_unsafe_urls` inside the request, for two reasons. It lets a rejection
	 * be reported as a distinct 400 before any packet leaves; and `pre_http_request`
	 * fires *before* core's validation, so a stubbed request in the test suite would
	 * otherwise bypass the check entirely and the SSRF tests would be asserting
	 * nothing.
	 *
	 * @param string $raw Candidate URL.
	 * @return string|WP_Error The validated URL, or a blocked error.
	 */
	public static function validate_url( $raw ) {
		$url = wp_http_validate_url( trim( (string) $raw ) );

		if ( ! $url ) {
			return self::blocked();
		}

		$host = strtolower( (string) wp_parse_url( $url, PHP_URL_HOST ) );

		if ( '' === $host ) {
			return self::blocked();
		}

		// This site is always reachable from itself, and core makes the same
		// exemption for the same reason: an address on this host grants nothing
		// an ordinary request does not. Without it a site on an intranet — or a
		// developer's `localhost` — could not point a block at its own uploads,
		// which is a legitimate thing to do when a file is shared between two
		// installs.
		if ( $host === self::own_host() ) {
			return $url;
		}

		if ( ! self::host_allowed( $host ) ) {
			return self::blocked();
		}

		$addresses = self::resolve( $host );

		// Fails closed: a name nothing can resolve is not a name this server
		// will connect to.
		if ( empty( $addresses ) ) {
			return self::blocked();
		}

		foreach ( $addresses as $ip ) {
			if ( ! self::is_public_ip( $ip ) ) {
				return self::blocked();
			}
		}

		return $url;
	}

	/**
	 * The host this site is served from.
	 *
	 * @return string Lowercased host, or '' when it cannot be determined.
	 */
	private static function own_host() {
		return strtolower( (string) wp_parse_url( get_option( 'home' ), PHP_URL_HOST ) );
	}

	/**
	 * Every address a host resolves to, v4 and v6.
	 *
	 * @param string $host Hostname or IP literal.
	 * @return string[] Addresses, empty when nothing resolves.
	 */
	public static function resolve( $host ) {
		/**
		 * Short-circuit hostname resolution.
		 *
		 * The seam the test suite uses to make resolution deterministic. Returning
		 * a non-null array replaces the lookup entirely.
		 *
		 * @param string[]|null $addresses Addresses, or null to resolve normally.
		 * @param string        $host      Host being resolved.
		 */
		$filtered = apply_filters( 'gll_info_remote_resolve', null, $host );

		if ( is_array( $filtered ) ) {
			return $filtered;
		}

		if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
			return array( $host );
		}

		// A bracketed IPv6 literal never reaches here — `wp_http_validate_url()`
		// rejects any host containing `[` or `]` — but strip them anyway so this
		// helper is safe to call on its own.
		$bare = trim( $host, '[]' );

		if ( filter_var( $bare, FILTER_VALIDATE_IP ) ) {
			return array( $bare );
		}

		$addresses = gethostbynamel( $host );
		$addresses = is_array( $addresses ) ? $addresses : array();

		$records = @dns_get_record( $host, DNS_AAAA ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		if ( is_array( $records ) ) {
			foreach ( $records as $record ) {
				if ( ! empty( $record['ipv6'] ) ) {
					$addresses[] = $record['ipv6'];
				}
			}
		}

		return $addresses;
	}

	/**
	 * Whether an address is one this server may connect to.
	 *
	 * @param string $ip IPv4 or IPv6 address.
	 * @return bool True when the address is public.
	 */
	public static function is_public_ip( $ip ) {
		if ( ! filter_var( $ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE ) ) {
			return false;
		}

		foreach ( self::EXTRA_BLOCKED as $cidr ) {
			if ( self::in_cidr( $ip, $cidr ) ) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Whether an address falls inside a CIDR block.
	 *
	 * Compares packed addresses bit by bit, so one implementation covers v4 and
	 * v6 and neither needs integer arithmetic that breaks on 32-bit builds.
	 *
	 * @param string $ip   Address.
	 * @param string $cidr Block in `address/prefix` form.
	 * @return bool True when the address is inside the block.
	 */
	public static function in_cidr( $ip, $cidr ) {
		list( $subnet, $bits ) = array_pad( explode( '/', $cidr, 2 ), 2, null );

		$packed_ip     = @inet_pton( $ip );     // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
		$packed_subnet = @inet_pton( $subnet ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		if ( false === $packed_ip || false === $packed_subnet ) {
			return false;
		}

		// A v4 address is never inside a v6 block, and the reverse.
		if ( strlen( $packed_ip ) !== strlen( $packed_subnet ) ) {
			return false;
		}

		$bits  = (int) $bits;
		$bytes = intdiv( $bits, 8 );
		$rest  = $bits % 8;

		if ( $bytes > 0 && 0 !== substr_compare( $packed_ip, substr( $packed_subnet, 0, $bytes ), 0, $bytes ) ) {
			return false;
		}

		if ( 0 === $rest ) {
			return true;
		}

		$mask = ~( ( 1 << ( 8 - $rest ) ) - 1 ) & 0xff;

		return ( ord( $packed_ip[ $bytes ] ) & $mask ) === ( ord( $packed_subnet[ $bytes ] ) & $mask );
	}

	/**
	 * Whether a host is on the allowlist.
	 *
	 * An empty list means "any public host", so the allowlist costs nothing on a
	 * site that does not want one. A leading `*.` matches subdomains.
	 *
	 * @param string $host Hostname, lowercased.
	 * @return bool True when the host may be fetched.
	 */
	public static function host_allowed( $host ) {
		$allowed = self::allowed_hosts();

		if ( empty( $allowed ) ) {
			return true;
		}

		foreach ( $allowed as $pattern ) {
			if ( $pattern === $host ) {
				return true;
			}

			if ( 0 === strpos( $pattern, '*.' ) ) {
				$suffix = substr( $pattern, 1 ); // Keeps the leading dot.

				if ( substr( $host, -strlen( $suffix ) ) === $suffix ) {
					return true;
				}
			}
		}

		return false;
	}

	/**
	 * The configured host allowlist.
	 *
	 * A constant and a filter sit above the option so a hardened site can pin the
	 * list in `wp-config.php`, out of reach of any administrator account.
	 *
	 * @return string[] Lowercased host patterns.
	 */
	public static function allowed_hosts() {
		$raw = defined( 'GLL_INFO_REMOTE_HOSTS' )
			? GLL_INFO_REMOTE_HOSTS
			: get_option( self::HOSTS_OPTION, '' );

		$hosts = array_filter( array_map( 'trim', preg_split( '/[\r\n,]+/', (string) $raw ) ) );

		/**
		 * Filter the hosts this server may fetch GLL files from.
		 *
		 * An empty list means any public host.
		 *
		 * @param string[] $hosts Host patterns.
		 */
		$hosts = apply_filters( 'gll_info_remote_allowed_hosts', $hosts );

		return is_array( $hosts ) ? array_map( 'strtolower', $hosts ) : array();
	}

	/**
	 * Largest download this site accepts, in bytes.
	 *
	 * @return int Ceiling in bytes.
	 */
	public static function max_bytes() {
		$configured = (int) get_option( self::MAX_MB_OPTION, 0 );
		$bytes      = $configured > 0 ? $configured * MB_IN_BYTES : self::MAX_BYTES;

		/**
		 * Filter the largest external file this server will download.
		 *
		 * @param int $bytes Ceiling in bytes.
		 */
		$bytes = (int) apply_filters( 'gll_info_remote_max_bytes', $bytes );

		return $bytes > 0 ? $bytes : self::MAX_BYTES;
	}

	/**
	 * Download a validated URL to a temp file.
	 *
	 * Three independent size checks, because the first two are advisory and only
	 * the third is true. `Content-Length` may lie or be absent, and
	 * `limit_response_size` TRUNCATES rather than erroring in both the curl and
	 * the streams transport — used alone it would hand back a corrupt file that
	 * looks perfectly well-formed. So it is set one byte above the ceiling purely
	 * so the file on disk can be measured and rejected.
	 *
	 * @param string $url Validated URL.
	 * @return string|WP_Error Path to the downloaded file, or an error.
	 */
	private static function download( $url ) {
		$cap = self::max_bytes();

		$head = self::request(
			'HEAD',
			$url,
			array(
				'timeout' => 10,
			)
		);

		// A refusal decided here — a redirect into a network or onto a host this
		// site will not follow — is reported as itself rather than folded into
		// the flat upstream error. It is our policy speaking, and an author whose
		// CDN redirects to a delivery host that is not on the allowlist has no
		// other way to find that out. The cost is that it says slightly more
		// than "something went wrong" about an address the caller supplied and
		// could follow in their own browser anyway.
		if ( self::is_blocked( $head ) ) {
			return $head;
		}

		if ( ! is_wp_error( $head ) ) {
			$length = (int) wp_remote_retrieve_header( $head, 'content-length' );

			if ( $length > $cap ) {
				return self::too_large();
			}
		}

		$tmp = wp_tempnam( 'gll-remote' );

		if ( ! $tmp ) {
			return self::failed();
		}

		$response = self::request(
			'GET',
			$url,
			array(
				'timeout'             => (int) apply_filters( 'gll_info_remote_timeout', self::TIMEOUT ),
				'stream'              => true,
				'filename'            => $tmp,
				'limit_response_size' => $cap + 1,
				'user-agent'          => 'WordPress/' . get_bloginfo( 'version' ) . '; gll-info/' . GLL_INFO_VERSION,
				'headers'             => array( 'Accept' => 'application/octet-stream' ),
			)
		);

		if ( self::is_blocked( $response ) ) {
			wp_delete_file( $tmp );

			return $response;
		}

		if ( is_wp_error( $response ) || 200 !== (int) wp_remote_retrieve_response_code( $response ) ) {
			wp_delete_file( $tmp );

			return self::failed();
		}

		$size = (int) @filesize( $tmp ); // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged

		if ( $size < 1 || $size > $cap ) {
			wp_delete_file( $tmp );

			return self::too_large();
		}

		return $tmp;
	}

	/**
	 * Make a request, following redirects ourselves.
	 *
	 * REDIRECTS ARE FOLLOWED BY HAND, and that is the whole point of this method.
	 * Core does revalidate every hop — but through `wp_http_validate_url()`, which
	 * knows nothing about this plugin's host allowlist and nothing about the IPv6
	 * checks in `validate_url()`. Those are precisely the two protections that
	 * exist here because core does not provide them, so letting the transport
	 * follow a `Location` would hand an allowlisted host — or any open redirect on
	 * one — a way to send this server somewhere the allowlist forbids, including a
	 * name whose public A record hides a private AAAA record.
	 *
	 * So `redirection` is 0 on every request and each `Location` goes back through
	 * the full `validate_url()` before it is followed.
	 *
	 * @param string $method HTTP method, 'GET' or 'HEAD'.
	 * @param string $url    Already-validated URL.
	 * @param array  $args   Request arguments; `redirection` is overridden.
	 * @return array|WP_Error Response, or an error.
	 */
	private static function request( $method, $url, $args ) {
		$args['redirection'] = 0;

		for ( $hop = 0; $hop <= self::MAX_REDIRECTS; $hop++ ) {
			$response = 'HEAD' === $method
				? wp_safe_remote_head( $url, $args )
				: wp_safe_remote_get( $url, $args );

			if ( is_wp_error( $response ) ) {
				return $response;
			}

			$code = (int) wp_remote_retrieve_response_code( $response );

			if ( ! in_array( $code, array( 301, 302, 303, 307, 308 ), true ) ) {
				return $response;
			}

			$location = wp_remote_retrieve_header( $response, 'location' );

			// A redirect with nowhere to go is just a response with an odd
			// status; the size and code checks downstream will reject it.
			if ( ! $location ) {
				return $response;
			}

			$next = WP_Http::make_absolute_url( $location, $url );
			$next = self::validate_url( $next );

			if ( is_wp_error( $next ) ) {
				return $next;
			}

			$url = $next;
		}

		return self::failed();
	}

	/**
	 * Build the cached summary from a file that has just been downloaded.
	 *
	 * Silent about every failure. There is no backend on most hosts, the file may
	 * exceed the backend's own ceiling, and none of that is the author's problem:
	 * the editor publishes the summary itself once it has parsed the bytes in the
	 * browser.
	 *
	 * @param string $url  The URL the file came from.
	 * @param string $path Temp file holding the bytes.
	 */
	private static function warm_from_path( $url, $path ) {
		if ( ! GLL_Parser::is_enabled() || ! GLL_Parser::backend() ) {
			return;
		}

		if ( false !== GLL_URL_Cache::get( $url ) ) {
			return;
		}

		$subset = GLL_Parser::subset_for_path( $path );

		if ( is_wp_error( $subset ) ) {
			return;
		}

		$backend = GLL_Parser::backend();

		GLL_URL_Cache::set(
			$url,
			$subset,
			$backend ? $backend->id() : 'browser',
			array(
				'hash'   => (string) hash_file( 'sha256', $path ),
				'length' => (int) @filesize( $path ), // phpcs:ignore WordPress.PHP.NoSilencedErrors.Discouraged
			)
		);
	}

	/**
	 * Whether a user may fetch again now.
	 *
	 * @param int $user_id User ID.
	 * @return bool True when the fetch may proceed.
	 */
	public static function throttle_ok( $user_id ) {
		$user_id = (int) $user_id;

		if ( $user_id <= 0 ) {
			return false;
		}

		/**
		 * Filter how many external fetches one user may make per five minutes.
		 *
		 * @param int $limit Fetches per window.
		 */
		$limit = (int) apply_filters( 'gll_info_remote_rate_limit', self::RATE_LIMIT );
		$name  = 'gll_remote_rate_' . $user_id;
		$count = (int) get_transient( $name );

		if ( $count >= $limit ) {
			return false;
		}

		set_transient( $name, $count + 1, 5 * MINUTE_IN_SECONDS );

		return true;
	}

	/**
	 * Whether a result is this site refusing an address.
	 *
	 * @param mixed $result Response or error.
	 * @return bool True when it is a local refusal.
	 */
	private static function is_blocked( $result ) {
		return is_wp_error( $result ) && 'gll_info_remote_blocked' === $result->get_error_code();
	}

	/**
	 * The error for a URL this site will not fetch.
	 *
	 * Distinct from `failed()` because it reports a decision made locally, on
	 * information the caller already had. Nothing about the remote host leaks.
	 *
	 * @return WP_Error Bad-request error.
	 */
	private static function blocked() {
		return new WP_Error(
			'gll_info_remote_blocked',
			__( 'That address cannot be loaded by this site. Use a public https address for the file.', 'gll-info' ),
			array( 'status' => 400 )
		);
	}

	/**
	 * The one error every upstream failure produces.
	 *
	 * DELIBERATELY UNDIFFERENTIATED. A refused connection, an unknown host, a 404
	 * and a 500 all read the same, so the route cannot be used to map what a
	 * server can reach or to test whether a resource exists. Timing still leaks a
	 * little; that is a known and accepted limit.
	 *
	 * @return WP_Error Bad-gateway error.
	 */
	private static function failed() {
		return new WP_Error(
			'gll_info_remote_failed',
			__( 'The file could not be downloaded from that address.', 'gll-info' ),
			array( 'status' => 502 )
		);
	}

	/**
	 * The error for a file over the size ceiling.
	 *
	 * @return WP_Error Payload-too-large error.
	 */
	private static function too_large() {
		return new WP_Error(
			'gll_info_remote_too_large',
			__( 'That file is too large for this site to download.', 'gll-info' ),
			array( 'status' => 413 )
		);
	}
}
