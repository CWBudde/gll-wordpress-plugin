/**
 * Normalize raw parser output into the shape the blocks consume.
 *
 * The Go parser emits snake_case keys mirroring the on-disk GLL structure,
 * while the block code and the shared utils read PascalCase and expect a few
 * derived conveniences (a flat `Database.CaseGeometries` list, edges with
 * named endpoints). This module is the single translation point: everything
 * downstream of `parseGLL()` sees the normalized shape.
 *
 * Large numeric arrays (level/phase/frequency spectra, vertex lists) are
 * passed through by reference — a balloon carries ~1300 responses of ~240
 * floats each, so copying them would be wasteful.
 *
 * @package
 */

/**
 * Detect data that is already normalized, so the function is idempotent.
 *
 * @param {Object} raw Parsed GLL data.
 * @return {boolean} True if the data already uses the normalized shape.
 */
function isNormalized( raw ) {
	return Boolean( raw && ( raw.Database || raw.GenSystem ) );
}

/**
 * Normalize a spectrum block ({definition, level, phase, delay}).
 *
 * The inner `definition` keeps its snake_case field names: `buildLogFrequencies`
 * in polar-utils reads `bands_per_octave` / `start_freq` / `point_count`
 * directly, so it is deliberately passed through untouched.
 *
 * @param {Object} spectrum Raw spectrum block.
 * @return {Object|null} Normalized spectrum, or null when absent.
 */
function normalizeSpectrum( spectrum ) {
	if ( ! spectrum ) {
		return null;
	}

	return {
		Definition: spectrum.definition,
		Level: spectrum.level,
		Phase: spectrum.phase,
		Delay: spectrum.delay,
	};
}

/**
 * Derive the frequency axis of a spectrum from its log-frequency definition.
 *
 * f_i = start_freq * 2^(i / bands_per_octave)
 *
 * @param {Object} definition Spectrum definition block.
 * @return {number[]|null} Frequencies in Hz, or null when underspecified.
 */
function deriveFrequencies( definition ) {
	if ( ! definition ) {
		return null;
	}

	const bands = definition.bands_per_octave;
	const start = definition.start_freq;
	const count = definition.point_count;

	if ( ! bands || ! start || ! count ) {
		return null;
	}

	const frequencies = new Array( count );
	for ( let i = 0; i < count; i++ ) {
		frequencies[ i ] = start * Math.pow( 2, i / bands );
	}

	return frequencies;
}

/**
 * Normalize one balloon response.
 *
 * Newer parser builds already provide a flat `responses` list carrying
 * `frequencies`; older ones only carry the nested balloon responses, which
 * store the frequency axis implicitly in their definition. Both are handled.
 *
 * @param {Object}   response    Raw response.
 * @param {number[]} frequencies Shared frequency axis to attach.
 * @return {Object} Normalized response.
 */
function normalizeResponse( response, frequencies ) {
	return {
		Frequencies: response.frequencies || frequencies,
		Level: response.level,
		Phase: response.phase,
		Delay: response.delay,
		Definition: response.definition,
	};
}

/**
 * Normalize a source definition entry.
 *
 * @param {Object} entry Raw `source_definitions[]` entry.
 * @return {Object} Normalized source.
 */
function normalizeSource( entry ) {
	const definition = entry.definition || {};
	const balloon = definition.balloon_data || {};
	const angular = balloon.angular_resolution || {};

	// Prefer the parser's flat response list; fall back to the balloon block.
	const rawResponses = Array.isArray( entry.responses )
		? entry.responses
		: balloon.responses || [];

	// Every response in a balloon shares one frequency axis, so derive it once
	// and hand the same array to all of them.
	const sharedFrequencies =
		rawResponses.length > 0
			? rawResponses[ 0 ].frequencies ||
			  deriveFrequencies( rawResponses[ 0 ].definition )
			: null;

	return {
		Key: entry.key,
		Label: definition.label,
		Definition: {
			Label: definition.label,
			CompanyLabel: definition.company_label,
			DataType: definition.data_type,
			NominalBandwidthFrom: definition.nominal_bandwidth_from,
			NominalBandwidthTo: definition.nominal_bandwidth_to,
			OnAxisLevel: definition.on_axis_level,
			OnAxisSpectrum: normalizeSpectrum( definition.on_axis_spectrum ),
			BalloonData: {
				ResponseCount: balloon.response_count,
				AngularResolution: {
					MeridianStep: angular.meridian_step,
					ParallelStep: angular.parallel_step,
					Symmetry: angular.symmetry,
					FrontHalfOnly: angular.front_half_only,
				},
			},
		},
		Responses: rawResponses.map( ( response ) =>
			normalizeResponse( response, sharedFrequencies )
		),
	};
}

/**
 * Normalize a 3D point, tolerating a missing source object.
 *
 * @param {Object} point Raw {x, y, z} point.
 * @return {Object|null} Normalized point or null.
 */
function normalizePoint( point ) {
	if ( ! point ) {
		return null;
	}
	return { x: point.x, y: point.y, z: point.z };
}

