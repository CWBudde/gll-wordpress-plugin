/**
 * Polar plot utilities for directivity visualization.
 *
 * Ported from gll-tools web demo (app.js computePolarSlices and helpers).
 *
 * @package GllInfo
 */

/**
 * Build array of angles for polar plot (0, -10, -20, ... -180, 170, 160, ... 10).
 *
 * @param {number} stepDeg Angular step in degrees.
 * @return {Array<number>} Array of angles.
 */
export function buildPolarAngles( stepDeg ) {
	const angles = [ 0 ];
	for ( let angle = -stepDeg; angle >= -180; angle -= stepDeg ) {
		angles.push( angle );
	}
	for ( let angle = 180 - stepDeg; angle > 0; angle -= stepDeg ) {
		angles.push( angle );
	}
	return angles;
}

/**
 * Format angle label for polar chart.
 *
 * @param {number} angleDeg Angle in degrees.
 * @return {string} Formatted label.
 */
export function formatPolarLabel( angleDeg ) {
	const normalized = ( ( angleDeg + 180 ) % 360 ) - 180;
	if ( Math.abs( normalized ) === 180 ) {
		return '\u00b1180\u00b0';
	}
	if ( Math.abs( normalized ) < 1e-6 ) {
		return '0\u00b0';
	}
	return `${ normalized }\u00b0`;
}

/**
 * Build logarithmic frequency array from definition.
 *
 * @param {Object} definition     Frequency definition with bands_per_octave, start_freq, point_count.
 * @param {number} countOverride Optional count override.
 * @return {Array<number>|null} Frequency array or null.
 */
export function buildLogFrequencies( definition, countOverride ) {
	if ( ! definition ) {
		return null;
	}
	const bandsPerOctave = Number( definition.bands_per_octave );
	const startFreq = Number( definition.start_freq );
	const pointCount = Number( definition.point_count );
	if ( ! bandsPerOctave || ! startFreq ) {
		return null;
	}
	const count =
		Number.isFinite( countOverride ) && countOverride > 0
			? countOverride
			: pointCount;
	if ( ! count || count <= 0 ) {
		return null;
	}
	return Array.from(
		{ length: count },
		( _, i ) => startFreq * Math.pow( 2, i / bandsPerOctave )
	);
}

/**
 * Check if two frequency arrays match within tolerance.
 *
 * @param {Array} a First frequency array.
 * @param {Array} b Second frequency array.
 * @return {boolean} True if arrays match.
 */
export function frequenciesMatch( a, b ) {
	if ( ! Array.isArray( a ) || ! Array.isArray( b ) || a.length !== b.length ) {
		return false;
	}
	const tol = 1e-3;
	for ( let i = 0; i < a.length; i++ ) {
		const av = a[ i ];
		const bv = b[ i ];
		if ( ! Number.isFinite( av ) || ! Number.isFinite( bv ) ) {
			return false;
		}
		const rel = Math.abs( av - bv ) / Math.max( 1, Math.abs( bv ) );
		if ( rel > tol ) {
			return false;
		}
	}
	return true;
}

/**
 * Calculate balloon grid dimensions and symmetry from source definition.
 *
 * @param {Object} source Source definition object.
 * @return {Object|null} Grid info or null.
 */
export function getBalloonGrid( source ) {
	const balloon = source?.Definition?.BalloonData || source?.definition?.balloon_data;
	const ang = balloon?.AngularResolution || balloon?.angular_resolution;
	const meridianStep = ang?.MeridianStep || ang?.meridian_step;
	const parallelStep = ang?.ParallelStep || ang?.parallel_step;

	if ( ! ang || ! meridianStep || ! parallelStep ) {
		return null;
	}

	const symmetry = ang?.Symmetry ?? ang?.symmetry ?? 0;
	const frontHalfOnly = !! ( ang?.FrontHalfOnly ?? ang?.front_half_only );
	const symmetryNames = [ 'None', 'Vertical', 'Horizontal', 'Quarter', 'Axial' ];

	const fullMeridianCount = Math.max( 1, Math.round( 360 / meridianStep ) );
	const fullParallelCount = Math.max( 1, Math.round( 180 / parallelStep ) + 1 );

	const responseCount = source?.Responses?.length || source?.responses?.length || 0;
	let meridianCount;
	switch ( symmetry ) {
		case 4: // Axial
			meridianCount = 1;
			break;
		case 3: // Quarter
			meridianCount = Math.max( 1, Math.round( 90 / meridianStep ) + 1 );
			break;
		case 1: // Vertical
		case 2: // Horizontal
			meridianCount = Math.max( 1, Math.round( 180 / meridianStep ) + 1 );
			break;
		default: // None
			meridianCount = fullMeridianCount;
			break;
	}
	const parallelCount = frontHalfOnly
		? Math.max( 1, Math.round( 90 / parallelStep ) + 1 )
		: fullParallelCount;

	const measuredMeridianDeg = ( meridianCount - 1 ) * meridianStep;
	const measuredParallelDeg = ( parallelCount - 1 ) * parallelStep;

	return {
		meridianCount,
		parallelCount,
		symmetry,
		frontHalfOnly,
		measuredMeridianDeg,
		measuredParallelDeg,
		meridianStep,
		parallelStep,
		responseCount,
		fullMeridianCount,
		fullParallelCount,
		symmetryName: symmetryNames[ symmetry ] || 'Unknown',
	};
}

