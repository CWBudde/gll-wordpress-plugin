<?php
/**
 * Tests for the cache tier that holds summaries of files on other servers.
 *
 * The key derivation gets the most attention here, because it is the whole
 * integrity story of this tier. Reader and writer both go through
 * `GLL_URL_Cache::key()`, so anything the key normalises away is a pair of
 * addresses the two will agree are one entry — and anything it keeps is a pair
 * they will agree are two. Getting that wrong in either direction is how a
 * URL-keyed cache serves one file's summary for another file.
 *
 * @package
 */

/**
 * Tests for GLL_URL_Cache.
 */
class GLL_URL_Cache_Test extends WP_UnitTestCase {

	/**
	 * A representative address.
	 *
	 * @var string
	 */
	const URL = 'https://cdn.example/speakers/CoRay4.gll';

	/**
	 * Start every test with an empty store and no memoized answers.
	 */
	public function set_up() {
		parent::set_up();
		GLL_URL_Cache::purge_all();
		GLL_URL_Cache::flush_memo();
	}

	/**
	 * Leave nothing behind.
	 */
	public function tear_down() {
		GLL_URL_Cache::purge_all();
		GLL_URL_Cache::flush_memo();
		parent::tear_down();
	}

	/**
	 * A minimal but valid subset.
	 *
	 * @param string $label System label, so two subsets can be told apart.
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
	 * The same address always produces the same key.
	 */
	public function test_the_key_is_stable() {
		$this->assertSame( GLL_URL_Cache::key( self::URL ), GLL_URL_Cache::key( self::URL ) );
		$this->assertMatchesRegularExpression( '/^[a-f0-9]{64}$/', GLL_URL_Cache::key( self::URL ) );
	}

	/**
	 * Differences a server never sees are not differences.
	 */
	public function test_the_key_ignores_the_fragment_and_a_default_port() {
		$key = GLL_URL_Cache::key( self::URL );

		$this->assertSame( $key, GLL_URL_Cache::key( self::URL . '#page=2' ) );
		$this->assertSame(
			$key,
			GLL_URL_Cache::key( 'https://cdn.example:443/speakers/CoRay4.gll' )
		);
		$this->assertSame( $key, GLL_URL_Cache::key( '  ' . self::URL . '  ' ) );
	}

	/**
	 * Scheme and host are case-insensitive; the path is not.
	 *
	 * Object stores are case-sensitive, and treating two differently-cased paths
	 * as one entry would serve the wrong file.
	 */
	public function test_the_key_lowercases_only_what_is_case_insensitive() {
		$this->assertSame(
			GLL_URL_Cache::key( self::URL ),
			GLL_URL_Cache::key( 'HTTPS://CDN.EXAMPLE/speakers/CoRay4.gll' )
		);

		$this->assertNotSame(
			GLL_URL_Cache::key( self::URL ),
			GLL_URL_Cache::key( 'https://cdn.example/speakers/coray4.gll' )
		);
	}

	/**
	 * Two signed URLs for one object are two entries.
	 *
	 * Deliberate: a different signature may genuinely be different bytes, and the
	 * lifetime and the entry cap bound the resulting duplication.
	 */
	public function test_the_key_distinguishes_two_query_strings() {
		$this->assertNotSame(
			GLL_URL_Cache::key( self::URL . '?sig=aaa' ),
			GLL_URL_Cache::key( self::URL . '?sig=bbb' )
		);
	}

	/**
	 * Addresses this tier will not key on at all.
	 */
	public function test_unusable_addresses_have_no_key() {
		$this->assertSame( '', GLL_URL_Cache::key( '' ) );
		$this->assertSame( '', GLL_URL_Cache::key( 'speaker.gll' ) );
		$this->assertSame( '', GLL_URL_Cache::key( 'ftp://cdn.example/a.gll' ) );
		$this->assertSame( '', GLL_URL_Cache::key( 'https://user:pw@cdn.example/a.gll' ) );
	}

	/**
	 * A key is worthless on another site.
	 *
	 * The HMAC is salted, so a key cannot be precomputed offline from a list of
	 * guessable addresses.
	 */
	public function test_the_key_is_site_specific() {
		$before = GLL_URL_Cache::key( self::URL );

		add_filter( 'salt', array( $this, 'filter_salt' ), 10, 2 );
		$after = GLL_URL_Cache::key( self::URL );
		remove_filter( 'salt', array( $this, 'filter_salt' ), 10 );

		$this->assertNotSame( $before, $after );
	}

	/**
	 * Replace the salt used for the cache key.
	 *
	 * @param string $salt   Current salt.
	 * @param string $scheme Salt scheme.
	 * @return string Salt.
	 */
	public function filter_salt( $salt, $scheme ) {
		return 'gll_url_cache' === $scheme ? 'a-different-salt' : $salt;
	}

	/**
	 * The round trip.
	 */
	public function test_a_stored_subset_reads_back() {
		$this->assertTrue( GLL_URL_Cache::set( self::URL, $this->subset( 'Stored' ) ) );
		GLL_URL_Cache::flush_memo();

		$read = GLL_URL_Cache::get( self::URL );

		$this->assertIsArray( $read );
		$this->assertSame( 'Stored', $read['GenSystem']['Label'] );
	}

