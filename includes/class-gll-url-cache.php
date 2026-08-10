<?php
/**
 * Store and retrieve the cached display subset of an EXTERNAL GLL file.
 *
 * The sibling of `GLL_Cache`, for files that live on someone else's server. The
 * two are deliberately not one class with two storage strategies: the storage,
 * the invalidation and the trust model all differ, and the only genuinely shared
 * part is `GLL_Cache::validate()`, which is already static and file-independent
 * and is reused verbatim below. A hierarchy would buy indirection and cost the
 * careful, specific argument in `GLL_Cache`'s docblock, which would have to be
 * generalised into something that no longer says anything.
 *
 * THERE IS NO FINGERPRINT HERE, AND THERE CANNOT BE ONE. That is the load-bearing
 * weakness of this tier and it is stated first rather than buried. `GLL_Cache`
 * derives its fingerprint from bytes on disk, which is what makes its
 * invalidation real: a replaced file stops matching its own cache with no hook
 * involved. A remote file has no bytes on this server, and establishing a
 * fingerprint would mean fetching it — which is exactly what the public read
 * route must never do. So `hash`, `length` and `etag` are recorded for
 * diagnostics and for the editor's own "is this still what I parsed?" question,
 * and are NEVER used to decide whether to serve. Freshness here is a timer:
 *
 *     An external file that changes silently is served stale until the TTL
 *     expires. Twelve hours, by default.
 *
 * Storage is transients plus one non-autoloaded index option. Transients give the
 * TTL for free and core's daily `delete_expired_transients()` does most of the
 * cleanup; the index exists because transients alone cannot be counted, capped or
 * listed, and all three are needed — an author can point blocks at arbitrarily
 * many URLs, and the settings screen has to be able to say how many.
 *
 * On a site with a persistent object cache a transient can vanish at any moment
 * to a flush or an eviction. That is fine, and it is fine for a stated reason: a
 * cold cache is a supported state, and every consumer falls back to parsing.
 *
 * The key is an HMAC under `wp_salt()` rather than a bare hash. The browser never
 * computes it — the server derives it on both the read and the write path, from
 * one function, which is what makes a normalisation mismatch between reader and
 * writer structurally impossible — so salting costs nothing and stops a key from
 * being precomputed offline for a wordlist of guessable CDN URLs.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Reads and writes cached subsets of external GLL files.
 */
class GLL_URL_Cache {

	/**
	 * Prefix of the transient holding one entry.
	 *
	 * Forty hex characters of the key follow it, which keeps the option name well
	 * inside the 191-character column once `_transient_timeout_` is prepended.
	 * The full key is stored inside the envelope so a truncation collision is
	 * detectable rather than silent.
	 *
	 * @var string
	 */
	const PREFIX = 'gll_url_';

	/**
	 * Option holding the index of live entries.
	 *
	 * @var string
	 */
	const INDEX_OPTION = 'gll_info_url_cache_index';

	/**
	 * How long an entry may be served, in seconds.
	 *
	 * Twelve hours bounds staleness to within a working day while still absorbing
	 * a traffic spike. There is no better number available: with no fingerprint,
	 * this is the only thing standing between a re-uploaded file and a page that
	 * describes the old one.
	 *
	 * @var int
	 */
	const TTL = 43200;

	/**
	 * Most entries the site will hold.
	 *
	 * @var int
	 */
	const MAX_ENTRIES = 100;

	/**
	 * Largest subset accepted, in bytes of encoded JSON.
	 *
	 * Tighter than `GLL_Cache::MAX_BYTES` on purpose. Attachment entries are
	 * bounded by the number of GLL files an administrator has uploaded; these are
	 * bounded only by how many URLs an author can type, so the worst case matters
	 * more. Measured subsets run to about 10 KB, so 128 KB is still an order of
	 * magnitude of headroom.
	 *
	 * @var int
	 */
	const MAX_BYTES = 131072;

	/**
	 * Writes allowed per user per hour.
	 *
	 * @var int
	 */
	const RATE_LIMIT = 60;

	/**
	 * Resolved subsets for this request, keyed by cache key.
	 *
	 * @var array
	 */
	private static $memo = array();

