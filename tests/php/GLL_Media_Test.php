<?php
/**
 * Media library integration.
 *
 * Highest-value suite in this directory: it covers the filters that decide
 * whether a `.gll` can be uploaded at all, and every one of them is a WordPress
 * hook that only means anything inside WordPress.
 *
 * @package GLL_Info
 */

/**
 * Tests for GLL_Media.
 */
class GLL_Media_Test extends WP_UnitTestCase {

	/**
	 * The committed fixture, used so the filetype check runs against real bytes.
	 *
	 * @var string
	 */
	private $fixture;

	/**
	 * Resolve the fixture path.
	 */
	public function set_up() {
		parent::set_up();
		$this->fixture = dirname( __DIR__ ) . '/fixtures/sample.gll';
	}

	/**
	 * The allowlist is what makes the upload possible in the first place.
	 */
	public function test_gll_is_an_allowed_upload_type() {
		$mimes = apply_filters( 'upload_mimes', array() );

		$this->assertArrayHasKey( 'gll', $mimes );
		$this->assertSame( 'application/x-gll', $mimes['gll'] );
	}

	/**
	 * The filter must add to the allowlist rather than replace it.
	 */
	public function test_existing_upload_types_survive() {
		$mimes = apply_filters( 'upload_mimes', array( 'jpg|jpeg' => 'image/jpeg' ) );

		$this->assertArrayHasKey( 'jpg|jpeg', $mimes );
		$this->assertArrayHasKey( 'gll', $mimes );
	}

	/**
	 * A GLL is a binary with no magic bytes finfo recognizes, so WordPress's own
	 * sniffing disagrees with the extension. Reconciling that is the entire
	 * reason `check_filetype` exists, and this runs it against real bytes.
	 */
	public function test_real_gll_bytes_are_typed_from_the_extension() {
		$this->assertFileExists( $this->fixture, 'The committed fixture is missing.' );

		$checked = wp_check_filetype_and_ext( $this->fixture, 'sample.gll' );

		$this->assertSame( 'gll', $checked['ext'] );
		$this->assertSame( 'application/x-gll', $checked['type'] );
	}

	/**
	 * Real-world exports from EASE are not consistently lower-case.
	 */
	public function test_uppercase_extension_is_accepted() {
		$checked = wp_check_filetype_and_ext( $this->fixture, 'SAMPLE.GLL' );

		$this->assertSame( 'gll', $checked['ext'] );
		$this->assertSame( 'application/x-gll', $checked['type'] );
	}

	/**
	 * The negative case: a broad filter that typed everything as GLL would pass
	 * every assertion above and still be badly wrong.
	 */
	public function test_a_non_gll_file_is_not_claimed() {
		$txt = wp_tempnam( 'gll-test.txt' );
		file_put_contents( $txt, "not a gll\n" );

		$checked = wp_check_filetype_and_ext( $txt, 'notes.txt' );

		unlink( $txt );

		$this->assertNotSame( 'application/x-gll', $checked['type'] );
	}

	/**
	 * The media library filter dropdown.
	 */
	public function test_gll_appears_in_the_media_library_filter() {
		$types = apply_filters( 'post_mime_types', array() );

		$this->assertArrayHasKey( 'application/x-gll', $types );
	}

	/**
	 * Attachment metadata round trip.
	 */
	public function test_metadata_round_trips_through_post_meta() {
		$attachment_id = $this->factory->attachment->create_object(
			array(
				'file'           => 'sample.gll',
				'post_mime_type' => 'application/x-gll',
			)
		);

		$this->assertFalse(
			GLL_Media::get_gll_metadata( $attachment_id ),
			'A fresh attachment must report no cached metadata.'
		);

		$payload = array(
			'label'   => 'Example Visualisation',
			'sources' => array( 'Full Range' ),
		);
		GLL_Media::save_gll_metadata( $attachment_id, $payload );

		$this->assertSame( $payload, GLL_Media::get_gll_metadata( $attachment_id ) );
	}

	/**
	 * Metadata is only reported for GLL attachments.
	 */
	public function test_metadata_is_not_reported_for_other_mime_types() {
		$attachment_id = $this->factory->attachment->create_object(
			array(
				'file'           => 'photo.jpg',
				'post_mime_type' => 'image/jpeg',
			)
		);
		GLL_Media::save_gll_metadata( $attachment_id, array( 'label' => 'x' ) );

		$this->assertFalse( GLL_Media::get_gll_metadata( $attachment_id ) );
	}

	/**
	 * The admin thumbnail falls back to the plugin's own icon.
	 */
	public function test_gll_attachments_get_the_plugin_icon() {
		$attachment_id = $this->factory->attachment->create_object(
			array(
				'file'           => 'sample.gll',
				'post_mime_type' => 'application/x-gll',
			)
		);

		$image = apply_filters(
			'wp_get_attachment_image_src',
			false,
			$attachment_id,
			'thumbnail',
			true
		);

		$this->assertIsArray( $image );
		$this->assertStringContainsString( 'assets/images/gll-icon.svg', $image[0] );
	}

	/**
	 * Doubles as a packaging canary: the icon is referenced by URL, so a ZIP
	 * that dropped assets/ would leave every GLL attachment iconless and
	 * nothing else would notice.
	 */
	public function test_the_referenced_icon_exists_on_disk() {
		$this->assertFileExists( GLL_INFO_PLUGIN_DIR . 'assets/images/gll-icon.svg' );
	}

	/**
	 * The same reasoning for the parser, which is the file the packaging bug
	 * actually dropped.
	 */
	public function test_the_wasm_parser_exists_on_disk() {
		$this->assertFileExists( GLL_INFO_PLUGIN_DIR . 'assets/wasm/gll.wasm' );
		$this->assertFileExists( GLL_INFO_PLUGIN_DIR . 'assets/wasm/wasm_exec.js' );
		$this->assertGreaterThan(
			4000000,
			filesize( GLL_INFO_PLUGIN_DIR . 'assets/wasm/gll.wasm' ),
			'gll.wasm looks truncated.'
		);
	}

	/**
	 * A non-GLL attachment must not be given the icon.
	 */
	public function test_other_attachments_are_left_alone() {
		$attachment_id = $this->factory->attachment->create_object(
			array(
				'file'           => 'photo.jpg',
				'post_mime_type' => 'image/jpeg',
			)
		);

		$image = apply_filters(
			'wp_get_attachment_image_src',
			false,
			$attachment_id,
			'thumbnail',
			true
		);

		$this->assertFalse( $image );
	}
}