/**
 * Normalize a case geometry.
 *
 * Edges arrive as `{v1, v2}` vertex-index pairs, which none of the spellings
 * `parseEdge` accepts; they are re-expressed as `{A, B}`. GLL case geometries
 * carry no face list, so `Faces` stays empty and consumers fall back to the
 * edge wireframe.
 *
 * @param {Object} geometry Raw `case_geometry` block.
 * @param {Object} box      Owning raw box type, for reference points.
 * @return {Object|null} Normalized geometry or null.
 */
function normalizeCaseGeometry( geometry, box ) {
	if ( ! geometry ) {
		return null;
	}

	const edges = Array.isArray( geometry.edges )
		? geometry.edges.map( ( edge ) => ( {
				A: edge.v1,
				B: edge.v2,
				Label: edge.label,
		  } ) )
		: [];

	return {
		Vertices: geometry.vertices || [],
		Edges: edges,
		Faces: [],
		IsSymmetric: geometry.is_symmetric,
		ReferencePoint: normalizePoint( box && box.reference_point ),
		CenterOfMass: normalizePoint( box && box.center_of_mass ),
		NextPivot: normalizePoint( box && box.next_pivot ),
	};
}

/**
 * Normalize a source placement inside a box type.
 *
 * @param {Object} placement Raw `source_placements[]` entry.
 * @return {Object} Normalized placement.
 */
function normalizePlacement( placement ) {
	return {
		Label: placement.label,
		Key: placement.key,
		SourceDefinitionKey: placement.source_def_key,
		Position: normalizePoint( placement.position ),
		Rotation: placement.angles
			? {
					Heading: placement.angles.x,
					Vertical: placement.angles.y,
					Roll: placement.angles.z,
			  }
			: null,
	};
}

/**
 * Normalize a box type entry.
 *
 * @param {Object} box Raw `box_types[]` entry.
 * @return {Object} Normalized box type.
 */
function normalizeBoxType( box ) {
	return {
		Label: box.label,
		Key: box.key,
		Weight: box.weight,
		ReferencePoint: normalizePoint( box.reference_point ),
		CenterOfMass: normalizePoint( box.center_of_mass ),
		NextPivot: normalizePoint( box.next_pivot ),
		SourcePlacements: ( box.source_placements || [] ).map(
			normalizePlacement
		),
	};
}

/**
 * Normalize raw parser output for consumption by the blocks.
 *
 * Idempotent: data that already looks normalized is returned unchanged.
 *
 * @param {Object} raw Raw parser output.
 * @return {Object} Normalized GLL data.
 */
export function normalizeGllData( raw ) {
	if ( ! raw || typeof raw !== 'object' ) {
		return raw;
	}

	if ( isNormalized( raw ) ) {
		return raw;
	}

	const header = raw.header || {};
	const genSystem = raw.gen_system || {};
	const metadata = raw.metadata || {};
	const database = raw.database || {};
	const boxTypes = database.box_types || [];

	// The blocks address geometries by a flat index, but the parser nests one
	// geometry per box type.
	const caseGeometries = boxTypes
		.map( ( box ) => normalizeCaseGeometry( box.case_geometry, box ) )
		.filter( Boolean );

	return {
		Header: {
			Magic: header.magic,
			FormatId: header.format_id,
			FormatVersion: header.format_version,
			SubVersion: header.sub_version,
		},
		GenSystem: {
			Label: genSystem.label,
			Key: genSystem.key,
			Version: genSystem.version,
			SystemType: genSystem.type,
			Manufacturer: genSystem.company || metadata.manufacturer,
			InfoText: genSystem.info_text,
			CopyrightText: genSystem.copyright_text,
			WebsiteText: genSystem.website_text,
			EmailText: genSystem.email_text,
		},
		Metadata: {
			ProductName: metadata.product_name,
			DisplayName: metadata.display_name,
			Manufacturer: metadata.manufacturer,
			Description: metadata.description,
			Copyright: metadata.copyright,
			Website: metadata.website,
			Email: metadata.email,
		},
		Description: metadata.description,
		Database: {
			SourceDefinitions: ( database.source_definitions || [] ).map(
				normalizeSource
			),
			BoxTypes: boxTypes.map( normalizeBoxType ),
			CaseGeometries: caseGeometries,
		},
		Resources: raw.resources || [],
	};
}


/**
 * Replace a block header's "Loading …" line with the parsed system label.
 *
 * Every block's save() markup carries a `.gll-loading-text` paragraph in its
 * header. The views hide their spinner once data arrives but left this line
 * saying "Loading …" indefinitely.
 *
 * @param {HTMLElement} block Block root element.
 * @param {Object}      data  Normalized GLL data.
 */
export function setBlockHeaderLabel( block, data ) {
	const loadingText = block?.querySelector?.( '.gll-loading-text' );
	if ( ! loadingText ) {
		return;
	}

	const label =
		data?.GenSystem?.Label || data?.Metadata?.Description || '';
	loadingText.textContent = label;
}

export default normalizeGllData;
