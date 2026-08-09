/**
 * Reduce a normalized parse to the subset the cached blocks render.
 *
 * `gll-normalize.ts` translates the parser's snake_case output into the shape
 * the blocks consume, and drops what nothing renders. This module goes one step
 * further for one purpose: producing something small enough to store on the
 * attachment and serve over REST, so a page whose blocks only need this subset
 * never downloads the 4.2 MB WASM parser at all.
 *
 * It takes ALREADY-NORMALIZED data rather than raw parser output, so it composes
 * with `normalizeGllData()` instead of duplicating any of it.
 *
 * PAYLOAD GUARDS — this is the whole point of the module, so the omissions are
 * the contract:
 *
 * - `SourceDefinitions[].Responses` is replaced by `ResponseCount`. Those arrays
 *   are the bulk of the 228.7 MB a large parse produces (a balloon carries ~1300
 *   responses of ~240 floats each), and the overview renders only how many there
 *   are. `frequency-response`, `polar-plot` and `balloon-3d` need the arrays and
 *   therefore keep parsing WASM; they are not served from this cache.
 * - `Definition.OnAxisSpectrum` goes with them. Only `frequency-response` and
 *   `polar-plot` read it, and neither is a cached block.
 * - `CaseGeometries[].Vertices/Edges/Faces` are replaced by counts. `config`
 *   renders "N vertices, N edges, N faces" and nothing else; the `geometry`
 *   block needs the real meshes and keeps parsing WASM.
 * - `IncludeFiles` and `DataFiles` are dropped entirely. They carry base64
 *   `data:` URIs — the largest embedded datasheet in the reference corpus is
 *   2.17 MB — and belong to the `resources` block, which is not cached.
 *
 * NO TRANSLATED TEXT IS CACHED. The normalizer attaches `TypeLabel`,
 * `KindLabel`, `FilterShapeLabel` and `AlignmentLabel` by calling `__()`, and a
 * cached payload outlives the locale it was built in — a subset generated on
 * upload by a server backend, or by an English-speaking author in the editor,
 * would otherwise pin English labels for every later visitor. Only the raw enum
 * integers are stored; `hydrateSubsetLabels()` re-derives the text at render
 * time, in the reader's locale, from the same tables the editor uses. This is
 * also why `GLL_Subset::from_raw()` needs no label tables at all.
 *
 * Anything added here must survive `GLL_Cache::validate()` on the PHP side and
 * stay under its byte cap, and must be mirrored by `GLL_Subset::from_raw()`,
 * which builds the same shape from raw parser output for the server-side
 * backends. The two implementations are pinned against one golden fixture.
 *
 * @package
 */

import {
	IIR_SHAPE_LABELS,
	getFilterAlignmentLabel,
	getFilterKindLabel,
	getLimitTypeLabel,
	getWarningTypeLabel,
} from './gll-normalize';

/**
 * Shape version of the subset.
 *
 * Stored alongside the cached payload; a bump invalidates every cache in the
 * wild, because a subset built by an older plugin may be missing a field the new
 * renderer reads. Must equal `GLL_Subset::VERSION` in PHP.
 */
export const SUBSET_VERSION = 1;

/**
 * How many measured responses a source carries.
 *
 * Works on both shapes on purpose: the editor renders from a full parse, where
 * the responses are present as an array, and the frontend renders from the
 * subset, where only the count survives. One accessor lets both use the same
 * renderer.
 *
 * @param {Object} source Normalized or subset source definition.
 * @return {number} Response count, 0 when there are none.
 */
export function sourceResponseCount( source ) {
	if ( typeof source?.ResponseCount === 'number' ) {
		return source.ResponseCount;
	}

	return source?.Responses?.length || 0;
}

