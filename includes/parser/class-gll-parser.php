<?php
/**
 * Choose and drive a server-side GLL parser.
 *
 * Server-side parsing is what makes the cache warm without anyone opening the
 * block editor: a `.gll` uploaded to the media library is parsed once, on
 * upload, and every page that later uses it is served the cached subset. Where
 * no backend is available the plugin behaves exactly as it did before — the
 * editor warms the cache when an author picks a file, and the frontend parses in
 * the browser when it is cold.
 *
 * Detection runs once and is remembered in an option, because probing means
 * spawning a subprocess and that must not happen per request. The stored result
 * is tied to the plugin version, so an upgrade re-probes.
 *
 * Backends are tried in order of preference:
 *
 *   1. node     — the bundled WASM parser under Node; no Go on the server
 *   2. cli      — an administrator-provided `gllinfo` binary; opt-in only
 *   3. phpwasm  — in-process; inert until gll-tools ships a WASI build
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Backend registry, detection and dispatch.
 */
class GLL_Parser {

	/**
	 * Option holding the detected backend.
	 *
	 * @var string
	 */
	const DETECTED_OPTION = 'gll_info_parser_detected';

	/**
	 * Option holding the administrator's on/off switch.
	 *
	 * @var string
	 */
	const ENABLED_OPTION = 'gll_info_server_parse';

	/**
	 * Backend instances, built once per request.
	 *
	 * @var GLL_Parser_Backend[]|null
	 */
	private static $backends = null;

	/**
	 * Every backend, in order of preference.
	 *
	 * @return GLL_Parser_Backend[] Backends.
	 */
	public static function backends() {
		if ( null === self::$backends ) {
			/**
			 * Filter the available parser backends.
			 *
			 * Order is preference: the first one that reports itself available
			 * wins. Entries must extend `GLL_Parser_Backend`; anything else is
			 * dropped rather than trusted, since a backend is handed a file path
			 * and asked to run.
			 *
			 * This is the seam a WASI runtime integration hooks into, and the
			 * one the test suite uses to exercise the caching pipeline on a host
			 * with no real backend installed.
			 *
			 * @param GLL_Parser_Backend[] $backends Backends, most preferred first.
			 */
			$backends = apply_filters(
				'gll_info_parser_backends',
				array(
					new GLL_Parser_Node(),
					new GLL_Parser_CLI(),
					new GLL_Parser_PHP_Wasm(),
				)
			);

			self::$backends = array_values(
				array_filter(
					is_array( $backends ) ? $backends : array(),
					static function ( $backend ) {
						return $backend instanceof GLL_Parser_Backend;
					}
				)
			);
		}

		return self::$backends;
	}

	/**
	 * Discard the cached backend list and detection result.
	 *
	 * For tests and for the settings screen's "check again": both change the
	 * answer under a process that has already computed it.
	 */
	public static function reset() {
		self::$backends = null;
		delete_option( self::DETECTED_OPTION );
	}

	/**
	 * Whether an administrator has left server-side parsing on.
	 *
	 * Defaults to on: a host that can parse server-side should do so without
	 * being asked, and a host that cannot never gets this far because detection
	 * finds no backend.
	 *
	 * @return bool True when server-side parsing may run.
	 */
	public static function is_enabled() {
		$enabled = get_option( self::ENABLED_OPTION, '1' );

		/**
		 * Filter whether server-side parsing is allowed to run.
		 *
		 * @param bool $enabled Whether it is enabled.
		 */
		return (bool) apply_filters( 'gll_info_server_parse_enabled', '1' === (string) $enabled );
	}

	/**
	 * The backend to use, or null when there is none.
	 *
	 * @param bool $force Re-probe rather than trusting the stored result.
	 * @return GLL_Parser_Backend|null Active backend.
	 */
	public static function backend( $force = false ) {
		if ( ! self::is_enabled() ) {
			return null;
		}

		/**
		 * Filter the backend ID to use, skipping detection entirely.
		 *
		 * Return an empty string to disable server-side parsing, or one of
		 * 'node', 'cli', 'phpwasm' to pin a backend.
		 *
		 * @param string|null $id Backend ID, or null to detect.
		 */
		$pinned = apply_filters( 'gll_info_parser_backend', null );

		if ( null !== $pinned ) {
			return self::by_id( (string) $pinned );
		}

		return self::by_id( self::detect( $force ) );
	}

	/**
	 * The ID of the usable backend, probing when necessary.
	 *
	 * @param bool $force Re-probe rather than trusting the stored result.
	 * @return string Backend ID, or an empty string when there is none.
	 */
	public static function detect( $force = false ) {
		$stored = get_option( self::DETECTED_OPTION, false );

		if ( ! $force
			&& is_array( $stored )
			&& isset( $stored['id'], $stored['plugin_version'] )
			&& GLL_INFO_VERSION === $stored['plugin_version'] ) {
			return (string) $stored['id'];
		}

		$id = '';
		foreach ( self::backends() as $backend ) {
			if ( $backend->is_available() ) {
				$id = $backend->id();
				break;
			}
		}

		update_option(
			self::DETECTED_OPTION,
			array(
				'id'             => $id,
				'plugin_version' => GLL_INFO_VERSION,
				'checked'        => time(),
			),
			false
		);

		return $id;
	}

