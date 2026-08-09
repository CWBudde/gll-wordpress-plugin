<?php
/**
 * The PHP half of the golden pin.
 *
 * `GLL_Subset::from_raw()` and `src/shared/gll-subset.ts` build the same shape
 * from the same data — one for the server-side parser backends, one for the
 * block editor — and neither test suite can run the other's code. Both are
 * therefore held to the same committed artifacts: the Jest integration suite
 * asserts the JavaScript builder reproduces `tests/fixtures/*-subset.json`, and
 * this asserts the PHP reducer reproduces it too, from the same
 * `tests/fixtures/*-raw.json` input.
 *
 * If this fails after a deliberate shape change, regenerate the goldens with
 * `node --experimental-strip-types scripts/make-goldens.mjs` and commit them.
 * If it fails after a change to only one implementation, that is the drift this
 * test exists to catch.
 *
 * @package
 */

/**
 * Tests for the raw-to-subset reducer.
 */
class GLL_Subset_Test extends WP_UnitTestCase {

	/**
	 * Read a committed fixture.
	 *
	 * @param string $name File name within `tests/fixtures`.
	 * @return array Decoded JSON.
	 */
	private function fixture( $name ) {
		$path = dirname( __DIR__ ) . '/fixtures/' . $name;

		$this->assertFileExists( $path, 'Golden fixtures are committed; run scripts/make-goldens.mjs.' );

		return json_decode( file_get_contents( $path ), true );
	}

	/**
	 * The reducer reproduces the golden built by the JavaScript builder.
	 *
	 * `assertEquals` rather than `assertSame`: JSON has one number type and PHP
	 * has two, so a value written as `1000` decodes to int here and a value
	 * written as `12.5` decodes to float, while the JavaScript builder made no
	 * such distinction. Loose comparison is the honest one for data that
	 * round-trips through JSON.
	 *
	 * @dataProvider golden_fixtures
	 * @param string $name Fixture base name.
	 */
	public function test_the_reducer_reproduces_the_golden_subset( $name ) {
		$raw      = $this->fixture( $name . '-raw.json' );
		$expected = $this->fixture( $name . '-subset.json' );

		$this->assertEquals( $expected, GLL_Subset::from_raw( $raw ) );
	}

	/**
	 * Which goldens exist.
	 *
	 * The synthetic one matters more than the real one: the committed 3 KB
	 * sample carries no frames, limits, warnings, filter groups or case
	 * geometries, so on its own it would leave most of this class untested.
	 *
	 * @return array Test cases.
	 */
	public function golden_fixtures() {
		return array(
			'the real sample file' => array( 'sample' ),
			'the synthetic file'   => array( 'synthetic' ),
		);
	}

	/**
	 * Key order matters for the goldens, and only for the goldens.
	 *
	 * Nothing at runtime reads these structures positionally, but a reducer that
	 * emitted the right members in a different order would compare equal here
	 * and produce a JSON payload that no longer matched the JavaScript builder's
	 * byte for byte — which is the thing a reviewer diffs.
	 */
	public function test_the_encoded_subset_matches_the_golden_byte_for_byte() {
		$raw      = $this->fixture( 'synthetic-raw.json' );
		$expected = $this->fixture( 'synthetic-subset.json' );

		$this->assertSame(
			wp_json_encode( $expected, JSON_PRETTY_PRINT ),
			wp_json_encode( GLL_Subset::from_raw( $raw ), JSON_PRETTY_PRINT )
		);
	}

	/**
	 * The version travels with the payload, so a cache can be invalidated.
	 */
	public function test_the_subset_is_stamped_with_the_shape_version() {
		$subset = GLL_Subset::from_raw( $this->fixture( 'sample-raw.json' ) );

		$this->assertSame( GLL_Subset::VERSION, $subset['Version'] );
	}

	/**
	 * No translated text is produced here.
	 *
	 * A cached payload outlives the locale it was built in, so labels are
	 * derived at render time instead. This class having no label tables is the
	 * mechanism; this is the assertion.
	 */
	public function test_no_label_text_is_produced() {
		$encoded = wp_json_encode(
			GLL_Subset::from_raw( $this->fixture( 'synthetic-raw.json' ) )
		);

		$this->assertStringNotContainsString( 'TypeLabel', $encoded );
		$this->assertStringNotContainsString( 'KindLabel', $encoded );
		$this->assertStringNotContainsString( 'FilterShapeLabel', $encoded );
		$this->assertStringNotContainsString( 'AlignmentLabel', $encoded );
	}