/**
 * Vertex, edge and face counts of a case geometry.
 *
 * Reads the counts from the subset when present and falls back to measuring the
 * arrays of a full parse, for the same reason as `sourceResponseCount()`.
 *
 * The counts are equivalent either way: the normalizer filters unrenderable
 * edges and faces out before this ever sees them, so the `config` block and the
 * 3D `geometry` block can never disagree about the same mesh.
 *
 * @param {Object} geometry Normalized or subset case geometry.
 * @return {Object} `{Vertices, Edges, Faces}` counts.
 */
export function geometryCounts( geometry ) {
	return {
		Vertices:
			typeof geometry?.VertexCount === 'number'
				? geometry.VertexCount
				: ( geometry?.Vertices || [] ).length,
		Edges:
			typeof geometry?.EdgeCount === 'number'
				? geometry.EdgeCount
				: ( geometry?.Edges || [] ).length,
		Faces:
			typeof geometry?.FaceCount === 'number'
				? geometry.FaceCount
				: ( geometry?.Faces || [] ).length,
	};
}

/**
 * Reduce one source definition, dropping the response and spectrum payloads.
 *
 * @param {Object} source Normalized source definition.
 * @return {Object} Subset source definition.
 */
function subsetSource( source ) {
	const definition = source?.Definition || {};

	return {
		Key: source?.Key,
		Label: source?.Label,
		Definition: {
			Label: definition.Label,
			CompanyLabel: definition.CompanyLabel,
			DataType: definition.DataType,
			NominalBandwidthFrom: definition.NominalBandwidthFrom,
			NominalBandwidthTo: definition.NominalBandwidthTo,
			OnAxisLevel: definition.OnAxisLevel,
			RatedHorizontalAngle: definition.RatedHorizontalAngle,
			RatedVerticalAngle: definition.RatedVerticalAngle,
			// Null and undefined are not interchangeable here: the normalizer
			// emits null to mean "this source has no balloon block", and the
			// overview branches on it.
			BalloonData: definition.BalloonData || null,
		},
		ResponseCount: sourceResponseCount( source ),
	};
}

/**
 * Reduce one case geometry to its identity and its mesh counts.
 *
 * `OwnerKind` and `BoxIndex` are load-bearing rather than informational:
 * `findBoxGeometry()` in `src/config/config-model.ts` matches on exactly those
 * two, because positions in the flat geometry list do not line up with
 * `BoxTypes`. Dropping either would silently blank every box's summary.
 *
 * @param {Object} geometry Normalized case geometry.
 * @return {Object} Subset case geometry.
 */
function subsetGeometry( geometry ) {
	const counts = geometryCounts( geometry );

	return {
		OwnerKind: geometry?.OwnerKind,
		OwnerIndex: geometry?.OwnerIndex,
		OwnerKey: geometry?.OwnerKey,
		OwnerLabel: geometry?.OwnerLabel,
		BoxIndex: geometry?.BoxIndex,
		BoxKey: geometry?.BoxKey,
		BoxLabel: geometry?.BoxLabel,
		IsSymmetric: geometry?.IsSymmetric,
		SymmetryAxis: geometry?.SymmetryAxis,
		VertexCount: counts.Vertices,
		EdgeCount: counts.Edges,
		FaceCount: counts.Faces,
	};
}

/**
 * Strip the derived label from a limit or warning.
 *
 * @param {Object} entry Normalized limit or warning.
 * @return {Object} The same entry without `TypeLabel`.
 */
function withoutTypeLabel( entry ) {
	const { TypeLabel, ...rest } = entry || {};
	return rest;
}

/**
 * Strip the derived labels from a filter group's filters.
 *
 * @param {Object} group Normalized filter group.
 * @return {Object} Filter group carrying enums but no label text.
 */
