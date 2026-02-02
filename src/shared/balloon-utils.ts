/**
 * 3D Balloon mesh utilities.
 *
 * Provides functions for building balloon geometry with proper symmetry handling
 * and global max SPL caching, ported from gll-tools visualization.js.
 *
 * @package GllInfo
 */

import { getBalloonGrid } from './polar-utils';

/**
 * WeakMap cache for global max levels per source.
 * Maps source object -> globalMaxLevel (across all frequencies).
 */
const globalMaxCache = new WeakMap< object, number >();

/**
 * Symmetry types for balloon data.
 */
export const SYMMETRY = {
	NONE: 0,
	VERTICAL: 1,   // Mirror across vertical plane (left-right symmetric)
	HORIZONTAL: 2, // Mirror across horizontal plane (top-bottom symmetric)
	QUARTER: 3,    // Quarter symmetry (both vertical and horizontal)
	AXIAL: 4,      // Full axial symmetry (rotationally symmetric)
} as const;

/**
 * Grid information for balloon data.
 */
export interface BalloonGridInfo {
	meridianCount: number;
	parallelCount: number;
	symmetry: number;
	frontHalfOnly: boolean;
	measuredMeridianDeg: number;
	measuredParallelDeg: number;
	meridianStep: number;
	parallelStep: number;
	responseCount: number;
	fullMeridianCount: number;
	fullParallelCount: number;
	symmetryName: string;
}

/**
 * Options for building balloon geometry.
 */
export interface BalloonBuildOptions {
	frequencyIndex: number;
	dbRange: number;
	scale: number;
}

/**
 * Result of building balloon geometry data.
 */
export interface BalloonGeometryData {
	vertices: number[];
	colors: number[];
	indices: number[];
	globalMax: number;
	displayMin: number;
	displayMax: number;
}

/**
 * Calculate response index with pole deduplication.
 *
 * Balloon data stores poles only once (not duplicated for each meridian),
 * so we need to account for this when indexing.
 */
function balloonResponseIndex(
	meridianIdx: number,
	parallelIdx: number,
	meridianCount: number,
	parallelCount: number,
	frontHalfOnly: boolean
): number | null {
	const lastParIdx = parallelCount - 1;
	const isFrontPole = parallelIdx === 0;
	const isBackPole = parallelIdx === lastParIdx && ! frontHalfOnly;

	// Poles are stored only once (at meridian index 0)
	if ( isFrontPole || isBackPole ) {
		return parallelIdx;
	}

	// First meridian (index 0) has all parallel points
	if ( meridianIdx === 0 ) {
		return parallelIdx;
	}

	// Other meridians skip poles
	const skippedPerMer = frontHalfOnly ? 1 : 2;
	const pointsPerMer = parallelCount - skippedPerMer;

	return parallelCount + ( meridianIdx - 1 ) * pointsPerMer + ( parallelIdx - 1 );
}

/**
 * Get response for a given azimuth and parallel angle, handling symmetry.
 *
 * @param source      Source definition with Responses array.
 * @param grid        Grid info from getBalloonGrid.
 * @param azimuthDeg  Azimuth angle in degrees (0-360).
 * @param parallelDeg Parallel angle in degrees (0=front pole, 180=back pole).
 * @return Response object or null if not available.
 */
export function getResponseWithSymmetry(
	source: any,
	grid: BalloonGridInfo,
	azimuthDeg: number,
	parallelDeg: number
): any | null {
	const responses = source?.Responses || source?.responses || [];

	if ( ! responses.length || ! grid ) {
		return null;
	}

	// Normalize azimuth to 0-360 range
	let lookupAzimuth = ( ( azimuthDeg % 360 ) + 360 ) % 360;
	let lookupParallel = parallelDeg;

	const symmetry = grid.symmetry ?? 0;
	const canMirrorParallel = symmetry === SYMMETRY.HORIZONTAL || symmetry === SYMMETRY.QUARTER;

	// Apply symmetry mapping to azimuth
	if ( symmetry === SYMMETRY.AXIAL ) {
		// Axially symmetric - all meridians are the same
		lookupAzimuth = 0;
	} else if ( symmetry === SYMMETRY.QUARTER ) {
		// Quarter symmetry - fold into first quadrant (0-90°)
		if ( lookupAzimuth >= 270 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		} else if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = lookupAzimuth - 180;
		} else if ( lookupAzimuth >= 90 ) {
			lookupAzimuth = 180 - lookupAzimuth;
		}
	} else if ( symmetry === SYMMETRY.VERTICAL ) {
		// Vertical symmetry - fold into front half (0-180°)
		if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		}
	} else if ( symmetry === SYMMETRY.HORIZONTAL ) {
		// Horizontal symmetry - fold into right half
		lookupAzimuth = lookupAzimuth - 90;
		if ( lookupAzimuth < 0 ) {
			lookupAzimuth = -lookupAzimuth;
		} else if ( lookupAzimuth >= 180 ) {
			lookupAzimuth = 360 - lookupAzimuth;
		}
	}

	// Validate parallel angle range
	if ( lookupParallel < 0 || lookupParallel > 180 ) {
		return null;
	}

	// Handle front-half-only data
	if ( grid.frontHalfOnly && lookupParallel > 90 ) {
		return null;
	}

	// Mirror parallel if needed and data supports it
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

	// Convert angles to grid indices
	const meridianIdx = Math.round( lookupAzimuth / grid.meridianStep );
	const parallelIdx = Math.round( lookupParallel / grid.parallelStep );

	// Validate indices are in range
	if (
		meridianIdx < 0 ||
		meridianIdx >= grid.meridianCount ||
		parallelIdx < 0 ||
		parallelIdx >= grid.parallelCount
	) {
		return null;
	}

	// Get response index accounting for pole deduplication
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
 * Compute the global maximum SPL level across all frequencies for a source.
 * Results are cached in a WeakMap for performance.
 *
 * @param source Source definition with Responses array.
 * @return Global maximum level or 0 if not available.
 */