	/**
	 * The digest is recorded and is never a condition of serving.
	 *
	 * Stated as a test because it is the deliberate weakness of this tier: the
	 * server never saw the bytes, so it cannot check what the browser claims.
	 */
	public function test_the_digest_is_recorded_but_not_enforced() {
		GLL_URL_Cache::set(
			self::URL,
			$this->subset(),
			'browser',
			array(
				'hash'   => str_repeat( 'a', 64 ),
				'length' => 4096,
			)
		);
		GLL_URL_Cache::flush_memo();

		$envelope = GLL_URL_Cache::get_envelope( self::URL );

		$this->assertSame( str_repeat( 'a', 64 ), $envelope['hash'] );
		$this->assertSame( 4096, $envelope['length'] );
		$this->assertIsArray( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * The structural guard is the attachment tier's, reused.
	 */
	public function test_an_invalid_subset_is_refused() {
		$this->assertFalse( GLL_URL_Cache::set( self::URL, 'not a subset' ) );
		$this->assertFalse( GLL_URL_Cache::set( self::URL, array( 'Version' => 999 ) ) );
		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * The size ceiling here is tighter than the attachment tier's.
	 */
	public function test_an_oversized_subset_is_refused() {
		$subset                       = $this->subset();
		$subset['GenSystem']['Label'] = str_repeat( 'x', GLL_URL_Cache::MAX_BYTES );

		$this->assertFalse( GLL_URL_Cache::set( self::URL, $subset ) );
	}

	/**
	 * A shape from an older plugin reads as cold.
	 */
	public function test_a_version_bump_reads_as_cold() {
		GLL_URL_Cache::set( self::URL, $this->subset() );
		GLL_URL_Cache::flush_memo();

		$key      = GLL_URL_Cache::key( self::URL );
		$envelope = get_transient( 'gll_url_' . substr( $key, 0, 40 ) );

		$envelope['version'] = GLL_Subset::VERSION + 1;
		set_transient( 'gll_url_' . substr( $key, 0, 40 ), $envelope, HOUR_IN_SECONDS );

		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * An entry whose stored key disagrees with the one asked for is not served.
	 *
	 * The transient name is a truncation of the key, so a collision is possible in
	 * principle; comparing the full key turns it into a cold cache rather than
	 * into the wrong loudspeaker.
	 */
	public function test_an_entry_under_a_colliding_name_is_not_served() {
		GLL_URL_Cache::set( self::URL, $this->subset() );
		GLL_URL_Cache::flush_memo();

		$key      = GLL_URL_Cache::key( self::URL );
		$envelope = get_transient( 'gll_url_' . substr( $key, 0, 40 ) );

		$envelope['key'] = str_repeat( 'f', 64 );
		set_transient( 'gll_url_' . substr( $key, 0, 40 ), $envelope, HOUR_IN_SECONDS );

		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * Deleting an entry removes it from the store and from the index.
	 */
	public function test_an_entry_can_be_discarded() {
		GLL_URL_Cache::set( self::URL, $this->subset() );
		GLL_URL_Cache::flush_memo();

		$this->assertTrue( GLL_URL_Cache::delete( self::URL ) );
		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
		$this->assertSame( array(), GLL_URL_Cache::index() );
	}

	/**
	 * The store is bounded, and the oldest entries are what goes.
	 */
	public function test_the_index_prunes_to_the_cap() {
		add_filter( 'gll_info_url_cache_max_entries', array( $this, 'filter_small_cap' ) );

		for ( $i = 0; $i < 6; $i++ ) {
			GLL_URL_Cache::set( 'https://cdn.example/' . $i . '.gll', $this->subset( 'S' . $i ) );
		}

		remove_filter( 'gll_info_url_cache_max_entries', array( $this, 'filter_small_cap' ) );
		GLL_URL_Cache::flush_memo();

		$this->assertCount( 3, GLL_URL_Cache::index() );
		$this->assertFalse( GLL_URL_Cache::get( 'https://cdn.example/0.gll' ) );
		$this->assertIsArray( GLL_URL_Cache::get( 'https://cdn.example/5.gll' ) );
	}

	/**
	 * Cap the store at three entries.
	 *
	 * @return int Cap.
	 */
	public function filter_small_cap() {
		return 3;
	}

	/**
	 * Everything can be thrown away at once, which is what the settings screen
	 * offers an administrator who knows a file changed upstream.
	 */
	public function test_purge_all_empties_the_store() {
		GLL_URL_Cache::set( self::URL, $this->subset() );
		GLL_URL_Cache::set( 'https://cdn.example/other.gll', $this->subset() );
		GLL_URL_Cache::flush_memo();

		$this->assertSame( 2, GLL_URL_Cache::purge_all() );
		$this->assertSame( array(), GLL_URL_Cache::index() );
		$this->assertFalse( GLL_URL_Cache::get( self::URL ) );
	}

	/**
	 * The write rate limit stops the store being used as bulk storage.
	 */
	public function test_the_rate_limit_closes_after_its_allowance() {
		add_filter( 'gll_info_url_cache_rate_limit', array( $this, 'filter_two_writes' ) );

		$user = self::factory()->user->create( array( 'role' => 'author' ) );

		$this->assertTrue( GLL_URL_Cache::rate_ok( $user ) );
		$this->assertTrue( GLL_URL_Cache::rate_ok( $user ) );
		$this->assertFalse( GLL_URL_Cache::rate_ok( $user ) );

		// An anonymous caller has no allowance at all.
		$this->assertFalse( GLL_URL_Cache::rate_ok( 0 ) );

		remove_filter( 'gll_info_url_cache_rate_limit', array( $this, 'filter_two_writes' ) );
	}

	/**
	 * Allow two writes per window.
	 *
	 * @return int Limit.
	 */
	public function filter_two_writes() {
		return 2;
	}
}