	/**
	 * Canonical form of an external GLL URL.
	 *
	 * Scheme and host are lowercased, a default port and the fragment are dropped,
	 * and the path and query keep their case — presigned S3 URLs and case-sensitive
	 * object stores are the normal case for this feature, not the exception.
	 *
	 * Two different signed URLs for the same object therefore get two entries.
	 * That is correct rather than wasteful: a different signed URL genuinely may
	 * be different bytes, and the TTL and the entry cap bound the resulting
	 * garbage.
	 *
	 * @param string $url Raw URL.
	 * @return string Normalized URL, or '' when it is not one this tier accepts.
	 */
	public static function normalise( $url ) {
		$url = trim( (string) $url );

		// Before `esc_url_raw()`, which helpfully prepends `http://` to anything
		// without a scheme. That help is unwanted here: `speaker.gll` would
		// silently become a key for the host `speaker.gll`, and an entry keyed on
		// something the author never typed is worse than no entry.
		if ( ! preg_match( '#^[a-z][a-z0-9+.-]*://#i', $url ) ) {
			return '';
		}

		$url = esc_url_raw( $url );

		if ( '' === $url ) {
			return '';
		}

		$parts = wp_parse_url( $url );

		if ( empty( $parts['scheme'] ) || empty( $parts['host'] ) ) {
			return '';
		}

		$scheme = strtolower( $parts['scheme'] );

		if ( ! in_array( $scheme, array( 'http', 'https' ), true ) ) {
			return '';
		}

		// Credentials in a URL would be published in the page source; refuse to
		// key on one at all, so such a URL simply never caches.
		if ( isset( $parts['user'] ) || isset( $parts['pass'] ) ) {
			return '';
		}

		$port = '';
		if ( isset( $parts['port'] ) && ! self::is_default_port( $scheme, (int) $parts['port'] ) ) {
			$port = ':' . (int) $parts['port'];
		}

		return $scheme . '://' . strtolower( $parts['host'] ) . $port
			. ( isset( $parts['path'] ) ? $parts['path'] : '/' )
			. ( isset( $parts['query'] ) ? '?' . $parts['query'] : '' );
	}

	/**
	 * Whether a port is the default for its scheme.
	 *
	 * @param string $scheme URL scheme.
	 * @param int    $port   Port number.
	 * @return bool True when the port may be dropped.
	 */
	private static function is_default_port( $scheme, $port ) {
		return ( 'http' === $scheme && 80 === $port ) || ( 'https' === $scheme && 443 === $port );
	}

	/**
	 * Storage key for a URL.
	 *
	 * @param string $url Raw URL.
	 * @return string 64-character hex key, or '' when the URL is not cacheable.
	 */
	public static function key( $url ) {
		$normalised = self::normalise( $url );

		if ( '' === $normalised ) {
			return '';
		}

		return hash_hmac( 'sha256', $normalised, wp_salt( 'gll_url_cache' ) );
	}

	/**
	 * Transient name for a key.
	 *
	 * @param string $key Storage key.
	 * @return string Transient name.
	 */
	private static function transient( $key ) {
		return self::PREFIX . substr( $key, 0, 40 );
	}

	/**
	 * The cached subset for an external URL.
	 *
	 * Returns false for anything that cannot be trusted: no entry, an expired one,
	 * a shape older than this plugin, or an envelope whose stored key does not
	 * match the one asked for. Every one of those is a cold cache to the caller,
	 * and a cold cache is something the frontend already handles by parsing.
	 *
	 * @param string $url External URL.
	 * @return array|false The subset, or false.
	 */
	public static function get( $url ) {
		$key = self::key( $url );

		if ( '' === $key ) {
			return false;
		}

		if ( array_key_exists( $key, self::$memo ) ) {
			return self::$memo[ $key ];
		}

		self::$memo[ $key ] = self::resolve( $key );

		return self::$memo[ $key ];
	}