export function computeGlobalMaxLevel( source: any ): number {
	// Check cache first
	if ( globalMaxCache.has( source ) ) {
		return globalMaxCache.get( source )!;
	}

	const responses = source?.Responses || source?.responses || [];
	let globalMax = -Infinity;

	// Iterate through all responses and all frequency levels
	for ( const response of responses ) {
		const levels = response?.Levels || response?.Level || response?.level || [];
		for ( const level of levels ) {
			if ( typeof level === 'number' && Number.isFinite( level ) && level > globalMax ) {
				globalMax = level;
			}
		}
	}

	// Default to 0 if no valid levels found
	if ( globalMax === -Infinity ) {
		globalMax = 0;
	}

	// Cache the result
	globalMaxCache.set( source, globalMax );

	return globalMax;
}

/**
 * Clear the global max cache for a source.
 * Call this if the source data has been modified.
 */
export function clearGlobalMaxCache( source: any ): void {
	globalMaxCache.delete( source );
}

/**
 * Build a full sphere level grid for a given frequency, handling symmetry.
 *
 * Creates a 2D array of levels where:
 * - First index is parallel (0 = front pole, parallels-1 = back pole)
 * - Second index is meridian (0-359° in steps)
 *
 * @param source         Source definition.
 * @param grid           Grid info from getBalloonGrid.
 * @param frequencyIndex Frequency index to extract.
 * @return 2D array of levels [parallel][meridian].
 */
export function buildFullSphereLevels(
	source: any,
	grid: BalloonGridInfo,
	frequencyIndex: number
): number[][] {
	const { fullMeridianCount, fullParallelCount, meridianStep, parallelStep } = grid;
	const levels: number[][] = [];

	// Build full sphere grid using symmetry-aware lookups
	for ( let pIdx = 0; pIdx < fullParallelCount; pIdx++ ) {
		const parallelDeg = pIdx * parallelStep;
		const parallelLevels: number[] = [];

		for ( let mIdx = 0; mIdx < fullMeridianCount; mIdx++ ) {
			const azimuthDeg = mIdx * meridianStep;

			// Get response using symmetry-aware lookup
			const response = getResponseWithSymmetry( source, grid, azimuthDeg, parallelDeg );
			const responseLevels = response?.Levels || response?.Level || response?.level || [];
			const level = responseLevels[ frequencyIndex ];

			// Use -100 as missing data placeholder
			parallelLevels.push( typeof level === 'number' && Number.isFinite( level ) ? level : -100 );
		}

		levels.push( parallelLevels );
	}

	return levels;
}

/**
 * Convert GLL spherical coordinates to Three.js cartesian coordinates.
 *
 * GLL uses Z-up convention, Three.js uses Y-up:
 * - GLL X -> Three.js X
 * - GLL Y -> Three.js Z
 * - GLL Z -> Three.js Y
 *
 * @param radius      Radial distance.
 * @param parallelRad Parallel angle in radians (0 = front/top pole).
 * @param azimuthRad  Azimuth angle in radians.
 * @return Object with x, y, z coordinates.
 */
export function sphericalToCartesian(
	radius: number,
	parallelRad: number,
	azimuthRad: number
): { x: number; y: number; z: number } {
	// Standard spherical to cartesian (with Y-up convention)
	const sinPar = Math.sin( parallelRad );
	const cosPar = Math.cos( parallelRad );
	const sinAz = Math.sin( azimuthRad );
	const cosAz = Math.cos( azimuthRad );

	return {
		x: radius * sinPar * cosAz,
		y: radius * cosPar,           // GLL Z -> Three.js Y
		z: radius * sinPar * sinAz,   // GLL Y -> Three.js Z
	};
}

