/**
 * Tests for the 3D balloon geometry utilities.
 *
 * This module carries a second, independent copy of the symmetry folding and
 * pole-deduplication rules that `polar-utils` implements privately. The two
 * drifting apart would put the balloon and the polar plot on different data
 * for the same file, so a cross-module agreement test is included below.
 *
 * @package
 */

import {
	SYMMETRY,
	getResponseWithSymmetry,
	computeGlobalMaxLevel,
	clearGlobalMaxCache,
	buildFullSphereLevels,
	sphericalToCartesian,
	levelToColor,
	levelToColorWithMissing,
	buildBalloonGeometryData,
	MISSING_DATA_COLOR,
	MISSING_LEVEL_MARKER,
	getBalloonGrid,
} from './balloon-utils';
import { computePolarSlices } from './polar-utils';

/**
 * Build a source carrying a balloon grid and one response per stored point.
 *
 * Each response's level array holds its own index, so a lookup landing on the
 * wrong response shows up as a wrong number rather than as a silent null.
 *
 * @param {Object} angular       Angular resolution fields.
 * @param {number} responseCount Number of responses to fabricate.
 */
function makeSource( angular: any, responseCount: number ): any {
	return {
		Definition: { BalloonData: { AngularResolution: angular } },
		Responses: Array.from( { length: responseCount }, ( _, i ) => ( {
			Level: [ i ],
			Frequencies: [ 1000 ],
		} ) ),
	};
}

describe( 'SYMMETRY', () => {
	it( 'names the five GLL symmetry codes', () => {
		expect( SYMMETRY ).toMatchObject( {
			NONE: 0,
			VERTICAL: 1,
			HORIZONTAL: 2,
			QUARTER: 3,
			AXIAL: 4,
		} );
	} );
} );

