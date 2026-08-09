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

import { __, _x, sprintf } from '@wordpress/i18n';

/**
 * The enum label tables below are FUNCTIONS, not the constant objects they used
 * to be, and that shape is load-bearing rather than a matter of taste.
 *
 * A module-level `const TABLE = { 0: __( 'Max Count', 'gll-info' ) }` is
 * evaluated when the module is imported, which in WordPress happens before the
 * translation data for the domain has been registered. `__()` would then return
 * the English source string, that string would be frozen into the table for the
 * lifetime of the page, and no translation would ever apply — silently, since
 * the English fallback looks like a correct result. Calling `__()` inside a
 * function defers the lookup to render time, by which point the domain is
 * loaded.
 *
 * Returning the fallback from the same function (rather than leaving
 * `|| 'Limit Type 7'` at the call site) keeps the two halves of one label
 * decision in one place, and gives the translators the `%d` string too.
 *
 * `IIR_SHAPE_LABELS` stays a plain constant on purpose: those values are proper
 * nouns (Butterworth, Linkwitz-Riley, …) and are not translated, so there is
 * nothing to defer.
 */

/**
 * Label for a rigging limit type, keyed by the raw `type` integer of a
 * `limits[]` entry.
 *
 * Go's `LimitType.String()` never crosses the JSON boundary — the parser
 * marshals the bare int32 — so the label table has to live here.
 *
 * This table is deliberately SEPARATE from `getWarningTypeLabel` below and the
 * two must not be merged: the numbering genuinely differs. Limit 1 is
 * 'Max Count Type' while warning 1 is 'Min Count Warning'. Value 3 is unused in
 * the limit numbering.
 *
 * @param {number} type Raw limit type integer.
 * @return {string} Translated label.
 */
export function getLimitTypeLabel( type ) {
	switch ( type ) {
		case 0:
			return __( 'Max Count', 'gll-info' );
		case 1:
			return __( 'Max Count Type', 'gll-info' );
		case 2:
			return __( 'Max Weight', 'gll-info' );
		case 4:
			return __( 'Max Tilt Angle', 'gll-info' );
		case 5:
			return __( 'Min Tilt Angle', 'gll-info' );
		case 6:
			return __( 'Min Count', 'gll-info' );
		default:
			return sprintf(
				/* translators: %d: raw numeric limit type from the GLL file. */
				__( 'Limit Type %d', 'gll-info' ),
				type
			);
	}
}

/**
 * Label for a rigging warning type, keyed by the raw `type` integer of a
 * `warnings[]` entry.
 *
 * Separate from `getLimitTypeLabel` above on purpose — see the note there. As
 * with limits, Go's `String()` does not cross the JSON boundary, so the bare
 * integer arrives and is mapped here.
 *
 * @param {number} type Raw warning type integer.
 * @return {string} Translated label.
 */
export function getWarningTypeLabel( type ) {
	switch ( type ) {
		case 0:
			return __( 'Max Count Warning', 'gll-info' );
		case 1:
			return __( 'Min Count Warning', 'gll-info' );
		case 2:
			return __( 'Max Weight Warning', 'gll-info' );
		case 3:
			return __( 'Max Tilt Warning', 'gll-info' );
		case 4:
			return __( 'Min Tilt Warning', 'gll-info' );
		default:
			return sprintf(
				/* translators: %d: raw numeric warning type from the GLL file. */
				__( 'Warning Type %d', 'gll-info' ),
				type
			);
	}
}

/**
 * Label for a filter kind, keyed by the raw `filter_type` of a generic filter.
 *
 * Unknown values stay undefined rather than falling back to a placeholder: the
 * kind is the leading token of a filter detail line, and the callers drop an
 * empty one instead of printing 'Filter Type 7'.
 *
 * @param {number} kind Raw filter type integer.
 * @return {string|undefined} Translated label, or undefined when unknown.
 */
export function getFilterKindLabel( kind ) {
	switch ( kind ) {
		case 0:
			return __( 'LogSpectrum', 'gll-info' );
		case 1:
			return __( 'IIR', 'gll-info' );
		case 2:
			return __( 'FIR', 'gll-info' );
		default:
			return undefined;
	}
}

