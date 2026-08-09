<?php
/**
 * Reduce raw parser output to the cacheable display subset.
 *
 * This is the PHP twin of `src/shared/gll-subset.ts`, and it exists because the
 * server-side parser backends hand PHP a raw JSON string with no JavaScript in
 * the loop. The editor path reduces an already-normalized parse in the browser;
 * this one goes straight from the parser's snake_case output to the same shape,
 * folding in the parts of `src/shared/gll-normalize.ts` the subset needs.
 *
 * Only the cheap normalizer branches are ported. There are no response arrays to
 * carry, no vertex indices to fold (only counted), no embedded files to decode
 * and no FIR coefficients to reduce, so the duplicated surface is far smaller
 * than the normalizer itself.
 *
 * NO TRANSLATED TEXT IS PRODUCED HERE. The normalizer attaches `TypeLabel`,
 * `KindLabel`, `FilterShapeLabel` and `AlignmentLabel`, but a cached payload
 * outlives the locale it was built in, so the subset carries only the raw enum
 * integers and `hydrateSubsetLabels()` re-derives the text in the reader's
 * locale at render time. That is why this class needs no label tables.
 *
 * ABSENT VERSUS NULL is load-bearing. JavaScript omits a key whose value is
 * `undefined` and keeps one whose value is `null`, and the frontend branches on
 * the difference — `BalloonData: null` means "this source has no balloon block",
 * where an absent key would read as a balloon whose fields happen to be unset.
 * Every mapping below therefore either copies a key only when the raw data has
 * it (`self::pick()`), or coerces explicitly to null the way the normalizer
 * does.
 *
 * Both implementations are pinned against `tests/fixtures/*-subset.json`; see
 * `scripts/make-goldens.mjs`.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Builds the display subset from raw parser output.
 */
class GLL_Subset {

	/**
	 * Shape version of the subset.
	 *
	 * Must equal `SUBSET_VERSION` in `src/shared/gll-subset.ts`. A bump
	 * invalidates every cached payload in the wild.
	 *
	 * @var int
	 */
	const VERSION = 1;

	/**
	 * Build the display subset from raw parser output.
	 *
	 * @param array $raw Decoded parser output (the `data` member of the result).
	 * @return array|null Subset, or null when the input is not a parse.
	 */
	public static function from_raw( $raw ) {
		if ( ! is_array( $raw ) ) {
			return null;
		}

		$header     = self::sub( $raw, 'header' );
		$gen_system = self::sub( $raw, 'gen_system' );
		$metadata   = self::sub( $raw, 'metadata' );
		$database   = self::sub( $raw, 'database' );

		$subset = array(
			'Version'  => self::VERSION,
			'Header'   => self::pick(
				$header,
				array(
					'Magic'         => 'magic',
					'FormatId'      => 'format_id',
					'FormatVersion' => 'format_version',
					'SubVersion'    => 'sub_version',
				)
			),
			'GenSystem' => self::gen_system( $gen_system, $metadata ),
			'Metadata'  => self::pick(
				$metadata,
				array(
					'ProductName'  => 'product_name',
					'DisplayName'  => 'display_name',
					'Manufacturer' => 'manufacturer',
					'Description'  => 'description',
					'Copyright'    => 'copyright',
					'Website'      => 'website',
					'Email'        => 'email',
				)
			),
			'Database'  => self::database( $database ),
		);

		// `Description` duplicates `metadata.description` in the normalized
		// shape, and is omitted rather than nulled when the file has none.
		if ( array_key_exists( 'description', $metadata ) ) {
			$subset = self::insert_after(
				$subset,
				'Metadata',
				'Description',
				$metadata['description']
			);
		}

		return $subset;
	}

