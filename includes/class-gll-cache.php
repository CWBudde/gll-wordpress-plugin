<?php
/**
 * Store and retrieve the cached display subset of a GLL attachment.
 *
 * Storage is the `_gll_metadata` post meta on the attachment itself, whose
 * getter and setter have existed in `GLL_Media` since Phase 1 with no production
 * writer. Post meta wins over transients here for one reason above the others:
 * WordPress cascades postmeta when the attachment is deleted, so "invalidate on
 * attachment delete" needs no hook and cannot be missed. It also survives an
 * object-cache flush, which a cache that exists to avoid a 4.2 MB download and a
 * multi-second parse ought to do.
 *
 * The stored value is an envelope, not the bare subset:
 *
 *     array(
 *       'version'   => GLL_Subset::VERSION,
 *       'hash'      => md5 of the file the subset was built from,
 *       'generated' => unix timestamp,
 *       'producer'  => 'node' | 'cli' | 'phpwasm' | 'browser',
 *       'data'      => the subset,
 *     )
 *
 * THE HASH IS COMPUTED HERE, FROM THE FILE ON DISK, and never accepted from the
 * caller. That is what makes invalidation real rather than advisory: a replaced
 * file stops matching its own cache with no hook involved, and a browser that
 * POSTs a subset cannot claim it parsed bytes it did not. `get()` re-hashes and
 * refuses to serve a payload whose file has moved on.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads and writes the cached display subset.
 */
class GLL_Cache {

	/**
	 * Meta key holding the envelope.
	 *
	 * @var string
	 */
	const META_KEY = '_gll_metadata';

	/**
	 * Largest subset accepted, in bytes of encoded JSON.
	 *
	 * The subset of the largest file in the reference corpus is a small fraction
	 * of this; the cap exists so that a caller cannot use `wp_postmeta` as a
	 * dumping ground, not because a legitimate payload is expected to approach
	 * it. A file whose subset genuinely exceeds this stays uncached, and the
	 * frontend falls back to parsing — slower, but correct.
	 *
	 * @var int
	 */
	const MAX_BYTES = 524288;

	/**
	 * Deepest structure accepted.
	 *
	 * The real subset nests eight levels at its deepest (a filter group's bank's
	 * filter's IIR parameters); the allowance is generous enough for growth and
	 * far short of anything that would trouble a recursive walk.
	 *
	 * @var int
	 */
	const MAX_DEPTH = 16;

	/**
	 * Longest string accepted inside a subset.
	 *
	 * `GenSystem.InfoText` is free-form prose in a real file, so this cannot be
	 * tight.
	 *
	 * @var int
	 */
	const MAX_STRING = 65536;

	/**
	 * Most entries accepted in any one list.
	 *
	 * @var int
	 */
	const MAX_ITEMS = 5000;

	/**
	 * The cached subset for an attachment.
	 *
	 * Returns false rather than a stale payload whenever the cache cannot be
	 * trusted: wrong mime type, a subset shape older than this plugin, or a file
	 * whose contents no longer hash to what was cached. Every one of those is a
	 * cold cache to the caller, and a cold cache is something the frontend
	 * already handles by parsing.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|false The subset, or false when there is no usable cache.
	 */
	public static function get( $attachment_id ) {
		if ( ! self::is_gll( $attachment_id ) ) {
			return false;
		}

		$envelope = get_post_meta( $attachment_id, self::META_KEY, true );

		if ( ! is_array( $envelope ) || ! isset( $envelope['data'] ) || ! is_array( $envelope['data'] ) ) {
			return false;
		}

		if ( ! isset( $envelope['version'] ) || GLL_Subset::VERSION !== (int) $envelope['version'] ) {
			return false;
		}

		$hash = self::file_hash( $attachment_id );
		if ( ! $hash || ! isset( $envelope['hash'] ) || ! hash_equals( (string) $envelope['hash'], $hash ) ) {
			return false;
		}

		return $envelope['data'];
	}

	/**
	 * The stored envelope, without the freshness checks `get()` applies.
	 *
	 * For the settings screen and for tests, which want to see what is there
	 * rather than what is servable.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|false The envelope, or false when nothing is stored.
	 */
	public static function get_envelope( $attachment_id ) {
		$envelope = get_post_meta( $attachment_id, self::META_KEY, true );

		return is_array( $envelope ) ? $envelope : false;
	}

	/**
	 * Store a subset for an attachment.
	 *
	 * @param int    $attachment_id Attachment ID.
	 * @param array  $subset        Display subset, as `GLL_Subset::from_raw()` builds.
	 * @param string $producer      Which parser produced it.
	 * @return bool Whether the subset was stored.
	 */
	public static function set( $attachment_id, $subset, $producer = 'browser' ) {
		if ( ! self::is_gll( $attachment_id ) || ! self::validate( $subset ) ) {
			return false;
		}

		$hash = self::file_hash( $attachment_id );
		if ( ! $hash ) {
			return false;
		}

		$envelope = array(
			'version'   => GLL_Subset::VERSION,
			'hash'      => $hash,
			'generated' => time(),
			'producer'  => self::producer( $producer ),
			'data'      => $subset,
		);

		// `update_post_meta()` returns false when the stored value is already
		// identical, which is a successful no-op rather than a failure.
		$stored = GLL_Media::save_gll_metadata( $attachment_id, $envelope );

		return false !== $stored || self::get_envelope( $attachment_id ) === $envelope;
	}