/**
 * IIR filter shape labels, keyed by the raw `filter_shape` of `iir_params`.
 *
 * NOT translated, and therefore still a constant: every value is the surname of
 * the engineer the response is named after.
 */
export const IIR_SHAPE_LABELS = {
	0: 'Butterworth',
	1: 'Linkwitz-Riley',
	2: 'Bessel',
	3: 'Sallen-Key',
};

/**
 * Label for an IIR crossover alignment, keyed by the raw `alignment` of
 * `iir_params`.
 *
 * '-3 dB' and '-6 dB' are left as bare values: they are a number and a unit
 * symbol, identical in every locale.
 *
 * @param {number} alignment Raw alignment integer.
 * @return {string|undefined} Label, or undefined when unknown.
 */
export function getFilterAlignmentLabel( alignment ) {
	switch ( alignment ) {
		case 0:
			return _x( 'None', 'crossover alignment', 'gll-info' );
		case 1:
			return '-3 dB';
		case 2:
			return '-6 dB';
		case 3:
			return __( 'Phase-Matched', 'gll-info' );
		default:
			return undefined;
	}
}

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
 * Reduce a GLL-stored path to its base name.
 *
 * Embedded file names carry the authoring machine's relative path, using
 * Windows separators: `.\Drawings\CODA-logoLeft.PNG`, and in one corpus file a
 * two-level `.\Drawings\Logo Drawings\CODA-logoRight.PNG`. Include files
 * (the PDFs) carry no prefix at all, so this has to tolerate both.
 *
 * Folding happens here rather than in the render layer because it is a format
 * concern, of the same kind as the 1-based vertex indices and the `x/y/z`
 * rotation spelling this module already translates. A consumer that had to
 * know about `.\Drawings\` would defeat the point of a single translation
 * point.
 *
 * @param {string} filename Raw file name as stored in the GLL.
 * @return {string} Base name, or the input when it has no separators.
 */
function toBaseName( filename ) {
	const text = String( filename || '' );
	// `pop()` returns '' for a trailing separator, so fall back to the input.
	return text.replace( /\\/g, '/' ).split( '/' ).pop() || text;
}

/**
 * Normalize one embedded file record (an include file or a data file).
 *
 * Both parser records share a shape; include files additionally carry a
 * human-authored `label`, which is why documentation rows can show something
 * friendlier than a file name.
 *
 * Returns null for the blank padding entries described on
 * `normalizeEmbeddedFiles`.
 *
 * @param {Object} file Raw embedded file record.
 * @return {Object|null} Normalized record, or null when the slot is unused.
 */
function normalizeEmbeddedFile( file ) {
	if ( ! file ) {
		return null;
	}

	const filename = String( file.filename || '' ).trim();
	const size = Number( file.size );

	// An unused table slot, not a file. See normalizeEmbeddedFiles.
	if ( ! filename || ! Number.isFinite( size ) || size <= 0 ) {
		return null;
	}

	return {
		Label: file.label,
		Key: file.key,
		Filename: file.filename,
		Name: toBaseName( file.filename ),
		Size: size,
		DataUri: file.data_uri,
	};
}

/**
 * Normalize a list of embedded files, dropping unused slots.
 *
 * The parser emits these tables at their on-disk length, and real files leave
 * slots empty: every GLL in the reference corpus declares exactly two data
 * files, but a third of them fill only one, and `3Way-LR.gll` fills neither.
 * An unused slot is `{key: "", filename: "", size: 0}` — it carries no
 * information, so it is padding rather than data, and it is dropped here for
 * the same reason unrenderable edges and faces are.
 *
 * Note that a missing `data_uri` is deliberately *not* disqualifying. The WASM
 * layer omits it for records it declines to inline, and such a file still
 * exists and still deserves a row showing its name and size — it simply has no
 * download.
 *
 * @param {Array} files Raw embedded file records.
 * @return {Object[]} Normalized records, unused slots removed.
 */
function normalizeEmbeddedFiles( files ) {
	return ( files || [] ).map( normalizeEmbeddedFile ).filter( Boolean );
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
			RatedHorizontalAngle: definition.rated_horizontal_angle,
			RatedVerticalAngle: definition.rated_vertical_angle,
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
 * Fold a raw 1-based GLL vertex reference to a 0-based index.
 *
 * A negative index refers to the mirrored twin of that vertex and 0 means
 * "unset". Twins are not reconstructed here, so a mirrored reference resolves
 * to the original vertex; see `internal/viz/geometry.go` in gll-tools for the
 * full mirroring rule.
 *
 * @param {number} index Raw 1-based index.
 * @return {number} Zero-based index, or -1 when unset.
 */
function toVertexIndex( index ) {
	if ( ! index || ! Number.isFinite( index ) ) {
		return -1;
	}
	return Math.abs( index ) - 1;
}

/**
 * Normalize one case-geometry edge.
 *
 * Raw edges are `{v1, v2, color, label, has_twin}` using the same 1-based,
 * negative-means-twin convention as faces. `parseEdge` in geometry-utils
 * indexes the vertex list directly, so the pair is folded to 0-based here.
 *
 * @param {Object} edge Raw `edges[]` entry.
 * @return {Object|null} Normalized edge, or null when either end is unset.
 */
function normalizeEdge( edge ) {
	if ( ! edge ) {
		return null;
	}

	const a = toVertexIndex( edge.v1 );
	const b = toVertexIndex( edge.v2 );
	if ( a < 0 || b < 0 ) {
		return null;
	}

	return {
		A: a,
		B: b,
		Color: edge.color,
		Label: edge.label,
	};
}

/**
 * Normalize one case-geometry face.
 *
 * Raw faces are `{vertices, color, label, has_twin}` where `vertices` holds
 * 1-based indices and a negative index refers to the mirrored twin of that
 * vertex (0 is "unset"). `parseFace` in geometry-utils indexes the vertex list
 * directly, so the indices are folded to 0-based absolutes here, mirroring
 * `internal/viz/geometry.go` in gll-tools.
 *
 * @param {Object} face Raw `faces[]` entry.
 * @return {Object|null} Normalized face, or null when it has too few indices.
 */
function normalizeFace( face ) {
	if ( ! face || ! Array.isArray( face.vertices ) ) {
		return null;
	}

	const indices = [];
	face.vertices.forEach( ( index ) => {
		const resolved = toVertexIndex( index );
		if ( resolved >= 0 ) {
			indices.push( resolved );
		}
	} );

	if ( indices.length < 3 ) {
		return null;
	}

	return {
		Indices: indices,
		Color: face.color,
		Label: face.label,
	};
}

/**
 * Normalize a case geometry.
 *
 * Edges arrive as `{v1, v2}` vertex-index pairs, which none of the spellings
 * `parseEdge` accepts; they are re-expressed as 0-based `{A, B}`.
 *
 * Faces are handled the same way, for sub-version >= 1 where the parser emits
 * them. In practice none of the 54 case geometries in the gll-tools test corpus
 * carries a face list, so the rendered geometry is the edge wireframe and the
 * `showFaces` toggle has nothing to show. The mapping is kept because the
 * format allows faces and the parser reads them.
 *
 * The geometry is made self-describing: the blocks address geometries by their
 * position in the flat `Database.CaseGeometries` list, which does not line up
 * with `Database.BoxTypes` once a box lacks a `case_geometry`. Carrying the
 * owner identity and its placements along removes the need to correlate by
 * index. `SourcePlacements` is shared by reference with the normalized box
 * type.
 *
 * Both box types and frames own a case geometry, so the owner is generic. The
 * legacy `BoxIndex`/`BoxKey`/`BoxLabel` fields are set for boxes ONLY and left
 * undefined for frames — `src/geometry/edit.tsx` reads `BoxLabel || BoxKey` and
 * repurposing them for frames would relabel existing box geometries. Use
 * `OwnerKind`/`OwnerIndex`/`OwnerKey`/`OwnerLabel` for new code.
 *
 * Frames carry no `reference_point`, no `source_placements` and no opening
 * angles; `normalizePoint` returns null for the missing points, which is what
 * the render layer already expects.
 *
 * @param {Object} geometry        Raw `case_geometry` block.
 * @param {Object} owner           Owning raw box type or frame.
 * @param {Object} normalizedOwner Owning normalized record, for placements.
 * @param {number} ownerIndex      Index of the owner in its own raw list.
 * @param {string} ownerKind       Either 'box' or 'frame'.
 * @return {Object|null} Normalized geometry or null.
 */
function normalizeCaseGeometry(
	geometry,
	owner,
	normalizedOwner,
	ownerIndex,
	ownerKind
) {
	if ( ! geometry ) {
		return null;
	}

	const edges = Array.isArray( geometry.edges )
		? geometry.edges.map( normalizeEdge ).filter( Boolean )
		: [];

	const faces = Array.isArray( geometry.faces )
		? geometry.faces.map( normalizeFace ).filter( Boolean )
		: [];

	const isBox = ownerKind === 'box';

	return {
		Vertices: geometry.vertices || [],
		Edges: edges,
		Faces: faces,
		IsSymmetric: geometry.is_symmetric,
		SymmetryAxis: geometry.symmetry_axis,
		ReferencePoint: normalizePoint( owner && owner.reference_point ),
		CenterOfMass: normalizePoint( owner && owner.center_of_mass ),
		NextPivot: normalizePoint( owner && owner.next_pivot ),
		OwnerKind: ownerKind,
		OwnerIndex: ownerIndex,
		OwnerKey: owner && owner.key,
		OwnerLabel: owner && owner.label,
		BoxIndex: isBox ? ownerIndex : undefined,
		BoxKey: isBox ? owner && owner.key : undefined,
		BoxLabel: isBox ? owner && owner.label : undefined,
		SourcePlacements: normalizedOwner
			? normalizedOwner.SourcePlacements || []
			: [],
		HorizontalOpeningAngle: owner && owner.horizontal_opening_angle,
		VerticalOpeningAngle: owner && owner.vertical_opening_angle,
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
		Sources: box.sources || [],
		ReferencePoint: normalizePoint( box.reference_point ),
		CenterOfMass: normalizePoint( box.center_of_mass ),
		NextPivot: normalizePoint( box.next_pivot ),
		SourcePlacements: ( box.source_placements || [] ).map(
			normalizePlacement
		),
		HorizontalOpeningAngle: box.horizontal_opening_angle,
		VerticalOpeningAngle: box.vertical_opening_angle,
	};
}

/**
 * Normalize one frame pin point.
 *
 * @param {Object} pin Raw `pin_points[]` entry.
 * @return {Object} Normalized pin point.
 */
function normalizePinPoint( pin ) {
	return {
		Label: pin.label,
		Vector: normalizePoint( pin.vector ),
	};
}

/**
 * Normalize a frame entry.
 *
 * `CaseGeometryIndex` is filled in by `normalizeGllData`, which alone knows
 * where the frame's geometry landed in the combined `CaseGeometries` list.
 *
 * The raw `type_flown` field is a byte describing the frame type; the name
 * describes the storage, not the meaning, so it is surfaced as the boolean
 * `IsFlown`.
 *
 * @param {Object} frame Raw `frames[]` entry.
 * @return {Object} Normalized frame.
 */
function normalizeFrame( frame ) {
	return {
		Label: frame.label,
		Key: frame.key,
		IsFlown: Boolean( frame.type_flown ),
		Weight: frame.weight,
		CenterOfMass: normalizePoint( frame.center_of_mass ),
		NextPivot: normalizePoint( frame.next_pivot ),
		PinPoints: ( frame.pin_points || [] ).map( normalizePinPoint ),
		CaseGeometryIndex: -1,
	};
}

/**
 * Normalize a rigging limit entry.
 *
 * @param {Object} limit Raw `limits[]` entry.
 * @return {Object} Normalized limit.
 */
function normalizeLimit( limit ) {
	const type = limit.type;
	return {
		Frame: limit.frame,
		BoxType: limit.box_type,
		Type: type,
		TypeLabel: getLimitTypeLabel( type ),
		Value: limit.limit_value,
	};
}

/**
 * Normalize a rigging warning entry.
 *
 * @param {Object} warning Raw `warnings[]` entry.
 * @return {Object} Normalized warning.
 */
function normalizeWarning( warning ) {
	const type = warning.type;
	return {
		Frame: warning.frame,
		Type: type,
		TypeLabel: getWarningTypeLabel( type ),
		Text: warning.text,
		Value: warning.limit_value,
	};
}

/**
 * Normalize the IIR parameter block of a generic filter.
 *
 * @param {Object} iir Raw `iir_params` block.
 * @return {Object|null} Normalized parameters, or null when absent.
 */
function normalizeIirParams( iir ) {
	if ( ! iir ) {
		return null;
	}

	return {
		FilterType: iir.filter_type,
		FilterShape: iir.filter_shape,
		FilterShapeLabel: IIR_SHAPE_LABELS[ iir.filter_shape ],
		Order: iir.order,
		FreqCritHz: iir.freq_crit_hz,
		Alignment: iir.alignment,
		AlignmentLabel: getFilterAlignmentLabel( iir.alignment ),
		QFactor: iir.q_factor,
	};
}

/**
 * Normalize the FIR data block of a generic filter.
 *
 * PAYLOAD GUARD: `fir_data.data_irm` and `fir_data.data_dip` are 8193 float64
 * EACH, roughly 131 KB per FIR filter, and the only thing any UI shows of them
 * is how many coefficients there are. Only that count is carried; the arrays
 * themselves are never referenced from the normalized shape, so they can be
 * collected with the raw parser output. This is the same reasoning that dropped
 * `raw.resources` in Phase 9: a large payload with no consumer is not data, it
 * is retained memory.
 *
 * @param {Object} fir Raw `fir_data` block.
 * @return {Object|null} Normalized FIR data, or null when absent.
 */
function normalizeFirData( fir ) {
	if ( ! fir ) {
		return null;
	}

	return {
		IsTimeResponse: fir.is_time_response,
		IsComplex: fir.is_complex,
		IsEven: fir.is_even,
		SampleRate: fir.sample_rate,
		CoefficientCount: ( fir.data_irm || [] ).length,
	};
}

/**
 * Normalize the log-spectrum block of a generic filter.
 *
 * PAYLOAD GUARD: `level` and `phase` are reduced to presence booleans for the
 * same reason the FIR coefficient arrays are dropped — Phase 10 renders no
 * filter response chart, so the arrays have no consumer and carrying them would
 * pin the raw spectra in memory for every filter of every group.
 *
 * @param {Object} spectrum Raw `log_spectrum` block.
 * @return {Object|null} Normalized log spectrum, or null when absent.
 */
function normalizeFilterLogSpectrum( spectrum ) {
	if ( ! spectrum ) {
		return null;
	}

	return {
		BandsPerOctave: spectrum.bands_per_octave,
		LowestFrequency: spectrum.lowest_frequency,
		NumberOfBands: spectrum.number_of_bands,
		Delay: spectrum.delay,
		HasLevel: Boolean( spectrum.level ),
		HasPhase: Boolean( spectrum.phase ),
	};
}

/**
 * Normalize one generic filter inside a filter bank.
 *
 * @param {Object} filter Raw filter entry.
 * @return {Object} Normalized filter.
 */
function normalizeGenericFilter( filter ) {
	return {
		Kind: filter.filter_type,
		KindLabel: getFilterKindLabel( filter.filter_type ),
		Label: filter.label,
		Key: filter.key,
		Bypass: filter.bypass,
		InvertPolarity: filter.invert_polarity,
		Gain: filter.gain,
		Delay: filter.delay,
		IIR: normalizeIirParams( filter.iir_params ),
		FIR: normalizeFirData( filter.fir_data ),
		LogSpectrum: normalizeFilterLogSpectrum( filter.log_spectrum ),
	};
}

/**
 * Normalize a generic filter bank.
 *
 * @param {Object} bank Raw filter bank (`filters[].filter`).
 * @return {Object|null} Normalized bank, or null when the filter is absent.
 */
function normalizeFilterBank( bank ) {
	if ( ! bank ) {
		return null;
	}

	return {
		Bypass: bank.bypass,
		InvertPolarity: bank.invert_polarity,
		MuteInput: bank.mute_input,
		Gain: bank.gain,
		Delay: bank.delay,
		Filters: ( bank.filters || [] ).map( normalizeGenericFilter ),
	};
}

/**
 * Normalize a filter group entry.
 *
 * @param {Object} group Raw `filter_groups[]` entry.
 * @return {Object} Normalized filter group.
 */
function normalizeFilterGroup( group ) {
	return {
		Label: group.label,
		Key: group.key,
		IsOverridable: group.is_overridable,
		Filters: ( group.filters || [] ).map( ( entry ) => ( {
			Label: entry.label,
			Key: entry.key,
			Bank: normalizeFilterBank( entry.filter ),
		} ) ),
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
	const frames = database.frames || [];

	// The blocks address geometries by a flat index, but the parser nests one
	// geometry per box type — and boxes without a geometry drop out, so the two
	// lists do not line up. Each geometry therefore carries its owning box.
	const normalizedBoxTypes = boxTypes.map( normalizeBoxType );
	const boxGeometries = boxTypes
		.map( ( box, i ) =>
			normalizeCaseGeometry(
				box.case_geometry,
				box,
				normalizedBoxTypes[ i ],
				i,
				'box'
			)
		)
		.filter( Boolean );

	// Frames own a case geometry too, and they are APPENDED rather than
	// interleaved. `src/geometry/view.ts:167` and `src/geometry/edit.tsx:199`
	// index `CaseGeometries` POSITIONALLY against a `geometryIndex` block
	// attribute saved in existing posts, so every box geometry has to keep the
	// position it had before frames were carried — otherwise a saved post would
	// silently start showing a different geometry.
	const normalizedFrames = frames.map( normalizeFrame );
	const frameGeometries = [];
	frames.forEach( ( frame, i ) => {
		const geometry = normalizeCaseGeometry(
			frame.case_geometry,
			frame,
			normalizedFrames[ i ],
			i,
			'frame'
		);
		if ( ! geometry ) {
			return;
		}
		normalizedFrames[ i ].CaseGeometryIndex =
			boxGeometries.length + frameGeometries.length;
		frameGeometries.push( geometry );
	} );

	const caseGeometries = [ ...boxGeometries, ...frameGeometries ];

	// `raw.resources` — the parser's heuristic byte scan for embedded PNG and
	// zlib blobs — is deliberately not carried over. Across the reference
	// corpus its PNG entries duplicate `data_files` byte for byte, base64
	// payload included, and every one of its zlib entries turned out to lie
	// inside an embedded PDF (they are that PDF's own object and font
	// streams). Keeping it meant retaining a second copy of every embedded
	// image for a consumer that never existed.
	//
	// `database.author_files` never reaches us at all: the WASM layer drops it
	// on purpose, as those are encrypted licence blobs whose names leak the
	// author's absolute paths.
	//
	// A box type's `input_config` is likewise not normalized: it is populated in
	// 0 of the 29 corpus files, so normalizing it would ship translation code no
	// test could exercise behind a UI branch no reviewer could see rendered.
	//
	// `database.connectors`, `database.cluster_setups` and
	// `database.transformers` also remain dropped; they are understood and
	// available whenever a later phase grows a consumer for them.
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
			BoxTypes: normalizedBoxTypes,
			CaseGeometries: caseGeometries,
			Frames: normalizedFrames,
			Limits: ( database.limits || [] ).map( normalizeLimit ),
			Warnings: ( database.warnings || [] ).map( normalizeWarning ),
			FilterGroups: ( database.filter_groups || [] ).map(
				normalizeFilterGroup
			),
			IncludeFiles: normalizeEmbeddedFiles( database.include_files ),
			DataFiles: normalizeEmbeddedFiles( database.data_files ),
		},
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

	const label = data?.GenSystem?.Label || data?.Metadata?.Description || '';
	loadingText.textContent = label;
}

export default normalizeGllData;