	/**
	 * Work out what `get()` should return, ignoring the memo.
	 *
	 * @param string $key Storage key.
	 * @return array|false The subset, or false.
	 */
	private static function resolve( $key ) {
		$envelope = get_transient( self::transient( $key ) );

		if ( ! is_array( $envelope ) || ! isset( $envelope['data'] ) || ! is_array( $envelope['data'] ) ) {
			return false;
		}

		// The transient name is a truncation of the key, so two URLs could in
		// principle land on one name. Comparing the full key stored inside the
		// envelope turns that from a silently wrong answer into a cold cache.
		if ( ! isset( $envelope['key'] ) || ! hash_equals( (string) $envelope['key'], $key ) ) {
			return false;
		}

		if ( ! isset( $envelope['version'] ) || GLL_Subset::VERSION !== (int) $envelope['version'] ) {
			return false;
		}

		return $envelope['data'];
	}

	/**
	 * The stored envelope, without the freshness checks `get()` applies.
	 *
	 * @param string $url External URL.
	 * @return array|false The envelope, or false when nothing is stored.
	 */
	public static function get_envelope( $url ) {
		$key = self::key( $url );

		if ( '' === $key ) {
			return false;
		}

		$envelope = get_transient( self::transient( $key ) );

		return is_array( $envelope ) ? $envelope : false;
	}

	/**
	 * Store a subset against an external URL.
	 *
	 * @param string $url      External URL.
	 * @param array  $subset   Display subset.
	 * @param string $producer Which parser produced it.
	 * @param array  $meta     Optional advisory fields: `hash`, `length`, `etag`, `author`.
	 * @return bool Whether it was stored.
	 */
	public static function set( $url, $subset, $producer = 'browser', $meta = array() ) {
		$key        = self::key( $url );
		$normalised = self::normalise( $url );

		if ( '' === $key || ! self::validate( $subset ) ) {
			return false;
		}

		unset( self::$memo[ $key ] );

		$envelope = array(
			'version'   => GLL_Subset::VERSION,
			'key'       => $key,
			'url'       => $normalised,
			// Advisory only. See the class docblock: nothing below ever decides
			// whether to serve on the strength of these.
			'hash'      => isset( $meta['hash'] ) ? (string) $meta['hash'] : '',
			'length'    => isset( $meta['length'] ) ? (int) $meta['length'] : 0,
			'etag'      => isset( $meta['etag'] ) ? (string) $meta['etag'] : '',
			'author'    => isset( $meta['author'] ) ? (int) $meta['author'] : get_current_user_id(),
			'generated' => time(),
			'producer'  => self::producer( $producer ),
			'data'      => $subset,
		);

		$stored = set_transient( self::transient( $key ), $envelope, self::ttl() );

		if ( $stored ) {
			self::index_put( $key, $envelope );
		}

		return (bool) $stored;
	}

	/**
	 * Discard one entry.
	 *
	 * @param string $url External URL.
	 * @return bool Whether anything was removed.
	 */
	public static function delete( $url ) {
		$key = self::key( $url );

		if ( '' === $key ) {
			return false;
		}

		unset( self::$memo[ $key ] );
		self::index_forget( array( $key ) );

		return (bool) delete_transient( self::transient( $key ) );
	}

	/**
	 * Whether a subset may be stored in this tier.
	 *
	 * Delegates the structural work to `GLL_Cache::validate()` — depth, value
	 * types, list and string sizes, shape version — deliberately, so the two tiers
	 * cannot drift on what a subset is allowed to look like. Only the size ceiling
	 * differs, and it is applied here because this tier's worst case is bounded by
	 * how many URLs an author can type rather than by how many files an
	 * administrator has uploaded.
	 *
	 * @param mixed $subset Candidate subset.
	 * @return bool Whether it may be stored.
	 */
	public static function validate( $subset ) {
		if ( ! GLL_Cache::validate( $subset ) ) {
			return false;
		}

		$encoded = wp_json_encode( $subset );

		return is_string( $encoded ) && strlen( $encoded ) <= self::MAX_BYTES;
	}

	/**
	 * How long a new entry may live.
	 *
	 * @return int Seconds.
	 */
	public static function ttl() {
		/**
		 * Filter how long a cached external subset may be served.
		 *
		 * With no fingerprint available this is the only bound on staleness, so a
		 * site that cares about upstream changes lands here.
		 *
		 * @param int $ttl Lifetime in seconds.
		 */
		$ttl = (int) apply_filters( 'gll_info_url_cache_ttl', self::TTL );

		return $ttl > 0 ? $ttl : self::TTL;
	}