/**
 * Calculate response index with pole deduplication.
 *
 * @param {number}  meridianIdx   Meridian index.
 * @param {number}  parallelIdx   Parallel index.
 * @param {number}  meridianCount Total meridian count.
 * @param {number}  parallelCount Total parallel count.
 * @param {boolean} frontHalfOnly Whether only front half is measured.
 * @return {number|null} Response index.
 */
function balloonResponseIndex( meridianIdx, parallelIdx, meridianCount, parallelCount, frontHalfOnly ) {
	const lastParIdx = parallelCount - 1;
	const isFrontPole = parallelIdx === 0;
	const isBackPole = parallelIdx === lastParIdx && ! frontHalfOnly;

	if ( isFrontPole || isBackPole ) {
		return parallelIdx;
	}

	if ( meridianIdx === 0 ) {
		return parallelIdx;
	}

	const skippedPerMer = frontHalfOnly ? 1 : 2;
	const pointsPerMer = parallelCount - skippedPerMer;

	return parallelCount + ( meridianIdx - 1 ) * pointsPerMer + ( parallelIdx - 1 );
}

/**
 * Map azimuth/parallel to stored response using symmetry rules.
 *
 * @param {Object} source      Source definition.
 * @param {Object} grid        Grid info from getBalloonGrid.
 * @param {number} azimuthDeg  Azimuth in degrees.
 * @param {number} parallelDeg Parallel angle in degrees.
 * @return {Object|null} Response object or null.
 */
function getResponseWithSymmetry( source, grid, azimuthDeg, parallelDeg ) {
	const responses = source?.Responses || source?.responses || [];
	const balloon = source?.Definition?.BalloonData || source?.definition?.balloon_data;
	const ang = balloon?.AngularResolution || balloon?.angular_resolution;

	if ( ! responses.length || ! ang || ! grid ) {
		return null;
	}

	let lookupAzimuth = ( ( azimuthDeg % 360 ) + 360 ) % 360;
	let lookupParallel = parallelDeg;

	const symmetry = grid.symmetry ?? 0;
	const canMirrorParallel = symmetry === 2 || symmetry === 3;

	if ( symmetry === 4 ) {
		lookupAzimuth = 0;
	} else if ( symmetry === 3 ) {
		if ( lookupAzimuth >= 270 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		} else if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = lookupAzimuth - 180;
		} else if ( lookupAzimuth >= 90 ) {
			lookupAzimuth = 180 - lookupAzimuth;
		}
	} else if ( symmetry === 1 ) {
		if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		}
	} else if ( symmetry === 2 ) {
		lookupAzimuth = lookupAzimuth - 90;
		if ( lookupAzimuth < 0 ) {
			lookupAzimuth = -lookupAzimuth;
		} else if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		}
	}

	if ( lookupParallel < 0 || lookupParallel > 180 ) {
		return null;
	}

	if ( grid.frontHalfOnly && lookupParallel > 90 ) {
		return null;
	}

	if ( lookupParallel > grid.measuredParallelDeg ) {
		if ( canMirrorParallel ) {
			const mirrored = 180 - lookupParallel;
			if ( mirrored <= grid.measuredParallelDeg ) {
				lookupParallel = mirrored;
			} else {
				return null;
			}
		} else {
			return null;
		}
	}

	const meridianIdx = Math.round( lookupAzimuth / grid.meridianStep );
	const parallelIdx = Math.round( lookupParallel / grid.parallelStep );

	if (
		meridianIdx < 0 ||
		meridianIdx >= grid.meridianCount ||
		parallelIdx < 0 ||
		parallelIdx >= grid.parallelCount
	) {
		return null;
	}

	const responseIndex = balloonResponseIndex(
		meridianIdx,
		parallelIdx,
		grid.meridianCount,
		grid.parallelCount,
		grid.frontHalfOnly
	);

	if (
		responseIndex !== null &&
		responseIndex >= 0 &&
		responseIndex < responses.length
	) {
		return responses[ responseIndex ];
	}

	return null;
}