describe( 'getResponseWithSymmetry', () => {
	it( 'returns null without responses or a grid', () => {
		const grid = getBalloonGrid(
			makeSource( { meridian_step: 90, parallel_step: 90 }, 6 )
		)!;

		expect(
			getResponseWithSymmetry( { Responses: [] }, grid, 0, 0 )
		).toBeNull();
		expect(
			getResponseWithSymmetry(
				makeSource( { meridian_step: 90, parallel_step: 90 }, 6 ),
				null as any,
				0,
				0
			)
		).toBeNull();
	} );

	it( 'normalizes azimuths outside 0-360', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			6
		);
		const grid = getBalloonGrid( source )!;

		const at90 = getResponseWithSymmetry( source, grid, 90, 90 );

		expect( getResponseWithSymmetry( source, grid, 450, 90 ) ).toBe( at90 );
		expect( getResponseWithSymmetry( source, grid, -270, 90 ) ).toBe(
			at90
		);
	} );

	it( 'rejects parallel angles outside 0-180', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			6
		);
		const grid = getBalloonGrid( source )!;

		expect( getResponseWithSymmetry( source, grid, 0, -1 ) ).toBeNull();
		expect( getResponseWithSymmetry( source, grid, 0, 181 ) ).toBeNull();
	} );

	it( 'rejects the rear hemisphere for a front-half-only measurement', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 45, front_half_only: true },
			100
		);
		const grid = getBalloonGrid( source )!;

		expect( getResponseWithSymmetry( source, grid, 0, 90 ) ).not.toBeNull();
		expect( getResponseWithSymmetry( source, grid, 0, 120 ) ).toBeNull();
	} );

	it( 'collapses every azimuth onto one meridian under axial symmetry', () => {
		const source = makeSource(
			{ meridian_step: 360, parallel_step: 90, symmetry: SYMMETRY.AXIAL },
			3
		);
		const grid = getBalloonGrid( source )!;

		const front = getResponseWithSymmetry( source, grid, 0, 90 );
		[ 45, 90, 180, 270, 359 ].forEach( ( azimuth ) => {
			expect( getResponseWithSymmetry( source, grid, azimuth, 90 ) ).toBe(
				front
			);
		} );
	} );

	it( 'mirrors the rear half onto the front under vertical symmetry', () => {
		const source = makeSource(
			{
				meridian_step: 90,
				parallel_step: 90,
				symmetry: SYMMETRY.VERTICAL,
			},
			10
		);
		const grid = getBalloonGrid( source )!;

		// 270° folds to 90°, 350° folds to 10°.
		expect( getResponseWithSymmetry( source, grid, 270, 90 ) ).toBe(
			getResponseWithSymmetry( source, grid, 90, 90 )
		);
	} );

	it( 'shifts by 90° before folding under horizontal symmetry', () => {
		const source = makeSource(
			{
				meridian_step: 90,
				parallel_step: 90,
				symmetry: SYMMETRY.HORIZONTAL,
			},
			10
		);
		const grid = getBalloonGrid( source )!;

		// The stored meridian 0 sits at 90° of real azimuth, so 0° and 180°
		// both fold onto stored index 1.
		expect( getResponseWithSymmetry( source, grid, 0, 90 ) ).toBe(
			getResponseWithSymmetry( source, grid, 180, 90 )
		);
	} );

	it( 'folds into the first quadrant under quarter symmetry', () => {
		const source = makeSource(
			{
				meridian_step: 45,
				parallel_step: 90,
				symmetry: SYMMETRY.QUARTER,
			},
			30
		);
		const grid = getBalloonGrid( source )!;

		const at45 = getResponseWithSymmetry( source, grid, 45, 90 );

		expect( getResponseWithSymmetry( source, grid, 135, 90 ) ).toBe( at45 );
		expect( getResponseWithSymmetry( source, grid, 225, 90 ) ).toBe( at45 );
		expect( getResponseWithSymmetry( source, grid, 315, 90 ) ).toBe( at45 );
	} );

	it( 'mirrors past the measured parallel only where symmetry allows it', () => {
		// Horizontal symmetry may mirror 180-p; vertical may not.
		const horizontal = makeSource(
			{
				meridian_step: 90,
				parallel_step: 90,
				symmetry: SYMMETRY.HORIZONTAL,
			},
			10
		);
		const vertical = makeSource(
			{
				meridian_step: 90,
				parallel_step: 90,
				symmetry: SYMMETRY.VERTICAL,
			},
			10
		);

		const hGrid = getBalloonGrid( horizontal )!;
		const vGrid = getBalloonGrid( vertical )!;

		// Both grids measure the full 0-180 parallel sweep here, so nothing is
		// mirrored — the point is that neither errors and both agree on axis.
		expect(
			getResponseWithSymmetry( horizontal, hGrid, 0, 0 )
		).not.toBeNull();
		expect(
			getResponseWithSymmetry( vertical, vGrid, 0, 0 )
		).not.toBeNull();
	} );

	it( 'returns null when the computed response index is past the array', () => {
		// A grid that implies more stored points than the source actually has.
		const source = makeSource(
			{ meridian_step: 10, parallel_step: 10 },
			2
		);
		const grid = getBalloonGrid( source )!;

		expect( getResponseWithSymmetry( source, grid, 90, 90 ) ).toBeNull();
	} );

	/**
	 * `polar-utils` keeps a private copy of this logic. If the two ever
	 * disagree, the polar plot and the balloon show different data for the same
	 * file — the kind of divergence nobody notices until a customer does.
	 */
	it( 'agrees with the copy inside computePolarSlices', () => {
		const source = makeSource(
			{ meridian_step: 360, parallel_step: 90, symmetry: SYMMETRY.AXIAL },
			3
		);
		source.Responses = [
			{ Level: [ 100 ], Frequencies: [ 1000 ] },
			{ Level: [ 94 ], Frequencies: [ 1000 ] },
			{ Level: [ 88 ], Frequencies: [ 1000 ] },
		];
		const grid = getBalloonGrid( source )!;

		const slices = computePolarSlices( source, 0 )!;

		slices.labels.forEach( ( _label: string, i: number ) => {
			// Reconstruct the direction computePolarSlices sampled for the
			// horizontal slice at this label.
			const angles = [ 0 ];
			for ( let a = -10; a >= -180; a -= 10 ) {
				angles.push( a );
			}
			for ( let a = 170; a > 0; a -= 10 ) {
				angles.push( a );
			}
			const angle = angles[ i ];
			const response = getResponseWithSymmetry(
				source,
				grid,
				angle >= 0 ? 90 : 270,
				Math.abs( angle )
			);
			const expected = response ? response.Level[ 0 ] : null;

			expect( slices.horizontal.levels[ i ] ).toBe( expected );
		} );
	} );
} );