	/**
	 * Map the system block.
	 *
	 * `Manufacturer` falls back to the metadata's, exactly as the normalizer
	 * does, and is omitted when neither block carries one.
	 *
	 * @param array $gen_system Raw `gen_system` block.
	 * @param array $metadata   Raw `metadata` block, for the fallback.
	 * @return array Normalized system block.
	 */
	private static function gen_system( $gen_system, $metadata ) {
		$out = self::pick(
			$gen_system,
			array(
				'Label'      => 'label',
				'Key'        => 'key',
				'Version'    => 'version',
				'SystemType' => 'type',
			)
		);

		// `company || metadata.manufacturer`: a falsy company falls through to
		// the metadata's, which is what the normalizer's `||` does. The key is
		// omitted only when neither block declares one at all.
		if ( array_key_exists( 'company', $gen_system ) || array_key_exists( 'manufacturer', $metadata ) ) {
			$company             = self::value( $gen_system, 'company' );
			$out['Manufacturer'] = $company ? $company : self::value( $metadata, 'manufacturer' );
		}

		return $out + self::pick(
			$gen_system,
			array(
				'InfoText'      => 'info_text',
				'CopyrightText' => 'copyright_text',
				'WebsiteText'   => 'website_text',
				'EmailText'     => 'email_text',
			)
		);
	}

	/**
	 * Map the database block.
	 *
	 * @param array $database Raw `database` block.
	 * @return array Subset database block.
	 */
	private static function database( $database ) {
		$box_types = self::list_of( $database, 'box_types' );
		$frames    = self::list_of( $database, 'frames' );

		$normalized_boxes  = array_map( array( __CLASS__, 'box_type' ), $box_types );
		$normalized_frames = array_map( array( __CLASS__, 'frame' ), $frames );

		$geometries = self::case_geometries(
			$box_types,
			$frames,
			$normalized_frames
		);

		return array(
			'SourceDefinitions' => array_map(
				array( __CLASS__, 'source' ),
				self::list_of( $database, 'source_definitions' )
			),
			'BoxTypes'          => $normalized_boxes,
			'Frames'            => $normalized_frames,
			'Limits'            => array_map(
				array( __CLASS__, 'limit_entry' ),
				self::list_of( $database, 'limits' )
			),
			'Warnings'          => array_map(
				array( __CLASS__, 'warning_entry' ),
				self::list_of( $database, 'warnings' )
			),
			'FilterGroups'      => array_map(
				array( __CLASS__, 'filter_group' ),
				self::list_of( $database, 'filter_groups' )
			),
			'CaseGeometries'    => $geometries,
		);
	}

	/**
	 * Build the flat case-geometry list.
	 *
	 * Box geometries come first and frame geometries are APPENDED, never
	 * interleaved, and a box without a geometry drops out of the list entirely.
	 * That ordering is a saved-content contract: `src/geometry/view.ts` indexes
	 * this list positionally against a `geometryIndex` block attribute stored in
	 * existing posts, so changing the order would silently repoint every saved
	 * geometry block at a different mesh.
	 *
	 * Each frame's `CaseGeometryIndex` is filled in here for the same reason the
	 * normalizer fills it in at the top level: only this function knows where the
	 * frame's geometry landed.
	 *
	 * @param array $box_types         Raw box types.
	 * @param array $frames            Raw frames.
	 * @param array $normalized_frames Normalized frames, modified in place.
	 * @return array Flat list of subset case geometries.
	 */
	private static function case_geometries( $box_types, $frames, &$normalized_frames ) {
		$geometries = array();

		foreach ( $box_types as $index => $box ) {
			$geometry = self::case_geometry( $box, $index, 'box' );
			if ( null !== $geometry ) {
				$geometries[] = $geometry;
			}
		}

		foreach ( $frames as $index => $frame ) {
			$geometry = self::case_geometry( $frame, $index, 'frame' );
			if ( null === $geometry ) {
				continue;
			}

			if ( isset( $normalized_frames[ $index ] ) ) {
				$normalized_frames[ $index ]['CaseGeometryIndex'] = count( $geometries );
			}

			$geometries[] = $geometry;
		}

		return $geometries;
	}