	/**
	 * Discard the cached subset for an attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool Whether anything was removed.
	 */
	public static function delete( $attachment_id ) {
		return delete_post_meta( $attachment_id, self::META_KEY );
	}

	/**
	 * Whether an attachment is a GLL file.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return bool True for `application/x-gll` attachments.
	 */
	public static function is_gll( $attachment_id ) {
		$attachment_id = (int) $attachment_id;

		if ( $attachment_id <= 0 || 'attachment' !== get_post_type( $attachment_id ) ) {
			return false;
		}

		return 'application/x-gll' === get_post_mime_type( $attachment_id );
	}

	/**
	 * Hash of the file backing an attachment.
	 *
	 * MD5 rather than a cryptographic digest on purpose: this answers "are these
	 * the same bytes as last time", not "did someone forge these bytes", and it
	 * is the one hash every supported PHP has without an extension. The file is
	 * read from disk each time `get()` runs, which costs a few milliseconds even
	 * for the largest corpus file and is the price of an invalidation rule that
	 * cannot be forgotten.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return string|false Hash, or false when the file is unreadable.
	 */
	public static function file_hash( $attachment_id ) {
		$path = get_attached_file( $attachment_id );

		if ( ! $path || ! is_readable( $path ) || ! is_file( $path ) ) {
			return false;
		}

		$hash = md5_file( $path );

		return $hash ? $hash : false;
	}

	/**
	 * Normalize a producer name to one of the known values.
	 *
	 * @param string $producer Raw producer name.
	 * @return string Known producer name, defaulting to 'browser'.
	 */
	private static function producer( $producer ) {
		$known = array( 'node', 'cli', 'phpwasm', 'browser' );

		return in_array( $producer, $known, true ) ? $producer : 'browser';
	}

	/**
	 * Whether a subset is safe and plausible enough to store.
	 *
	 * This is a STRUCTURAL check, not a schema check: depth, value types, string
	 * and list sizes, encoded byte count, and a matching shape version. It is
	 * deliberately not a field-by-field whitelist — the subset's shape is defined
	 * by `src/shared/gll-subset.ts` and mirrored once already in
	 * `GLL_Subset::from_raw()`, and a third copy here would be a third thing to
	 * keep in step, drifting into rejecting payloads the builder legitimately
	 * produces.
	 *
	 * What it is actually defending against is a caller using `wp_postmeta` as
	 * storage: unbounded nesting, megabyte strings, objects where scalars belong.
	 * Rendering safety is separate and already handled — every view script escapes
	 * these values through `escapeHtml()` before they reach `innerHTML`.
	 *
	 * @param mixed $subset Candidate subset.
	 * @return bool Whether it may be stored.
	 */
	public static function validate( $subset ) {
		if ( ! is_array( $subset ) || ! isset( $subset['Version'] ) ) {
			return false;
		}

		if ( GLL_Subset::VERSION !== (int) $subset['Version'] ) {
			return false;
		}

		if ( ! isset( $subset['Database'] ) || ! is_array( $subset['Database'] ) ) {
			return false;
		}

		if ( ! self::is_plain( $subset, 0 ) ) {
			return false;
		}

		$encoded = wp_json_encode( $subset );

		return is_string( $encoded ) && strlen( $encoded ) <= self::MAX_BYTES;
	}

	/**
	 * Whether a value is a bounded tree of scalars and arrays.
	 *
	 * @param mixed $value Value to check.
	 * @param int   $depth Current depth.
	 * @return bool Whether the value is acceptable.
	 */
	private static function is_plain( $value, $depth ) {
		if ( $depth > self::MAX_DEPTH ) {
			return false;
		}

		if ( null === $value || is_bool( $value ) || is_int( $value ) ) {
			return true;
		}

		if ( is_float( $value ) ) {
			// NAN and INF survive a decode from some encoders and do not
			// survive re-encoding, which would corrupt the stored payload.
			return is_finite( $value );
		}

		if ( is_string( $value ) ) {
			return strlen( $value ) <= self::MAX_STRING;
		}

		if ( ! is_array( $value ) ) {
			// Objects, resources and closures have no business in a payload
			// that arrived as JSON.
			return false;
		}

		if ( count( $value ) > self::MAX_ITEMS ) {
			return false;
		}

		foreach ( $value as $key => $member ) {
			if ( is_string( $key ) && ! preg_match( '/^[A-Za-z_][A-Za-z0-9_]{0,63}$/', $key ) ) {
				return false;
			}

			if ( ! self::is_plain( $member, $depth + 1 ) ) {
				return false;
			}
		}

		return true;
	}
}