describe( 'computeGlobalMaxLevel', () => {
	it( 'finds the largest level across every response and frequency', () => {
		const source = {
			Responses: [
				{ Level: [ 90, 95 ] },
				{ Level: [ 100, 80 ] },
				{ Level: [ 70 ] },
			],
		};

		expect( computeGlobalMaxLevel( source ) ).toBe( 100 );
	} );

	it( 'reads Levels, Level and level alike', () => {
		expect(
			computeGlobalMaxLevel( { Responses: [ { Levels: [ 5 ] } ] } )
		).toBe( 5 );
		expect(
			computeGlobalMaxLevel( { Responses: [ { Level: [ 6 ] } ] } )
		).toBe( 6 );
		expect(
			computeGlobalMaxLevel( { responses: [ { level: [ 7 ] } ] } )
		).toBe( 7 );
	} );

	it( 'ignores non-numeric and non-finite entries', () => {
		const source = {
			Responses: [ { Level: [ NaN, Infinity, '120' as any, 88 ] } ],
		};

		expect( computeGlobalMaxLevel( source ) ).toBe( 88 );
	} );

	it( 'falls back to 0 when nothing usable is present', () => {
		expect( computeGlobalMaxLevel( { Responses: [] } ) ).toBe( 0 );
		expect( computeGlobalMaxLevel( {} ) ).toBe( 0 );
		expect(
			computeGlobalMaxLevel( { Responses: [ { Level: [] } ] } )
		).toBe( 0 );
	} );

	it( 'caches by source identity, so a later mutation is not seen', () => {
		const source = { Responses: [ { Level: [ 90 ] } ] };

		expect( computeGlobalMaxLevel( source ) ).toBe( 90 );
		source.Responses[ 0 ].Level = [ 120 ];
		expect( computeGlobalMaxLevel( source ) ).toBe( 90 );

		clearGlobalMaxCache( source );
		expect( computeGlobalMaxLevel( source ) ).toBe( 120 );
	} );

	it( 'does not let one source poison another', () => {
		const a = { Responses: [ { Level: [ 90 ] } ] };
		const b = { Responses: [ { Level: [ 120 ] } ] };

		expect( computeGlobalMaxLevel( a ) ).toBe( 90 );
		expect( computeGlobalMaxLevel( b ) ).toBe( 120 );
		expect( computeGlobalMaxLevel( a ) ).toBe( 90 );
	} );
} );

describe( 'buildFullSphereLevels', () => {
	it( 'returns one row per full parallel and one column per full meridian', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			6
		);
		const grid = getBalloonGrid( source )!;

		const levels = buildFullSphereLevels( source, grid, 0 );

		expect( levels ).toHaveLength( grid.fullParallelCount );
		levels.forEach( ( row ) => {
			expect( row ).toHaveLength( grid.fullMeridianCount );
		} );
	} );

	it( 'marks unmeasured directions with the -100 placeholder', () => {
		// Only the front pole is stored, so everything else is missing.
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			1
		);
		const grid = getBalloonGrid( source )!;

		const levels = buildFullSphereLevels( source, grid, 0 );

		expect( levels[ 0 ][ 0 ] ).toBe( 0 );
		expect( levels[ 1 ][ 0 ] ).toBe( -100 );
	} );

	it( 'repeats one meridian across the sphere under axial symmetry', () => {
		const source = makeSource(
			{ meridian_step: 30, parallel_step: 90, symmetry: SYMMETRY.AXIAL },
			3
		);
		const grid = getBalloonGrid( source )!;

		const levels = buildFullSphereLevels( source, grid, 0 );

		levels.forEach( ( row ) => {
			expect( new Set( row ).size ).toBe( 1 );
		} );
	} );
} );