	/**
	 * Reduce one case geometry to its identity and its mesh counts.
	 *
	 * The counts are taken AFTER the same filtering the normalizer applies, so
	 * this block and the 3D geometry block can never disagree about one mesh: an
	 * edge with an unset endpoint and a face with fewer than three resolved
	 * indices are both unrenderable and are not counted.
	 *
	 * The legacy `BoxIndex`/`BoxKey`/`BoxLabel` fields are set for boxes only and
	 * omitted for frames, matching the normalizer — `findBoxGeometry()` in
	 * `src/config/config-model.ts` matches on `OwnerKind` plus `BoxIndex`.
	 *
	 * @param array  $owner      Raw box type or frame.
	 * @param int    $owner_index Index within its own raw list.
	 * @param string $owner_kind  Either 'box' or 'frame'.
	 * @return array|null Subset geometry, or null when the owner has none.
	 */
	private static function case_geometry( $owner, $owner_index, $owner_kind ) {
		$geometry = self::value( $owner, 'case_geometry' );
		if ( ! is_array( $geometry ) ) {
			return null;
		}

		$out = array(
			'OwnerKind'  => $owner_kind,
			'OwnerIndex' => $owner_index,
		);

		foreach ( array( 'OwnerKey' => 'key', 'OwnerLabel' => 'label' ) as $out_key => $raw_key ) {
			if ( array_key_exists( $raw_key, $owner ) ) {
				$out[ $out_key ] = $owner[ $raw_key ];
			}
		}

		if ( 'box' === $owner_kind ) {
			foreach ( array( 'BoxKey' => 'key', 'BoxLabel' => 'label' ) as $out_key => $raw_key ) {
				if ( array_key_exists( $raw_key, $owner ) ) {
					$out[ $out_key ] = $owner[ $raw_key ];
				}
			}
			$out['BoxIndex'] = $owner_index;
		}

		$out += self::pick(
			$geometry,
			array(
				'IsSymmetric'  => 'is_symmetric',
				'SymmetryAxis' => 'symmetry_axis',
			)
		);

		$out['VertexCount'] = count( self::list_of( $geometry, 'vertices' ) );
		$out['EdgeCount']   = self::count_edges( self::list_of( $geometry, 'edges' ) );
		$out['FaceCount']   = self::count_faces( self::list_of( $geometry, 'faces' ) );

		return self::order_geometry_keys( $out, 'box' === $owner_kind );
	}

	/**
	 * Put the geometry keys in the order the JS builder emits them.
	 *
	 * Only matters because the goldens are compared as decoded structures with
	 * ordered keys; nothing at runtime depends on it.
	 *
	 * @param array $geometry Subset geometry.
	 * @param bool  $is_box   Whether the owner is a box type.
	 * @return array Reordered geometry.
	 */
	private static function order_geometry_keys( $geometry, $is_box ) {
		$order = array( 'OwnerKind', 'OwnerIndex', 'OwnerKey', 'OwnerLabel' );

		if ( $is_box ) {
			$order[] = 'BoxIndex';
			$order[] = 'BoxKey';
			$order[] = 'BoxLabel';
		}

		$order = array_merge(
			$order,
			array( 'IsSymmetric', 'SymmetryAxis', 'VertexCount', 'EdgeCount', 'FaceCount' )
		);

		$out = array();
		foreach ( $order as $key ) {
			if ( array_key_exists( $key, $geometry ) ) {
				$out[ $key ] = $geometry[ $key ];
			}
		}

		return $out;
	}

	/**
	 * Count the edges that resolve to two usable vertices.
	 *
	 * Raw edges are 1-based with a negative index meaning "the mirrored twin of
	 * that vertex" and 0 meaning "unset"; only the unset case drops an edge.
	 *
	 * @param array $edges Raw edge records.
	 * @return int Renderable edge count.
	 */
	private static function count_edges( $edges ) {
		$count = 0;

		foreach ( $edges as $edge ) {
			if ( ! is_array( $edge ) ) {
				continue;
			}

			if ( self::vertex_index( self::value( $edge, 'v1' ) ) >= 0
				&& self::vertex_index( self::value( $edge, 'v2' ) ) >= 0 ) {
				++$count;
			}
		}

		return $count;
	}