	/**
	 * Most entries this site will hold.
	 *
	 * @return int Entry cap.
	 */
	public static function max_entries() {
		/**
		 * Filter how many external files may be cached at once.
		 *
		 * @param int $max Entry cap.
		 */
		$max = (int) apply_filters( 'gll_info_url_cache_max_entries', self::MAX_ENTRIES );

		return $max > 0 ? $max : self::MAX_ENTRIES;
	}

	/**
	 * The live entries, newest first.
	 *
	 * @return array Key => `array( 'url', 'generated', 'bytes' )`.
	 */
	public static function index() {
		$index = get_option( self::INDEX_OPTION, array() );

		return is_array( $index ) ? $index : array();
	}

	/**
	 * Record an entry in the index and prune what no longer belongs there.
	 *
	 * @param string $key      Storage key.
	 * @param array  $envelope Stored envelope.
	 */
	private static function index_put( $key, $envelope ) {
		$index = self::index();

		// Ordered by a counter rather than by `generated`, because several
		// entries written in one second share a timestamp and eviction would
		// then drop an arbitrary one of them. The counter also survives a clock
		// that moves backwards.
		$sequence = 0;
		foreach ( $index as $entry ) {
			$sequence = max( $sequence, isset( $entry['seq'] ) ? (int) $entry['seq'] : 0 );
		}

		$index[ $key ] = array(
			'url'       => $envelope['url'],
			'generated' => $envelope['generated'],
			'seq'       => $sequence + 1,
			'bytes'     => strlen( (string) wp_json_encode( $envelope['data'] ) ),
		);

		// Newest first, so the tail is what gets dropped.
		uasort(
			$index,
			static function ( $a, $b ) {
				return (int) $b['seq'] <=> (int) $a['seq'];
			}
		);

		$max = self::max_entries();

		if ( count( $index ) > $max ) {
			$evicted = array_slice( $index, $max, null, true );

			foreach ( array_keys( $evicted ) as $stale ) {
				delete_transient( self::transient( $stale ) );
				unset( self::$memo[ $stale ] );
			}

			$index = array_slice( $index, 0, $max, true );
		}

		update_option( self::INDEX_OPTION, $index, false );
	}

	/**
	 * Drop rows from the index.
	 *
	 * A row lost to a concurrent write leaves an orphaned transient, which expires
	 * on its own. That is cheaper than locking and the failure mode is a cache
	 * entry nobody can see rather than a wrong answer.
	 *
	 * @param string[] $keys Storage keys.
	 */
	private static function index_forget( $keys ) {
		$index   = self::index();
		$changed = false;

		foreach ( $keys as $key ) {
			if ( isset( $index[ $key ] ) ) {
				unset( $index[ $key ] );
				$changed = true;
			}
		}

		if ( $changed ) {
			update_option( self::INDEX_OPTION, $index, false );
		}
	}

	/**
	 * Discard every entry.
	 *
	 * @return int How many entries were removed.
	 */
	public static function purge_all() {
		$index = self::index();

		foreach ( array_keys( $index ) as $key ) {
			delete_transient( self::transient( $key ) );
		}

		self::$memo = array();
		delete_option( self::INDEX_OPTION );

		return count( $index );
	}

	/**
	 * Whether a user may write another entry now.
	 *
	 * Not a defence against a determined author — they own an account. It is here
	 * so that using this tier as bulk storage is tedious and visible rather than
	 * free.
	 *
	 * @param int $user_id User ID.
	 * @return bool True when the write may proceed.
	 */
	public static function rate_ok( $user_id ) {
		$user_id = (int) $user_id;

		if ( $user_id <= 0 ) {
			return false;
		}

		/**
		 * Filter how many external subsets one user may store per hour.
		 *
		 * @param int $limit Writes per hour.
		 */
		$limit = (int) apply_filters( 'gll_info_url_cache_rate_limit', self::RATE_LIMIT );
		$name  = 'gll_url_write_' . $user_id;
		$count = (int) get_transient( $name );

		if ( $count >= $limit ) {
			return false;
		}

		set_transient( $name, $count + 1, HOUR_IN_SECONDS );

		return true;
	}

	/**
	 * Forget everything resolved during this request.
	 *
	 * Only tests need this.
	 */
	public static function flush_memo() {
		self::$memo = array();
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
}