/**
 * Map a level value to HSL color.
 *
 * @param normalized Normalized value 0-1 (0=min, 1=max).
 * @return Object with r, g, b values (0-1 range).
 */
export function levelToColor( normalized: number ): { r: number; g: number; b: number } {
	// Hue: 0 (red) for max, 0.66 (blue) for min
	const hue = ( 1 - normalized ) * 0.66;
	const saturation = 0.75;
	const lightness = 0.5;

	// HSL to RGB conversion
	const c = ( 1 - Math.abs( 2 * lightness - 1 ) ) * saturation;
	const x = c * ( 1 - Math.abs( ( ( hue * 6 ) % 2 ) - 1 ) );
	const m = lightness - c / 2;

	let r = 0, g = 0, b = 0;
	const h6 = hue * 6;

	if ( h6 < 1 ) {
		r = c; g = x; b = 0;
	} else if ( h6 < 2 ) {
		r = x; g = c; b = 0;
	} else if ( h6 < 3 ) {
		r = 0; g = c; b = x;
	} else if ( h6 < 4 ) {
		r = 0; g = x; b = c;
	} else if ( h6 < 5 ) {
		r = x; g = 0; b = c;
	} else {
		r = c; g = 0; b = x;
	}

	return {
		r: r + m,
		g: g + m,
		b: b + m,
	};
}

/**
 * Build balloon geometry data (vertices, colors, indices) for Three.js.
 *
 * @param source  Source definition with Responses.
 * @param options Build options (frequencyIndex, dbRange, scale).
 * @return Geometry data or null if source has no valid data.
 */
export function buildBalloonGeometryData(
	source: any,
	options: BalloonBuildOptions
): BalloonGeometryData | null {
	const grid = getBalloonGrid( source ) as BalloonGridInfo | null;
	if ( ! grid ) {
		return null;
	}

	const { frequencyIndex, dbRange, scale } = options;
	const { fullMeridianCount, fullParallelCount, parallelStep, meridianStep } = grid;

	// Build full sphere levels with symmetry handling
	const levels = buildFullSphereLevels( source, grid, frequencyIndex );

	// Compute global max across ALL frequencies (cached)
	const globalMax = computeGlobalMaxLevel( source );
	const displayMin = globalMax - dbRange;
	const displayMax = globalMax;

	// Geometry parameters
	const baseRadius = 0.3 * scale;
	const amplitude = 0.9 * scale;

	// Build geometry arrays
	const vertices: number[] = [];
	const colors: number[] = [];
	const indices: number[] = [];

	// Create sphere vertices with radius based on level
	// We need fullParallelCount + 1 rows and fullMeridianCount + 1 columns for proper UV wrapping
	for ( let pIdx = 0; pIdx <= fullParallelCount - 1; pIdx++ ) {
		const parallelRad = ( pIdx / ( fullParallelCount - 1 ) ) * Math.PI;

		for ( let mIdx = 0; mIdx <= fullMeridianCount; mIdx++ ) {
			const azimuthRad = ( mIdx / fullMeridianCount ) * Math.PI * 2;

			// Get level for this point (wrap meridian index)
			const levelPIdx = Math.min( pIdx, fullParallelCount - 1 );
			const levelMIdx = mIdx % fullMeridianCount;
			const level = levels[ levelPIdx ]?.[ levelMIdx ] ?? displayMin;

			// Calculate normalized value (clamped to 0-1)
			const normalized = Math.max( 0, Math.min( 1, ( level - displayMin ) / dbRange ) );

			// Calculate radius based on level
			const radius = baseRadius + amplitude * normalized;

			// Convert to cartesian coordinates (GLL Z-up to Three.js Y-up)
			const pos = sphericalToCartesian( radius, parallelRad, azimuthRad );
			vertices.push( pos.x, pos.y, pos.z );

			// Map level to color
			const color = levelToColor( normalized );
			colors.push( color.r, color.g, color.b );
		}
	}

	// Create triangle indices
	const meridianVertCount = fullMeridianCount + 1;
	for ( let pIdx = 0; pIdx < fullParallelCount - 1; pIdx++ ) {
		for ( let mIdx = 0; mIdx < fullMeridianCount; mIdx++ ) {
			const current = pIdx * meridianVertCount + mIdx;
			const next = current + meridianVertCount;

			// Two triangles per quad
			indices.push( current, next, current + 1 );
			indices.push( current + 1, next, next + 1 );
		}
	}

	return {
		vertices,
		colors,
		indices,
		globalMax,
		displayMin,
		displayMax,
	};
}

/**
 * Re-export getBalloonGrid for convenience.
 */
export { getBalloonGrid };