	/**
	 * Count the faces that resolve to at least three usable vertices.
	 *
	 * @param array $faces Raw face records.
	 * @return int Renderable face count.
	 */
	private static function count_faces( $faces ) {
		$count = 0;

		foreach ( $faces as $face ) {
			if ( ! is_array( $face ) || ! isset( $face['vertices'] ) || ! is_array( $face['vertices'] ) ) {
				continue;
			}

			$resolved = 0;
			foreach ( $face['vertices'] as $index ) {
				if ( self::vertex_index( $index ) >= 0 ) {
					++$resolved;
				}
			}

			if ( $resolved >= 3 ) {
				++$count;
			}
		}

		return $count;
	}

	/**
	 * Fold a raw 1-based vertex reference to a 0-based index.
	 *
	 * @param mixed $index Raw index.
	 * @return int Zero-based index, or -1 when unset.
	 */
	private static function vertex_index( $index ) {
		if ( ! is_numeric( $index ) || ! $index ) {
			return -1;
		}

		return (int) abs( $index ) - 1;
	}

	/**
	 * Reduce one source definition, dropping the response and spectrum payloads.
	 *
	 * @param array $entry Raw `source_definitions[]` entry.
	 * @return array Subset source definition.
	 */
	private static function source( $entry ) {
		$entry      = is_array( $entry ) ? $entry : array();
		$definition = self::sub( $entry, 'definition' );

		$out = array();
		if ( array_key_exists( 'key', $entry ) ) {
			$out['Key'] = $entry['key'];
		}
		if ( array_key_exists( 'label', $definition ) ) {
			$out['Label'] = $definition['label'];
		}

		$out['Definition'] = self::pick(
			$definition,
			array(
				'Label'                => 'label',
				'CompanyLabel'         => 'company_label',
				'DataType'             => 'data_type',
				'NominalBandwidthFrom' => 'nominal_bandwidth_from',
				'NominalBandwidthTo'   => 'nominal_bandwidth_to',
				'OnAxisLevel'          => 'on_axis_level',
				'RatedHorizontalAngle' => 'rated_horizontal_angle',
				'RatedVerticalAngle'   => 'rated_vertical_angle',
			)
		);

		// Explicitly null rather than absent: the overview distinguishes "no
		// balloon block" from "a balloon whose fields are unset".
		$balloon                          = self::value( $definition, 'balloon_data' );
		$out['Definition']['BalloonData'] = is_array( $balloon ) ? self::balloon( $balloon ) : null;
		$out['ResponseCount']             = self::response_count( $entry, $balloon );

		return $out;
	}

	/**
	 * Map a balloon block to its counts and grid.
	 *
	 * @param array $balloon Raw `balloon_data` block.
	 * @return array Subset balloon data.
	 */
	private static function balloon( $balloon ) {
		$angular = self::sub( $balloon, 'angular_resolution' );

		return array(
			'ResponseCount'     => self::value( $balloon, 'response_count' ),
			'AngularResolution' => array(
				'MeridianStep' => self::value( $angular, 'meridian_step' ),
				'ParallelStep' => self::value( $angular, 'parallel_step' ),
				'Symmetry'     => self::value( $angular, 'symmetry' ),
				'FrontHalfOnly' => self::value( $angular, 'front_half_only' ),
			),
		);
	}

	/**
	 * How many measured responses a source carries.
	 *
	 * Prefers the parser's flat `responses` list and falls back to the balloon
	 * block's own, matching the normalizer.
	 *
	 * @param array $entry   Raw source entry.
	 * @param mixed $balloon Raw balloon block, or null.
	 * @return int Response count.
	 */
	private static function response_count( $entry, $balloon ) {
		if ( isset( $entry['responses'] ) && is_array( $entry['responses'] ) ) {
			return count( $entry['responses'] );
		}

		if ( is_array( $balloon ) && isset( $balloon['responses'] ) && is_array( $balloon['responses'] ) ) {
			return count( $balloon['responses'] );
		}

		return 0;
	}