/**
 * Compute horizontal and vertical polar slices for a source at a frequency index.
 *
 * @param {Object} source    Source definition with Responses.
 * @param {number} freqIndex Frequency index to extract.
 * @return {Object|null} Slice data with labels, horizontal, vertical, meta.
 */
export function computePolarSlices( source, freqIndex ) {
	const grid = getBalloonGrid( source );
	if ( ! grid ) {
		return null;
	}

	const stepDeg = 10;
	const angles = buildPolarAngles( stepDeg );
	const labels = angles.map( formatPolarLabel );
	const horizontalLevels = [];
	const verticalLevels = [];

	const maxParallel = grid.measuredParallelDeg;
	const canMirrorParallel = grid.symmetry === 2 || grid.symmetry === 3;

	const def = source?.Definition || source?.definition;
	const onAxis = def?.OnAxisSpectrum || def?.on_axis_spectrum;
	const onAxisFreqs = buildLogFrequencies(
		onAxis?.definition || onAxis?.Definition,
		onAxis?.level?.length || onAxis?.Level?.length
	);
	const onAxisLevel = onAxis?.level || onAxis?.Level || [];
	const sampleResponse = ( source?.Responses || source?.responses || [] )[ 0 ];
	const sampleFreqs = sampleResponse?.Frequencies || sampleResponse?.frequencies || [];
	const canCombineOnAxis =
		onAxis &&
		Array.isArray( onAxisLevel ) &&
		onAxisLevel.length > 0 &&
		Array.isArray( onAxisFreqs ) &&
		sampleResponse &&
		sampleFreqs.length === onAxisFreqs.length &&
		onAxisLevel.length === onAxisLevel.length &&
		frequenciesMatch( sampleFreqs, onAxisFreqs );

	angles.forEach( ( angle ) => {
		// Horizontal slice: front-right-back-left (meridian 90°/270°)
		const hParallelDeg = Math.abs( angle );
		const hMeridianDeg = angle >= 0 ? 90 : 270;

		const horizontalResponse = getResponseWithSymmetry(
			source,
			grid,
			hMeridianDeg,
			hParallelDeg
		);
		const hLevel = ( horizontalResponse?.Level || horizontalResponse?.level || [] )[ freqIndex ];
		horizontalLevels.push(
			canCombineOnAxis && Number.isFinite( hLevel )
				? hLevel + onAxisLevel[ freqIndex ]
				: ( hLevel ?? null )
		);

		// Vertical slice: front-top-back-bottom (meridian 0°/180°)
		const vParallelDeg = Math.abs( angle );
		const vMeridianDeg = angle >= 0 ? 0 : 180;

		const verticalResponse = getResponseWithSymmetry(
			source,
			grid,
			vMeridianDeg,
			vParallelDeg
		);
		const vLevel = ( verticalResponse?.Level || verticalResponse?.level || [] )[ freqIndex ];
		verticalLevels.push(
			canCombineOnAxis && Number.isFinite( vLevel )
				? vLevel + onAxisLevel[ freqIndex ]
				: ( vLevel ?? null )
		);
	} );

	return {
		labels,
		horizontal: {
			levels: horizontalLevels,
			meridianDeg: 90,
		},
		vertical: {
			levels: verticalLevels,
			meridianDeg: 0,
			maxParallel,
			canMirrorParallel,
		},
		meta: {
			usesOnAxis: !! canCombineOnAxis,
			symmetry: grid.symmetry,
			symmetryName: grid.symmetryName,
			frontHalfOnly: grid.frontHalfOnly,
			measuredMeridianDeg: grid.measuredMeridianDeg,
			measuredParallelDeg: grid.measuredParallelDeg,
			stepDeg,
		},
	};
}

/**
 * Compute the min/max range of an array of levels, ignoring nulls.
 *
 * @param {Array} levels Array of level values.
 * @return {Object} Object with min and max.
 */
export function computeLevelRange( levels ) {
	let min = null;
	let max = null;
	for ( const v of levels ) {
		if ( v !== null && ! isNaN( v ) ) {
			if ( min === null || v < min ) {
				min = v;
			}
			if ( max === null || v > max ) {
				max = v;
			}
		}
	}
	return { min, max };
}