function subsetFilterGroup( group ) {
	return {
		...group,
		Filters: ( group?.Filters || [] ).map( ( entry ) => ( {
			...entry,
			Bank: entry?.Bank
				? {
						...entry.Bank,
						Filters: ( entry.Bank.Filters || [] ).map(
							( filter ) => {
								// `KindLabel` is dropped; `IIR` keeps both
								// its position and its null. Destructuring
								// `IIR` out here instead would move it to
								// the end of the object and make it vanish
								// entirely when null — which the PHP twin
								// would then have to reproduce as an
								// accident rather than as a rule.
								const { KindLabel, ...rest } = filter || {};
								if ( ! rest.IIR ) {
									return rest;
								}

								const {
									FilterShapeLabel,
									AlignmentLabel,
									...iir
								} = rest.IIR;
								return { ...rest, IIR: iir };
							}
						),
				  }
				: entry?.Bank,
		} ) ),
	};
}

/**
 * Re-attach every translated label a subset deliberately does not carry.
 *
 * Mutates nothing: returns a new object in the normalized shape the renderers
 * already read, with the labels derived in the *current* locale. Call this on
 * anything that came out of the cache, before handing it to a renderer.
 *
 * Idempotent, and safe on a full parse that already has its labels — the tables
 * are pure functions of the enum, so re-deriving reproduces the same values.
 *
 * @param {Object} subset Cached display subset.
 * @return {Object|null} Subset with labels attached.
 */
export function hydrateSubsetLabels( subset ) {
	if ( ! subset || typeof subset !== 'object' ) {
		return null;
	}

	const database = subset.Database || {};

	return {
		...subset,
		Database: {
			...database,
			Limits: ( database.Limits || [] ).map( ( limit ) => ( {
				...limit,
				TypeLabel: getLimitTypeLabel( limit?.Type ),
			} ) ),
			Warnings: ( database.Warnings || [] ).map( ( warning ) => ( {
				...warning,
				TypeLabel: getWarningTypeLabel( warning?.Type ),
			} ) ),
			FilterGroups: ( database.FilterGroups || [] ).map( ( group ) => ( {
				...group,
				Filters: ( group?.Filters || [] ).map( ( entry ) => ( {
					...entry,
					Bank: entry?.Bank
						? {
								...entry.Bank,
								Filters: ( entry.Bank.Filters || [] ).map(
									( filter ) => ( {
										...filter,
										KindLabel: getFilterKindLabel(
											filter?.Kind
										),
										IIR: filter?.IIR
											? {
													...filter.IIR,
													FilterShapeLabel:
														IIR_SHAPE_LABELS[
															filter.IIR
																.FilterShape
														],
													AlignmentLabel:
														getFilterAlignmentLabel(
															filter.IIR.Alignment
														),
											  }
											: filter?.IIR,
									} )
								),
						  }
						: entry?.Bank,
				} ) ),
			} ) ),
		},
	};
}

/**
 * Build the cacheable display subset of a normalized parse.
 *
 * @param {Object} data Normalized GLL data, as `normalizeGllData()` emits.
 * @return {Object|null} Subset, or null when the input is not a parse.
 */
export function buildDisplaySubset( data ) {
	if ( ! data || typeof data !== 'object' ) {
		return null;
	}

	const database = data.Database || {};

	return {
		Version: SUBSET_VERSION,
		Header: data.Header,
		GenSystem: data.GenSystem,
		Metadata: data.Metadata,
		Description: data.Description,
		Database: {
			SourceDefinitions: ( database.SourceDefinitions || [] ).map(
				subsetSource
			),
			// Carried whole: box types and frames are already scalar tables,
			// and the normalizer has done the reducing that matters — FIR
			// coefficients and filter spectra are counts and presence booleans
			// by the time they reach here.
			BoxTypes: database.BoxTypes || [],
			Frames: database.Frames || [],
			// Limits, warnings and filters lose only their derived label text;
			// see the locale note in the module docblock.
			Limits: ( database.Limits || [] ).map( withoutTypeLabel ),
			Warnings: ( database.Warnings || [] ).map( withoutTypeLabel ),
			FilterGroups: ( database.FilterGroups || [] ).map(
				subsetFilterGroup
			),
			CaseGeometries: ( database.CaseGeometries || [] ).map(
				subsetGeometry
			),
		},
	};
}

export default buildDisplaySubset;