	/**
	 * Map a box type.
	 *
	 * @param array $box Raw `box_types[]` entry.
	 * @return array Subset box type.
	 */
	private static function box_type( $box ) {
		$box = is_array( $box ) ? $box : array();

		$out = self::pick(
			$box,
			array(
				'Label'  => 'label',
				'Key'    => 'key',
				'Weight' => 'weight',
			)
		);

		$out['Sources']          = self::list_of( $box, 'sources' );
		$out['ReferencePoint']   = self::point( self::value( $box, 'reference_point' ) );
		$out['CenterOfMass']     = self::point( self::value( $box, 'center_of_mass' ) );
		$out['NextPivot']        = self::point( self::value( $box, 'next_pivot' ) );
		$out['SourcePlacements'] = array_map(
			array( __CLASS__, 'placement' ),
			self::list_of( $box, 'source_placements' )
		);

		return $out + self::pick(
			$box,
			array(
				'HorizontalOpeningAngle' => 'horizontal_opening_angle',
				'VerticalOpeningAngle'   => 'vertical_opening_angle',
			)
		);
	}

	/**
	 * Map a source placement.
	 *
	 * The raw `angles` block spells its members x/y/z; they are heading,
	 * vertical and roll, and are renamed here as the normalizer does.
	 *
	 * @param array $placement Raw `source_placements[]` entry.
	 * @return array Subset placement.
	 */
	private static function placement( $placement ) {
		$placement = is_array( $placement ) ? $placement : array();

		$out = self::pick(
			$placement,
			array(
				'Label'               => 'label',
				'Key'                 => 'key',
				'SourceDefinitionKey' => 'source_def_key',
			)
		);

		$out['Position'] = self::point( self::value( $placement, 'position' ) );

		$angles          = self::value( $placement, 'angles' );
		$out['Rotation'] = is_array( $angles )
			? array(
				'Heading'  => self::value( $angles, 'x' ),
				'Vertical' => self::value( $angles, 'y' ),
				'Roll'     => self::value( $angles, 'z' ),
			)
			: null;

		return $out;
	}

	/**
	 * Map a frame.
	 *
	 * `type_flown` is a byte describing the frame type; the raw name describes
	 * the storage rather than the meaning, so it is surfaced as a boolean.
	 * `CaseGeometryIndex` starts at -1 and is filled in by `case_geometries()`.
	 *
	 * @param array $frame Raw `frames[]` entry.
	 * @return array Subset frame.
	 */
	private static function frame( $frame ) {
		$frame = is_array( $frame ) ? $frame : array();

		$out = self::pick(
			$frame,
			array(
				'Label' => 'label',
				'Key'   => 'key',
			)
		);

		$out['IsFlown'] = (bool) self::value( $frame, 'type_flown' );

		$out += self::pick( $frame, array( 'Weight' => 'weight' ) );

		$out['CenterOfMass'] = self::point( self::value( $frame, 'center_of_mass' ) );
		$out['NextPivot']    = self::point( self::value( $frame, 'next_pivot' ) );
		$out['PinPoints']    = array_map(
			array( __CLASS__, 'pin_point' ),
			self::list_of( $frame, 'pin_points' )
		);
		$out['CaseGeometryIndex'] = -1;

		return $out;
	}

	/**
	 * Map a frame pin point.
	 *
	 * @param array $pin Raw `pin_points[]` entry.
	 * @return array Subset pin point.
	 */
	private static function pin_point( $pin ) {
		$pin = is_array( $pin ) ? $pin : array();

		$out = self::pick( $pin, array( 'Label' => 'label' ) );

		$out['Vector'] = self::point( self::value( $pin, 'vector' ) );

		return $out;
	}

	/**
	 * Map a rigging limit, without its translated label.
	 *
	 * @param array $limit Raw `limits[]` entry.
	 * @return array Subset limit.
	 */
	private static function limit_entry( $limit ) {
		$limit = is_array( $limit ) ? $limit : array();

		return self::pick(
			$limit,
			array(
				'Frame'   => 'frame',
				'BoxType' => 'box_type',
				'Type'    => 'type',
				'Value'   => 'limit_value',
			)
		);
	}

	/**
	 * Map a rigging warning, without its translated label.
	 *
	 * @param array $warning Raw `warnings[]` entry.
	 * @return array Subset warning.
	 */
	private static function warning_entry( $warning ) {
		$warning = is_array( $warning ) ? $warning : array();

		return self::pick(
			$warning,
			array(
				'Frame' => 'frame',
				'Type'  => 'type',
				'Text'  => 'text',
				'Value' => 'limit_value',
			)
		);
	}