	/**
	 * The payload guards, which are the reason this module exists.
	 */
	public function test_the_expensive_payloads_are_dropped() {
		$subset  = GLL_Subset::from_raw( $this->fixture( 'synthetic-raw.json' ) );
		$encoded = wp_json_encode( $subset );

		$this->assertArrayNotHasKey( 'IncludeFiles', $subset['Database'] );
		$this->assertArrayNotHasKey( 'DataFiles', $subset['Database'] );
		$this->assertStringNotContainsString( 'data:', $encoded );
		$this->assertStringNotContainsString( 'OnAxisSpectrum', $encoded );
		$this->assertStringNotContainsString( 'Responses', $encoded );

		// The FIR coefficient arrays become a count. Four in the fixture, where
		// a real filter carries 8193 float64 — about 131 KB each.
		$filters = $subset['Database']['FilterGroups'][0]['Filters'][0]['Bank']['Filters'];
		$this->assertSame( 4, $filters[1]['FIR']['CoefficientCount'] );

		// Filter spectra become presence booleans.
		$this->assertTrue( $filters[2]['LogSpectrum']['HasLevel'] );
		$this->assertFalse( $filters[2]['LogSpectrum']['HasPhase'] );
	}

	/**
	 * Responses are counted, not carried.
	 */
	public function test_responses_are_reduced_to_a_count() {
		$sources = GLL_Subset::from_raw(
			$this->fixture( 'synthetic-raw.json' )
		)['Database']['SourceDefinitions'];

		$this->assertSame( 2, $sources[0]['ResponseCount'] );
		$this->assertSame( 0, $sources[1]['ResponseCount'] );
	}

	/**
	 * Null and absent are not interchangeable.
	 *
	 * The overview branches on `BalloonData === null` to tell "this source has
	 * no balloon block" from "a balloon whose fields happen to be unset". An
	 * absent key would read as the latter.
	 */
	public function test_a_missing_balloon_is_null_rather_than_absent() {
		$sources = GLL_Subset::from_raw(
			$this->fixture( 'synthetic-raw.json' )
		)['Database']['SourceDefinitions'];

		$this->assertArrayHasKey( 'BalloonData', $sources[1]['Definition'] );
		$this->assertNull( $sources[1]['Definition']['BalloonData'] );
		$this->assertNotNull( $sources[0]['Definition']['BalloonData'] );
	}

	/**
	 * Geometry counts exclude what no renderer could draw.
	 *
	 * The synthetic fixture carries an edge with an unset endpoint and a face
	 * with fewer than three resolved indices. Counting those would make the
	 * config block's summary disagree with the 3D geometry block about one mesh.
	 */
	public function test_geometry_counts_exclude_unrenderable_entries() {
		$geometries = GLL_Subset::from_raw(
			$this->fixture( 'synthetic-raw.json' )
		)['Database']['CaseGeometries'];

		$this->assertSame( 4, $geometries[0]['VertexCount'] );
		$this->assertSame( 2, $geometries[0]['EdgeCount'] );
		$this->assertSame( 2, $geometries[0]['FaceCount'] );
	}

	/**
	 * Box geometries come first and frame geometries are appended.
	 *
	 * A saved-content contract: `src/geometry/view.ts` indexes this list
	 * positionally against a `geometryIndex` attribute stored in existing posts,
	 * so a box that drops out for having no geometry must not shift the frames
	 * that follow it.
	 */
	public function test_the_geometry_list_keeps_its_saved_order() {
		$database = GLL_Subset::from_raw(
			$this->fixture( 'synthetic-raw.json' )
		)['Database'];

		$this->assertCount( 2, $database['CaseGeometries'] );
		$this->assertSame( 'box', $database['CaseGeometries'][0]['OwnerKind'] );
		$this->assertSame( 'frame', $database['CaseGeometries'][1]['OwnerKind'] );

		// The second box has no geometry and is absent from the list, but the
		// frame that follows still reports where its own geometry landed.
		$this->assertSame( 1, $database['Frames'][0]['CaseGeometryIndex'] );
		$this->assertSame( -1, $database['Frames'][1]['CaseGeometryIndex'] );
	}

	/**
	 * `findBoxGeometry()` in config-model matches on exactly these two fields.
	 */
	public function test_box_geometries_keep_the_fields_the_lookup_needs() {
		$geometries = GLL_Subset::from_raw(
			$this->fixture( 'synthetic-raw.json' )
		)['Database']['CaseGeometries'];

		$this->assertSame( 'box', $geometries[0]['OwnerKind'] );
		$this->assertSame( 0, $geometries[0]['BoxIndex'] );

		// Frames deliberately carry no BoxIndex: `src/geometry/edit.tsx` reads
		// `BoxLabel || BoxKey`, and repurposing those for frames would relabel
		// existing box geometries.
		$this->assertArrayNotHasKey( 'BoxIndex', $geometries[1] );
	}

	/**
	 * Garbage in, null out.
	 */
	public function test_malformed_input_produces_null() {
		$this->assertNull( GLL_Subset::from_raw( null ) );
		$this->assertNull( GLL_Subset::from_raw( 'nonsense' ) );
		$this->assertNull( GLL_Subset::from_raw( 42 ) );
	}

	/**
	 * An empty parse still produces the tables the renderers iterate.
	 */
	public function test_an_empty_parse_produces_empty_tables() {
		$database = GLL_Subset::from_raw( array() )['Database'];

		foreach ( array( 'SourceDefinitions', 'BoxTypes', 'Frames', 'Limits', 'Warnings', 'FilterGroups', 'CaseGeometries' ) as $key ) {
			$this->assertSame( array(), $database[ $key ], $key . ' must be an empty list.' );
		}
	}
}