	/**
	 * A backend by ID.
	 *
	 * @param string $id Backend ID.
	 * @return GLL_Parser_Backend|null The backend, or null.
	 */
	public static function by_id( $id ) {
		if ( '' === $id ) {
			return null;
		}

		foreach ( self::backends() as $backend ) {
			if ( $backend->id() === $id ) {
				return $backend;
			}
		}

		return null;
	}

	/**
	 * Parse an attachment and return its display subset.
	 *
	 * Every failure — no backend, a file too large, an unreadable file, a parse
	 * error — returns a `WP_Error` and leaves the cache alone. A cold cache is a
	 * state the frontend already handles by parsing in the browser, so nothing
	 * here is worth escalating.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|WP_Error Display subset, or an error.
	 */
	public static function subset_for_attachment( $attachment_id ) {
		return self::subset_for_path( get_attached_file( $attachment_id ) );
	}

	/**
	 * Parse a file already on this server and return its display subset.
	 *
	 * Split out of `subset_for_attachment()` because path resolution and parsing
	 * are separate concerns, and because the external-file proxy has a downloaded
	 * temp file rather than an attachment: it can warm the URL cache from bytes it
	 * has already paid for, on the minority of hosts that have a backend at all.
	 *
	 * The path never comes from request input. `GLL_Remote` passes a
	 * `wp_tempnam()` file it created itself, and the attachment path comes from
	 * `get_attached_file()`.
	 *
	 * @param string $path Absolute path to a readable GLL file.
	 * @return array|WP_Error Display subset, or an error.
	 */
	public static function subset_for_path( $path ) {
		$backend = self::backend();

		if ( ! $backend ) {
			return new WP_Error(
				'gll_info_no_backend',
				__( 'No server-side GLL parser is available.', 'gll-info' )
			);
		}

		if ( ! $path || ! is_file( $path ) || ! is_readable( $path ) ) {
			return new WP_Error(
				'gll_info_unreadable',
				__( 'The GLL file could not be read.', 'gll-info' )
			);
		}

		$size = filesize( $path );

		/**
		 * Filter the largest file a backend will attempt, in bytes.
		 *
		 * @param int                $max_bytes Ceiling in bytes.
		 * @param GLL_Parser_Backend $backend   The backend that would run.
		 */
		$max_bytes = (int) apply_filters(
			'gll_info_parser_max_bytes',
			$backend->max_bytes(),
			$backend
		);

		if ( $size && $size > $max_bytes ) {
			return new WP_Error(
				'gll_info_too_large',
				__( 'The GLL file is too large to parse on the server.', 'gll-info' )
			);
		}

		$raw = $backend->parse( $path );

		if ( is_wp_error( $raw ) ) {
			return $raw;
		}

		$subset = GLL_Subset::from_raw( $raw );

		if ( ! is_array( $subset ) ) {
			return new WP_Error(
				'gll_info_no_subset',
				__( 'The parsed GLL data could not be reduced.', 'gll-info' )
			);
		}

		return $subset;
	}

	/**
	 * Parse an attachment and store the result.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool Whether a subset was cached.
	 */
	public static function warm( $attachment_id ) {
		if ( ! GLL_Cache::is_gll( $attachment_id ) ) {
			return false;
		}

		$backend = self::backend();
		$subset  = self::subset_for_attachment( $attachment_id );

		if ( is_wp_error( $subset ) ) {
			self::log( $attachment_id, $subset );

			return false;
		}

		return GLL_Cache::set( $attachment_id, $subset, $backend ? $backend->id() : 'browser' );
	}

	/**
	 * Record why a server-side parse did not produce a cache.
	 *
	 * Only when `WP_DEBUG` is on: on a host with no backend this would otherwise
	 * write a line for every GLL upload, describing a configuration that is
	 * perfectly fine.
	 *
	 * @param int      $attachment_id Attachment ID.
	 * @param WP_Error $error         What went wrong.
	 */
	private static function log( $attachment_id, $error ) {
		if ( ! defined( 'WP_DEBUG' ) || ! WP_DEBUG ) {
			return;
		}

		if ( 'gll_info_no_backend' === $error->get_error_code() ) {
			return;
		}

		error_log( // phpcs:ignore WordPress.PHP.DevelopmentFunctions.error_log_error_log
			sprintf(
				'gll-info: could not cache attachment %d: %s',
				(int) $attachment_id,
				$error->get_error_message()
			)
		);
	}
}