	/**
	 * Map a filter group.
	 *
	 * @param array $group Raw `filter_groups[]` entry.
	 * @return array Subset filter group.
	 */
	private static function filter_group( $group ) {
		$group = is_array( $group ) ? $group : array();

		$out = self::pick(
			$group,
			array(
				'Label'         => 'label',
				'Key'           => 'key',
				'IsOverridable' => 'is_overridable',
			)
		);

		$out['Filters'] = array_map(
			array( __CLASS__, 'filter_entry' ),
			self::list_of( $group, 'filters' )
		);

		return $out;
	}

	/**
	 * Map one entry of a filter group: a labelled wrapper around a bank.
	 *
	 * @param array $entry Raw `filter_groups[].filters[]` entry.
	 * @return array Subset entry.
	 */
	private static function filter_entry( $entry ) {
		$entry = is_array( $entry ) ? $entry : array();

		$out = self::pick(
			$entry,
			array(
				'Label' => 'label',
				'Key'   => 'key',
			)
		);

		$out['Bank'] = self::filter_bank( self::value( $entry, 'filter' ) );

		return $out;
	}

	/**
	 * Map a generic filter bank.
	 *
	 * @param mixed $bank Raw filter bank.
	 * @return array|null Subset bank, or null when absent.
	 */
	private static function filter_bank( $bank ) {
		if ( ! is_array( $bank ) ) {
			return null;
		}

		$out = self::pick(
			$bank,
			array(
				'Bypass'         => 'bypass',
				'InvertPolarity' => 'invert_polarity',
				'MuteInput'      => 'mute_input',
				'Gain'           => 'gain',
				'Delay'          => 'delay',
			)
		);

		$out['Filters'] = array_map(
			array( __CLASS__, 'generic_filter' ),
			self::list_of( $bank, 'filters' )
		);

		return $out;
	}

	/**
	 * Map one filter inside a bank, without its translated labels.
	 *
	 * @param array $filter Raw filter entry.
	 * @return array Subset filter.
	 */
	private static function generic_filter( $filter ) {
		$filter = is_array( $filter ) ? $filter : array();

		$out = array();
		if ( array_key_exists( 'filter_type', $filter ) ) {
			$out['Kind'] = $filter['filter_type'];
		}

		$out += self::pick(
			$filter,
			array(
				'Label'          => 'label',
				'Key'            => 'key',
				'Bypass'         => 'bypass',
				'InvertPolarity' => 'invert_polarity',
				'Gain'           => 'gain',
				'Delay'          => 'delay',
			)
		);

		$out['IIR']         = self::iir_params( self::value( $filter, 'iir_params' ) );
		$out['FIR']         = self::fir_data( self::value( $filter, 'fir_data' ) );
		$out['LogSpectrum'] = self::filter_log_spectrum( self::value( $filter, 'log_spectrum' ) );

		return $out;
	}

	/**
	 * Map the IIR parameters of a filter, without the shape and alignment text.
	 *
	 * @param mixed $iir Raw `iir_params` block.
	 * @return array|null Subset parameters, or null when absent.
	 */
	private static function iir_params( $iir ) {
		if ( ! is_array( $iir ) ) {
			return null;
		}

		return self::pick(
			$iir,
			array(
				'FilterType'  => 'filter_type',
				'FilterShape' => 'filter_shape',
				'Order'       => 'order',
				'FreqCritHz'  => 'freq_crit_hz',
				'Alignment'   => 'alignment',
				'QFactor'     => 'q_factor',
			)
		);
	}

	/**
	 * Map the FIR block of a filter.
	 *
	 * PAYLOAD GUARD: `data_irm` and `data_dip` are 8193 float64 each, roughly
	 * 131 KB per FIR filter, and the only thing any UI shows of them is how many
	 * coefficients there are.
	 *
	 * @param mixed $fir Raw `fir_data` block.
	 * @return array|null Subset FIR data, or null when absent.
	 */
	private static function fir_data( $fir ) {
		if ( ! is_array( $fir ) ) {
			return null;
		}

		$out = self::pick(
			$fir,
			array(
				'IsTimeResponse' => 'is_time_response',
				'IsComplex'      => 'is_complex',
				'IsEven'         => 'is_even',
				'SampleRate'     => 'sample_rate',
			)
		);

		$out['CoefficientCount'] = count( self::list_of( $fir, 'data_irm' ) );

		return $out;
	}