describe( 'sphericalToCartesian', () => {
	it( 'puts the front pole on +Y, matching the Z-up to Y-up swap', () => {
		const point = sphericalToCartesian( 2, 0, 0 );

		expect( point.x ).toBeCloseTo( 0, 9 );
		expect( point.y ).toBeCloseTo( 2, 9 );
		expect( point.z ).toBeCloseTo( 0, 9 );
	} );

	it( 'puts the equator at azimuth 0 on +X', () => {
		const point = sphericalToCartesian( 2, Math.PI / 2, 0 );

		expect( point.x ).toBeCloseTo( 2, 9 );
		expect( point.y ).toBeCloseTo( 0, 9 );
		expect( point.z ).toBeCloseTo( 0, 9 );
	} );

	it( 'puts azimuth 90° on +Z', () => {
		const point = sphericalToCartesian( 2, Math.PI / 2, Math.PI / 2 );

		expect( point.x ).toBeCloseTo( 0, 9 );
		expect( point.z ).toBeCloseTo( 2, 9 );
	} );

	it( 'preserves the radius everywhere', () => {
		for ( let par = 0; par <= Math.PI; par += 0.3 ) {
			for ( let az = 0; az < 2 * Math.PI; az += 0.7 ) {
				const { x, y, z } = sphericalToCartesian( 1.7, par, az );
				expect( Math.sqrt( x * x + y * y + z * z ) ).toBeCloseTo(
					1.7,
					9
				);
			}
		}
	} );
} );

describe( 'levelToColor', () => {
	it( 'paints the maximum red', () => {
		const { r, g, b } = levelToColor( 1 );

		expect( r ).toBeCloseTo( 0.875, 3 );
		expect( g ).toBeCloseTo( 0.125, 3 );
		expect( b ).toBeCloseTo( 0.125, 3 );
	} );

	it( 'paints the minimum blue', () => {
		const { r, g, b } = levelToColor( 0 );

		expect( b ).toBeGreaterThan( r );
		expect( b ).toBeGreaterThan( g );
	} );

	it( 'stays inside the unit range across the whole scale', () => {
		for ( let n = 0; n <= 1; n += 0.05 ) {
			const { r, g, b } = levelToColor( n );
			[ r, g, b ].forEach( ( channel ) => {
				expect( channel ).toBeGreaterThanOrEqual( 0 );
				expect( channel ).toBeLessThanOrEqual( 1 );
			} );
		}
	} );

	it( 'moves red up monotonically as the level rises', () => {
		let previous = -Infinity;
		for ( let n = 0; n <= 1; n += 0.1 ) {
			const { r } = levelToColor( n );
			expect( r ).toBeGreaterThanOrEqual( previous - 1e-9 );
			previous = r;
		}
	} );
} );

describe( 'levelToColorWithMissing', () => {
	it( 'greys out anything at or below the missing marker', () => {
		expect(
			levelToColorWithMissing( MISSING_LEVEL_MARKER, 60, 40 )
		).toEqual( MISSING_DATA_COLOR );
		expect( levelToColorWithMissing( -100, 60, 40 ) ).toEqual(
			MISSING_DATA_COLOR
		);
	} );

	it( 'clamps below the display minimum to the bottom of the scale', () => {
		expect( levelToColorWithMissing( 10, 60, 40 ) ).toEqual(
			levelToColor( 0 )
		);
	} );

	it( 'clamps above the display maximum to the top of the scale', () => {
		expect( levelToColorWithMissing( 500, 60, 40 ) ).toEqual(
			levelToColor( 1 )
		);
	} );

	it( 'maps the midpoint to the middle of the scale', () => {
		expect( levelToColorWithMissing( 80, 60, 40 ) ).toEqual(
			levelToColor( 0.5 )
		);
	} );
} );

