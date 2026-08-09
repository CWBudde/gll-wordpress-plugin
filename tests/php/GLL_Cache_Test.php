<?php
/**
 * Tests for the cached-subset storage layer.
 *
 * The interesting behaviour is all in the refusals. `GLL_Cache::get()` is what
 * stands between a visitor and a payload describing a file that has since been
 * replaced, and `GLL_Cache::validate()` is what stands between an author and
 * `wp_postmeta` as a dumping ground. A test suite that only checked the round
 * trip would pass against a class that did neither.
 *
 * @package
 */

/**
 * Tests for GLL_Cache.
 */
class GLL_Cache_Test extends WP_UnitTestCase {

	/**
	 * Files written into the uploads directory, removed after each test.
	 *
	 * @var string[]
	 */
	private $written = array();

	/**
	 * Remove anything this test wrote to disk.
	 */
	public function tear_down() {
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
	 * The file has to exist: `GLL_Cache` hashes it, and an attachment with no
	 * readable file is exactly one of the cases under test.
	 *
	 * @param string $contents File contents.
	 * @param string $mime     MIME type to register.
	 * @return int Attachment ID.
	 */
	private function create_attachment( $contents = "GLL BYTES\n", $mime = 'application/x-gll' ) {
		$uploads = wp_upload_dir();
		wp_mkdir_p( $uploads['path'] );

		$path = trailingslashit( $uploads['path'] ) . uniqid( 'gll-cache-' ) . '.gll';
		file_put_contents( $path, $contents );
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
	 * @param array $database Extra database members.
	 * @return array Subset.
	 */
	private function subset( $database = array() ) {
		return array(
			'Version'   => GLL_Subset::VERSION,
			'GenSystem' => array( 'Label' => 'Example' ),
			'Database'  => array_merge(
				array(
					'SourceDefinitions' => array(),
					'BoxTypes'          => array(),
				),
				$database
			),
		);
	}

	/**
	 * The round trip.
	 */
	public function test_a_stored_subset_comes_back() {
		$id     = $this->create_attachment();
		$subset = $this->subset();

		$this->assertTrue( GLL_Cache::set( $id, $subset, 'node' ) );
		$this->assertEquals( $subset, GLL_Cache::get( $id ) );
	}

	/**
	 * A fresh attachment has nothing to serve.
	 */
	public function test_an_uncached_attachment_reports_nothing() {
		$this->assertFalse( GLL_Cache::get( $this->create_attachment() ) );
	}

	/**
	 * The envelope records which parser produced the payload.
	 */
	public function test_the_producer_is_recorded_and_constrained() {
		$id = $this->create_attachment();

		GLL_Cache::set( $id, $this->subset(), 'node' );
		$this->assertSame( 'node', GLL_Cache::get_envelope( $id )['producer'] );

		// An unknown producer falls back rather than being stored verbatim.
		GLL_Cache::set( $id, $this->subset(), 'something-else' );
		$this->assertSame( 'browser', GLL_Cache::get_envelope( $id )['producer'] );
	}

	/**
	 * Replacing the file invalidates its cache, with no hook involved.
	 *
	 * This is the property that made post meta plus a server-computed fingerprint
	 * the right storage: nothing has to remember to call an invalidation
	 * function, because the payload stops matching the bytes it describes.
	 */
	public function test_rewriting_the_file_invalidates_the_cache() {
		$id = $this->create_attachment( "ORIGINAL\n" );
		GLL_Cache::set( $id, $this->subset() );

		$this->assertNotFalse( GLL_Cache::get( $id ) );

		file_put_contents( get_attached_file( $id ), "A REPLACEMENT OF A DIFFERENT LENGTH\n" );
		GLL_Cache::flush_memo();

		$this->assertFalse(
			GLL_Cache::get( $id ),
			'A cache describing bytes that are no longer there must not be served.'
		);
	}

	/**
	 * A same-length replacement is caught too, by its modification time.
	 *
	 * Size alone would miss this, and a real replacement often keeps the byte
	 * count nowhere near constant — but "nowhere near" is not "never".
	 */
	public function test_a_same_length_replacement_is_caught_by_its_mtime() {
		$id = $this->create_attachment( "ORIGINAL\n" );
		GLL_Cache::set( $id, $this->subset() );

		$path = get_attached_file( $id );
		file_put_contents( $path, "REPLACED\n" );
		touch( $path, time() + 5 );
		GLL_Cache::flush_memo();

		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * A file that was touched but not changed keeps its cache.
	 *
	 * This is the reason a signature mismatch falls back to the digest instead of
	 * simply invalidating: a backup restore or a deploy can move every mtime on
	 * disk without moving a byte, and throwing away every cached subset for that
	 * would be a self-inflicted stampede.
	 */
	public function test_touching_the_file_does_not_lose_the_cache() {
		$id = $this->create_attachment( "ORIGINAL\n" );
		GLL_Cache::set( $id, $this->subset() );

		touch( get_attached_file( $id ), time() + 5 );
		GLL_Cache::flush_memo();

		$this->assertEquals( $this->subset(), GLL_Cache::get( $id ) );
	}

	/**
	 * Reads do not hash the file when the cheap signature already agrees.
	 *
	 * The read route is public, so hashing on every GET would let an anonymous
	 * caller force a full re-read of a file that can run to tens of megabytes,
	 * once per cache-backed block per page view. Asserted by making the digest
	 * impossible to match: if the read consulted it, this would fail.
	 */
	public function test_a_warm_read_does_not_consult_the_digest() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		$envelope         = GLL_Cache::get_envelope( $id );
		$envelope['hash'] = str_repeat( '0', 64 );
		update_post_meta( $id, GLL_Cache::META_KEY, $envelope );
		GLL_Cache::flush_memo();

		$this->assertEquals( $this->subset(), GLL_Cache::get( $id ) );
	}

	/**
	 * The digest is computed from disk, never taken from the caller.
	 *
	 * Once the signature disagrees the digest decides, and a forged one loses.
	 */
	public function test_a_forged_digest_is_not_trusted() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		$envelope          = GLL_Cache::get_envelope( $id );
		$envelope['hash']  = str_repeat( '0', 64 );
		$envelope['mtime'] = (int) $envelope['mtime'] - 60;
		update_post_meta( $id, GLL_Cache::META_KEY, $envelope );
		GLL_Cache::flush_memo();

		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * A caller may prove which bytes it parsed, and is refused when it cannot.
	 *
	 * This closes the window the server cannot otherwise see: a browser fetches,
	 * parses, and only then POSTs, and the file may have been replaced in
	 * between. Without the expected digest the old subset would be stamped with
	 * the new file's fingerprint and served as fresh indefinitely.
	 */
	public function test_a_write_can_be_bound_to_the_bytes_the_caller_parsed() {
		$id   = $this->create_attachment( "ORIGINAL\n" );
		$hash = GLL_Cache::file_hash( $id );

		$this->assertTrue( GLL_Cache::set( $id, $this->subset(), 'browser', $hash ) );

		// The file moves on, and a write still claiming the old digest is refused
		// rather than being stamped with the new one.
		file_put_contents( get_attached_file( $id ), "SOMETHING ELSE ENTIRELY\n" );
		GLL_Cache::flush_memo();

		$this->assertFalse( GLL_Cache::set( $id, $this->subset(), 'browser', $hash ) );

		// And the same write succeeds once it names the bytes that are there.
		$this->assertTrue(
			GLL_Cache::set( $id, $this->subset(), 'browser', GLL_Cache::file_hash( $id ) )
		);
	}

	/**
	 * A caller that cannot compute a digest is still allowed to write.
	 *
	 * `crypto.subtle` needs a secure context, so on a plain-HTTP site the editor
	 * has no way to produce one. Refusing the write there would disable caching
	 * for that site entirely.
	 */
	public function test_a_write_without_a_digest_is_still_accepted() {
		$id = $this->create_attachment();

		$this->assertTrue( GLL_Cache::set( $id, $this->subset(), 'browser', null ) );
	}

	/**
	 * A payload from an older shape version is not served.
	 */
	public function test_a_stale_shape_version_is_not_served() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		$envelope            = GLL_Cache::get_envelope( $id );
		$envelope['version'] = GLL_Subset::VERSION + 1;
		update_post_meta( $id, GLL_Cache::META_KEY, $envelope );

		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * Only GLL attachments have a cache.
	 */
	public function test_other_mime_types_are_refused() {
		$id = $this->create_attachment( "text\n", 'text/plain' );

		$this->assertFalse( GLL_Cache::is_gll( $id ) );
		$this->assertFalse( GLL_Cache::set( $id, $this->subset() ) );
		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * A post that is not an attachment, and an ID that is nothing at all.
	 */
	public function test_non_attachments_are_refused() {
		$this->assertFalse( GLL_Cache::is_gll( 0 ) );
		$this->assertFalse( GLL_Cache::is_gll( -1 ) );
		$this->assertFalse( GLL_Cache::is_gll( 999999 ) );
		$this->assertFalse( GLL_Cache::is_gll( $this->factory->post->create() ) );
	}

	/**
	 * An attachment whose file has gone missing cannot be cached or served.
	 */
	public function test_an_unreadable_file_yields_no_cache() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		unlink( get_attached_file( $id ) );

		$this->assertFalse( GLL_Cache::file_hash( $id ) );
		$this->assertFalse( GLL_Cache::get( $id ) );
		$this->assertFalse( GLL_Cache::set( $id, $this->subset() ) );
	}

	/**
	 * Deleting the attachment takes the cache with it.
	 *
	 * WordPress cascades postmeta, so this needs no code — which is the whole
	 * argument for storing it here rather than in a transient or a file.
	 */
	public function test_deleting_the_attachment_removes_the_cache() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		wp_delete_attachment( $id, true );

		$this->assertSame( '', get_post_meta( $id, GLL_Cache::META_KEY, true ) );
	}

	/**
	 * The explicit discard, which backs the editor's refresh control.
	 */
	public function test_the_cache_can_be_discarded() {
		$id = $this->create_attachment();
		GLL_Cache::set( $id, $this->subset() );

		$this->assertTrue( GLL_Cache::delete( $id ) );
		$this->assertFalse( GLL_Cache::get( $id ) );
	}

	/**
	 * Storing the identical payload twice is a success, not a failure.
	 *
	 * `update_post_meta()` returns false when the value is unchanged, which is a
	 * no-op rather than an error; reporting it as failure would make the editor
	 * show a refresh as having gone wrong.
	 */
	public function test_storing_an_unchanged_payload_still_reports_success() {
		$id = $this->create_attachment();

		$this->assertTrue( GLL_Cache::set( $id, $this->subset(), 'node' ) );
		$this->assertTrue( GLL_Cache::set( $id, $this->subset(), 'node' ) );
	}

	/**
	 * Validation: the shape version has to be the one this plugin speaks.
	 */
	public function test_validation_requires_a_matching_version() {
		$this->assertFalse( GLL_Cache::validate( array( 'Database' => array() ) ) );

		$wrong            = $this->subset();
		$wrong['Version'] = GLL_Subset::VERSION + 1;
		$this->assertFalse( GLL_Cache::validate( $wrong ) );
	}

	/**
	 * Validation: a database is required.
	 */
	public function test_validation_requires_a_database() {
		$this->assertFalse(
			GLL_Cache::validate( array( 'Version' => GLL_Subset::VERSION ) )
		);
	}

	/**
	 * Validation: nothing but scalars and arrays.
	 */
	public function test_validation_rejects_non_json_values() {
		$subset                        = $this->subset();
		$subset['Database']['Objects'] = array( new stdClass() );

		$this->assertFalse( GLL_Cache::validate( $subset ) );

		$infinite                       = $this->subset();
		$infinite['Database']['Number'] = INF;

		$this->assertFalse( GLL_Cache::validate( $infinite ) );
	}

	/**
	 * Validation: `wp_postmeta` is not a dumping ground.
	 */
	public function test_validation_rejects_an_oversized_payload() {
		$subset                     = $this->subset();
		$subset['Database']['Blob'] = str_repeat( 'x', GLL_Cache::MAX_BYTES );

		$this->assertFalse( GLL_Cache::validate( $subset ) );
	}

	/**
	 * Validation: bounded nesting.
	 */
	public function test_validation_rejects_unbounded_nesting() {
		$deep = 'leaf';
		for ( $i = 0; $i < GLL_Cache::MAX_DEPTH + 4; $i++ ) {
			$deep = array( $deep );
		}

		$subset                     = $this->subset();
		$subset['Database']['Deep'] = $deep;

		$this->assertFalse( GLL_Cache::validate( $subset ) );
	}

	/**
	 * Validation: keys that could not have come out of the builder.
	 */
	public function test_validation_rejects_implausible_keys() {
		$subset                                       = $this->subset();
		$subset['Database']['Bad key with spaces !!'] = 1;

		$this->assertFalse( GLL_Cache::validate( $subset ) );
	}

	/**
	 * Validation: a real subset passes.
	 *
	 * The negative cases above are only meaningful if the thing the plugin
	 * actually produces is not caught by any of them.
	 */
	public function test_a_real_subset_validates() {
		$raw = json_decode(
			file_get_contents( dirname( __DIR__ ) . '/fixtures/synthetic-raw.json' ),
			true
		);

		$this->assertTrue( GLL_Cache::validate( GLL_Subset::from_raw( $raw ) ) );
	}

	/**
	 * An invalid subset never reaches storage.
	 */
	public function test_an_invalid_subset_is_not_stored() {
		$id = $this->create_attachment();

		$this->assertFalse( GLL_Cache::set( $id, array( 'Version' => 999 ) ) );
		$this->assertFalse( GLL_Cache::get_envelope( $id ) );
	}
}