	/**
	 * Map the log-spectrum block of a filter.
	 *
	 * PAYLOAD GUARD: `level` and `phase` are reduced to presence booleans, for
	 * the same reason the FIR coefficients are counted rather than carried.
	 *
	 * @param mixed $spectrum Raw `log_spectrum` block.
	 * @return array|null Subset log spectrum, or null when absent.
	 */
	private static function filter_log_spectrum( $spectrum ) {
		if ( ! is_array( $spectrum ) ) {
			return null;
		}

		$out = self::pick(
			$spectrum,
			array(
				'BandsPerOctave'  => 'bands_per_octave',
				'LowestFrequency' => 'lowest_frequency',
				'NumberOfBands'   => 'number_of_bands',
				'Delay'           => 'delay',
			)
		);

		$out['HasLevel'] = (bool) self::value( $spectrum, 'level' );
		$out['HasPhase'] = (bool) self::value( $spectrum, 'phase' );

		return $out;
	}

	/**
	 * Map a 3D point, tolerating a missing source object.
	 *
	 * @param mixed $point Raw `{x, y, z}` point.
	 * @return array|null Point with lowercase members, or null.
	 */
	private static function point( $point ) {
		if ( ! is_array( $point ) ) {
			return null;
		}

		return array(
			'x' => self::value( $point, 'x' ),
			'y' => self::value( $point, 'y' ),
			'z' => self::value( $point, 'z' ),
		);
	}

	/**
	 * Copy a set of raw keys under new names, omitting the ones not present.
	 *
	 * Omission rather than nulling is what mirrors JavaScript's `undefined`,
	 * which `JSON.stringify` drops; see the note in the class docblock.
	 *
	 * @param array $source Raw block.
	 * @param array $map    Output key => raw key.
	 * @return array Mapped block.
	 */
	private static function pick( $source, $map ) {
		$out = array();

		foreach ( $map as $out_key => $raw_key ) {
			if ( is_array( $source ) && array_key_exists( $raw_key, $source ) ) {
				$out[ $out_key ] = $source[ $raw_key ];
			}
		}

		return $out;
	}

	/**
	 * A nested block, as an array.
	 *
	 * @param array  $source Raw parent.
	 * @param string $key    Member name.
	 * @return array The block, or an empty array.
	 */
	private static function sub( $source, $key ) {
		if ( is_array( $source ) && isset( $source[ $key ] ) && is_array( $source[ $key ] ) ) {
			return $source[ $key ];
		}

		return array();
	}

	/**
	 * A nested list, as a zero-indexed array.
	 *
	 * @param array  $source Raw parent.
	 * @param string $key    Member name.
	 * @return array The list, or an empty array.
	 */
	private static function list_of( $source, $key ) {
		$value = self::sub( $source, $key );

		return array_values( $value );
	}

	/**
	 * A raw member, or null when absent.
	 *
	 * @param array  $source Raw parent.
	 * @param string $key    Member name.
	 * @return mixed The value, or null.
	 */
	private static function value( $source, $key ) {
		if ( is_array( $source ) && array_key_exists( $key, $source ) ) {
			return $source[ $key ];
		}

		return null;
	}

	/**
	 * Insert a key immediately after another, preserving order.
	 *
	 * Only the goldens care about key order; nothing at runtime does.
	 *
	 * @param array  $array  Source array.
	 * @param string $after  Key to insert after.
	 * @param string $key    New key.
	 * @param mixed  $value  New value.
	 * @return array Reordered array.
	 */
	private static function insert_after( $array, $after, $key, $value ) {
		$out = array();

		foreach ( $array as $existing => $existing_value ) {
			$out[ $existing ] = $existing_value;
			if ( $existing === $after ) {
				$out[ $key ] = $value;
			}
		}

		return $out;
	}
}