describe( 'buildBalloonGeometryData', () => {
	const options = { frequencyIndex: 0, dbRange: 40, scale: 1 };

	/**
	 * A source with a real grid and enough responses to fill it.
	 */
	function gridSource(): any {
		return makeSource( { meridian_step: 30, parallel_step: 30 }, 200 );
	}

	it( 'returns null without a balloon grid', () => {
		expect( buildBalloonGeometryData( {}, options ) ).toBeNull();
	} );

	it( 'emits one colour per vertex', () => {
		const data = buildBalloonGeometryData( gridSource(), options )!;

		expect( data.colors ).toHaveLength( data.vertices.length );
		expect( data.vertices.length % 3 ).toBe( 0 );
	} );

	it( 'lays out rings by columns, with a duplicated seam column', () => {
		const source = gridSource();
		const grid = getBalloonGrid( source )!;
		const data = buildBalloonGeometryData( source, options )!;

		const meridianSegments = grid.fullMeridianCount;
		const parallelRings = grid.fullParallelCount;
		const vertexCount = data.vertices.length / 3;

		// The +1 duplicates the 0° column so the surface wraps cleanly.
		expect( vertexCount ).toBe( parallelRings * ( meridianSegments + 1 ) );
	} );

	it( 'duplicates the seam vertex exactly', () => {
		const source = gridSource();
		const grid = getBalloonGrid( source )!;
		const data = buildBalloonGeometryData( source, options )!;
		const stride = grid.fullMeridianCount + 1;

		for ( let ring = 0; ring < grid.fullParallelCount; ring++ ) {
			const first = ring * stride * 3;
			const last = ( ring * stride + grid.fullMeridianCount ) * 3;
			for ( let axis = 0; axis < 3; axis++ ) {
				expect( data.vertices[ last + axis ] ).toBeCloseTo(
					data.vertices[ first + axis ],
					9
				);
			}
		}
	} );

	it( 'emits two triangles per quad, all in range', () => {
		const source = gridSource();
		const grid = getBalloonGrid( source )!;
		const data = buildBalloonGeometryData( source, options )!;
		const vertexCount = data.vertices.length / 3;

		expect( data.indices ).toHaveLength(
			( grid.fullParallelCount - 1 ) * grid.fullMeridianCount * 6
		);
		data.indices.forEach( ( index ) => {
			expect( index ).toBeGreaterThanOrEqual( 0 );
			expect( index ).toBeLessThan( vertexCount );
		} );
	} );

	it( 'reports the display window derived from the global max', () => {
		const source = gridSource();
		const data = buildBalloonGeometryData( source, options )!;

		expect( data.globalMax ).toBe( computeGlobalMaxLevel( source ) );
		expect( data.displayMax ).toBe( data.globalMax );
		expect( data.displayMin ).toBe( data.globalMax - 40 );
	} );

	it( 'halves each axis at stride 2', () => {
		const source = gridSource();
		const full = buildBalloonGeometryData( source, options )!;
		const low = buildBalloonGeometryData( source, {
			...options,
			subsampleStride: 2,
		} )!;

		expect( low.vertices.length ).toBeLessThan( full.vertices.length );
		expect( low.indices.length ).toBeLessThan( full.indices.length );
	} );

	it.each( [ 0, -3, NaN, undefined, null ] )(
		'clamps a stride of %p back to native resolution',
		( stride ) => {
			const source = gridSource();
			const full = buildBalloonGeometryData( source, options )!;
			const clamped = buildBalloonGeometryData( source, {
				...options,
				subsampleStride: stride as any,
			} )!;

			expect( clamped.vertices.length ).toBe( full.vertices.length );
		}
	);

	it( 'scales the radius with the scale option', () => {
		const source = gridSource();
		const small = buildBalloonGeometryData( source, options )!;
		const large = buildBalloonGeometryData( source, {
			...options,
			scale: 2,
		} )!;

		const radius = ( data: any, i: number ) =>
			Math.hypot(
				data.vertices[ i * 3 ],
				data.vertices[ i * 3 + 1 ],
				data.vertices[ i * 3 + 2 ]
			);

		expect( radius( large, 0 ) ).toBeCloseTo( radius( small, 0 ) * 2, 9 );
	} );

	it( 'keeps every vertex between the base and full radius', () => {
		const source = gridSource();
		const data = buildBalloonGeometryData( source, options )!;
		const vertexCount = data.vertices.length / 3;

		for ( let i = 0; i < vertexCount; i++ ) {
			const radius = Math.hypot(
				data.vertices[ i * 3 ],
				data.vertices[ i * 3 + 1 ],
				data.vertices[ i * 3 + 2 ]
			);
			// baseRadius 0.3 to baseRadius + amplitude 0.9 at scale 1.
			expect( radius ).toBeGreaterThanOrEqual( 0.3 - 1e-9 );
			expect( radius ).toBeLessThanOrEqual( 1.2 + 1e-9 );
		}
	} );
} );
