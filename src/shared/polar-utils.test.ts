/**
 * Tests for the polar plot utilities.
 *
 * The balloon grid arithmetic here decides which stored response is read for a
 * given direction, and the pole-deduplication rule is duplicated between this
 * module's private packer and the public `responseIndexToBalloonIndices`
 * unpacker. Those two disagreeing would silently plot the wrong angles, so the
 * round trip between them gets the most attention below.
 *
 * @package
 */

import {
	buildPolarAngles,
	formatPolarLabel,
	buildLogFrequencies,
	frequenciesMatch,
	getBalloonGrid,
	computePolarSlices,
	responseIndexToBalloonIndices,
	computeResponseAngles,
	computeLevelRange,
} from './polar-utils';

/**
 * Build a source carrying a balloon grid.
 *
 * @param {Object} angular       Angular resolution fields.
 * @param {number} responseCount Number of responses to fabricate.
 * @param {Object} extra         Extra fields merged into `Definition`.
 */
function makeSource( angular: any, responseCount = 0, extra: any = {} ): any {
	return {
		Definition: {
			BalloonData: { AngularResolution: angular },
			...extra,
		},
		Responses: Array.from( { length: responseCount }, ( _, i ) => ( {
			// Each response reports its own index, so a lookup that lands on
			// the wrong one is immediately visible.
			Level: [ i ],
			Frequencies: [ 1000 ],
		} ) ),
	};
}

describe( 'buildPolarAngles', () => {
	it( 'walks the negative half first, then back down from +180', () => {
		expect( buildPolarAngles( 45 ) ).toEqual( [
			0, -45, -90, -135, -180, 135, 90, 45,
		] );
	} );

	it( 'produces a full sweep with no duplicates at a 10° step', () => {
		const angles = buildPolarAngles( 10 );

		expect( angles ).toHaveLength( 36 );
		expect( new Set( angles ).size ).toBe( 36 );
	} );

	it( 'includes -180 once and never +180', () => {
		const angles = buildPolarAngles( 10 );

		expect( angles.filter( ( a: number ) => a === -180 ) ).toHaveLength(
			1
		);
		expect( angles ).not.toContain( 180 );
	} );

	it( 'starts on axis', () => {
		expect( buildPolarAngles( 10 )[ 0 ] ).toBe( 0 );
	} );
} );

describe( 'formatPolarLabel', () => {
	it( 'renders on-axis without a sign', () => {
		expect( formatPolarLabel( 0 ) ).toBe( '0°' );
	} );

	it( 'marks the rear as ±180 because both signs land there', () => {
		expect( formatPolarLabel( 180 ) ).toBe( '±180°' );
		expect( formatPolarLabel( -180 ) ).toBe( '±180°' );
	} );

	it( 'keeps the sign for ordinary angles', () => {
		expect( formatPolarLabel( -10 ) ).toBe( '-10°' );
		expect( formatPolarLabel( 90 ) ).toBe( '90°' );
	} );

	/**
	 * Only positive over-rotation folds back: JavaScript's `%` keeps the sign
	 * of the dividend, so -370° comes out as "-370°" rather than "-10°". Every
	 * caller feeds this from `buildPolarAngles`, which never emits outside
	 * -180…180, so nothing renders that today — but the asymmetry is real and
	 * would bite the first caller to pass a raw azimuth.
	 */
	it( 'normalizes positive angles beyond a full turn but not negative ones', () => {
		expect( formatPolarLabel( 370 ) ).toBe( '10°' );
		expect( formatPolarLabel( -370 ) ).toBe( '-370°' );
	} );
} );

describe( 'buildLogFrequencies', () => {
	it( 'returns null without a usable definition', () => {
		expect( buildLogFrequencies( null ) ).toBeNull();
		expect(
			buildLogFrequencies( {
				bands_per_octave: 0,
				start_freq: 50,
				point_count: 3,
			} )
		).toBeNull();
		expect(
			buildLogFrequencies( {
				bands_per_octave: 3,
				start_freq: 0,
				point_count: 3,
			} )
		).toBeNull();
		expect(
			buildLogFrequencies( {
				bands_per_octave: 3,
				start_freq: 50,
				point_count: 0,
			} )
		).toBeNull();
	} );

	it( 'steps geometrically by bands per octave', () => {
		const freqs = buildLogFrequencies( {
			bands_per_octave: 1,
			start_freq: 100,
			point_count: 3,
		} )!;

		expect( freqs ).toHaveLength( 3 );
		expect( freqs[ 0 ] ).toBeCloseTo( 100, 9 );
		expect( freqs[ 1 ] ).toBeCloseTo( 200, 9 );
		expect( freqs[ 2 ] ).toBeCloseTo( 400, 9 );
	} );

	it( 'prefers an explicit count over the declared point count', () => {
		const freqs = buildLogFrequencies(
			{ bands_per_octave: 3, start_freq: 50, point_count: 21 },
			5
		)!;

		expect( freqs ).toHaveLength( 5 );
	} );

	it( 'ignores a non-positive override and falls back to point_count', () => {
		const freqs = buildLogFrequencies(
			{ bands_per_octave: 3, start_freq: 50, point_count: 4 },
			0
		)!;

		expect( freqs ).toHaveLength( 4 );
	} );
} );

describe( 'frequenciesMatch', () => {
	it( 'rejects non-arrays and length mismatches', () => {
		expect( frequenciesMatch( null, [ 1 ] ) ).toBe( false );
		expect( frequenciesMatch( [ 1 ], null ) ).toBe( false );
		expect( frequenciesMatch( [ 1, 2 ], [ 1 ] ) ).toBe( false );
	} );

	it( 'rejects non-finite entries', () => {
		expect( frequenciesMatch( [ NaN ], [ 1 ] ) ).toBe( false );
		expect( frequenciesMatch( [ 1 ], [ Infinity ] ) ).toBe( false );
	} );

	it( 'accepts a difference just inside the relative tolerance', () => {
		// 1e-3 relative on a 1000 Hz bin is 1 Hz.
		expect( frequenciesMatch( [ 1000 ], [ 1000.5 ] ) ).toBe( true );
	} );

	it( 'rejects a difference just outside it', () => {
		expect( frequenciesMatch( [ 1000 ], [ 1002 ] ) ).toBe( false );
	} );

	/**
	 * The denominator is `Math.max( 1, |b| )`, so below 1 Hz the comparison is
	 * effectively absolute rather than relative — otherwise a 0.001 Hz bin
	 * would demand nanohertz agreement.
	 */
	it( 'compares sub-1 Hz values absolutely', () => {
		expect( frequenciesMatch( [ 0.5 ], [ 0.5005 ] ) ).toBe( true );
		expect( frequenciesMatch( [ 0.5 ], [ 0.6 ] ) ).toBe( false );
	} );

	it( 'accepts what buildLogFrequencies regenerates from the same definition', () => {
		const definition = {
			bands_per_octave: 3,
			start_freq: 50,
			point_count: 21,
		};

		expect(
			frequenciesMatch(
				buildLogFrequencies( definition )!,
				buildLogFrequencies( definition )!
			)
		).toBe( true );
	} );
} );

describe( 'getBalloonGrid', () => {
	it( 'returns null without an angular resolution', () => {
		expect( getBalloonGrid( null ) ).toBeNull();
		expect( getBalloonGrid( {} ) ).toBeNull();
		expect(
			getBalloonGrid(
				makeSource( { meridian_step: 0, parallel_step: 10 } )
			)
		).toBeNull();
		expect(
			getBalloonGrid(
				makeSource( { meridian_step: 10, parallel_step: 0 } )
			)
		).toBeNull();
	} );

	it( 'reads both key casings', () => {
		const pascal = getBalloonGrid(
			makeSource( { MeridianStep: 10, ParallelStep: 10, Symmetry: 1 } )
		)!;
		const snake = getBalloonGrid( {
			definition: {
				balloon_data: {
					angular_resolution: {
						meridian_step: 10,
						parallel_step: 10,
						symmetry: 1,
					},
				},
			},
		} )!;

		expect( snake.meridianCount ).toBe( pascal.meridianCount );
		expect( snake.parallelCount ).toBe( pascal.parallelCount );
		expect( snake.symmetry ).toBe( pascal.symmetry );
	} );

	it.each( [
		[ 0, 36, 'None' ],
		[ 1, 19, 'Vertical' ],
		[ 2, 19, 'Horizontal' ],
		[ 3, 10, 'Quarter' ],
		[ 4, 1, 'Axial' ],
	] )(
		'folds symmetry %i down to %i meridians (%s)',
		( symmetry, meridianCount, name ) => {
			const grid = getBalloonGrid(
				makeSource( {
					meridian_step: 10,
					parallel_step: 10,
					symmetry,
				} )
			)!;

			expect( grid.meridianCount ).toBe( meridianCount );
			expect( grid.symmetryName ).toBe( name );
			// The full sweep is unaffected by folding.
			expect( grid.fullMeridianCount ).toBe( 36 );
		}
	);

	it( 'labels an unrecognized symmetry rather than showing undefined', () => {
		const grid = getBalloonGrid(
			makeSource( { meridian_step: 10, parallel_step: 10, symmetry: 7 } )
		)!;

		expect( grid.symmetryName ).toBe( 'Unknown' );
	} );

	it( 'halves the parallel count for a front-half-only measurement', () => {
		const full = getBalloonGrid(
			makeSource( { meridian_step: 10, parallel_step: 10 } )
		)!;
		const front = getBalloonGrid(
			makeSource( {
				meridian_step: 10,
				parallel_step: 10,
				front_half_only: true,
			} )
		)!;

		expect( full.parallelCount ).toBe( 19 );
		expect( front.parallelCount ).toBe( 10 );
		expect( front.frontHalfOnly ).toBe( true );
		// fullParallelCount describes the sphere, not the measurement.
		expect( front.fullParallelCount ).toBe( 19 );
	} );

	it( 'reports the measured extent in degrees', () => {
		const grid = getBalloonGrid(
			makeSource( { meridian_step: 10, parallel_step: 10, symmetry: 1 } )
		)!;

		expect( grid.measuredMeridianDeg ).toBe( 180 );
		expect( grid.measuredParallelDeg ).toBe( 180 );
	} );

	it( 'carries the response count through', () => {
		const grid = getBalloonGrid(
			makeSource( { meridian_step: 10, parallel_step: 10 }, 7 )
		)!;

		expect( grid.responseCount ).toBe( 7 );
	} );
} );

describe( 'responseIndexToBalloonIndices', () => {
	/**
	 * A deliberately tiny grid: 4 meridians x 3 parallels, no front-half
	 * restriction. Both poles are shared, so each meridian past the first
	 * contributes a single new point and the source needs 3 + 3 = 6 responses.
	 */
	const coarseGrid = getBalloonGrid(
		makeSource( { meridian_step: 90, parallel_step: 90 }, 6 )
	)!;

	it( 'returns null for a missing or malformed grid', () => {
		expect( responseIndexToBalloonIndices( 0, null ) ).toBeNull();
		expect( responseIndexToBalloonIndices( 0, {} ) ).toBeNull();
	} );

	it( 'returns null for an out-of-range index', () => {
		expect( responseIndexToBalloonIndices( -1, coarseGrid ) ).toBeNull();
		expect( responseIndexToBalloonIndices( 6, coarseGrid ) ).toBeNull();
		expect( responseIndexToBalloonIndices( NaN, coarseGrid ) ).toBeNull();
	} );

	it( 'maps the first block of indices onto meridian 0', () => {
		for ( let index = 0; index < coarseGrid.parallelCount; index++ ) {
			expect(
				responseIndexToBalloonIndices( index, coarseGrid )
			).toEqual( { meridianIdx: 0, parallelIdx: index } );
		}
	} );

	it( 'gives each later meridian only its non-pole parallels', () => {
		// parallelCount 3 minus the two shared poles leaves one point each.
		expect( responseIndexToBalloonIndices( 3, coarseGrid ) ).toEqual( {
			meridianIdx: 1,
			parallelIdx: 1,
		} );
		expect( responseIndexToBalloonIndices( 4, coarseGrid ) ).toEqual( {
			meridianIdx: 2,
			parallelIdx: 1,
		} );
		expect( responseIndexToBalloonIndices( 5, coarseGrid ) ).toEqual( {
			meridianIdx: 3,
			parallelIdx: 1,
		} );
	} );

	it( 'skips only one pole when the rear hemisphere is unmeasured', () => {
		const grid = getBalloonGrid(
			makeSource(
				{ meridian_step: 90, parallel_step: 45, front_half_only: true },
				100
			)
		)!;

		// parallelCount 3, one shared pole, so two points per later meridian.
		expect( grid.parallelCount ).toBe( 3 );
		expect( responseIndexToBalloonIndices( 3, grid ) ).toEqual( {
			meridianIdx: 1,
			parallelIdx: 1,
		} );
		expect( responseIndexToBalloonIndices( 4, grid ) ).toEqual( {
			meridianIdx: 1,
			parallelIdx: 2,
		} );
		expect( responseIndexToBalloonIndices( 5, grid ) ).toEqual( {
			meridianIdx: 2,
			parallelIdx: 1,
		} );
	} );

	/**
	 * The property that matters: no two response indices may unpack to the same
	 * direction. If the packer and unpacker ever disagree about pole sharing,
	 * two indices collide here and the polar plot reads a neighbouring angle.
	 */
	it( 'is injective across every valid index, for several grids', () => {
		const grids = [
			getBalloonGrid(
				makeSource( { meridian_step: 90, parallel_step: 90 }, 6 )
			)!,
			getBalloonGrid(
				makeSource( { meridian_step: 45, parallel_step: 45 }, 26 )
			)!,
			getBalloonGrid(
				makeSource(
					{
						meridian_step: 45,
						parallel_step: 45,
						front_half_only: true,
					},
					100
				)
			)!,
			getBalloonGrid(
				makeSource(
					{ meridian_step: 10, parallel_step: 10, symmetry: 1 },
					400
				)
			)!,
		];

		grids.forEach( ( grid ) => {
			const seen = new Set< string >();
			for ( let index = 0; index < grid.responseCount; index++ ) {
				const indices = responseIndexToBalloonIndices( index, grid );
				if ( ! indices ) {
					continue;
				}
				const key = `${ indices.meridianIdx }/${ indices.parallelIdx }`;
				expect( seen.has( key ) ).toBe( false );
				seen.add( key );

				expect( indices.meridianIdx ).toBeLessThan(
					grid.meridianCount
				);
				expect( indices.parallelIdx ).toBeLessThan(
					grid.parallelCount
				);
			}
		} );
	} );
} );

describe( 'computeResponseAngles', () => {
	it( 'returns null without a grid', () => {
		expect( computeResponseAngles( {}, 0 ) ).toBeNull();
		expect( computeResponseAngles( null, 0 ) ).toBeNull();
	} );

	it( 'returns null for an index past the response count', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			6
		);

		expect( computeResponseAngles( source, 99 ) ).toBeNull();
	} );

	it( 'converts indices to degrees', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90 },
			6
		);

		expect( computeResponseAngles( source, 1 ) ).toMatchObject( {
			meridianDeg: 0,
			parallelDeg: 90,
			meridianIdx: 0,
			parallelIdx: 1,
		} );
		expect( computeResponseAngles( source, 3 ) ).toMatchObject( {
			meridianDeg: 90,
			parallelDeg: 90,
		} );
	} );

	/**
	 * Horizontal symmetry stores its meridians starting from the side rather
	 * than the front, so the reported azimuth is rotated by 90°.
	 */
	it( 'rotates the azimuth by 90° under horizontal symmetry', () => {
		const source = makeSource(
			{ meridian_step: 90, parallel_step: 90, symmetry: 2 },
			6
		);

		expect( computeResponseAngles( source, 0 )!.meridianDeg ).toBe( 90 );
		expect( computeResponseAngles( source, 3 )!.meridianDeg ).toBe( 180 );
	} );
} );

describe( 'computePolarSlices', () => {
	/**
	 * An axially symmetric source: every azimuth reads the same meridian, which
	 * makes the expected levels easy to reason about.
	 */
	function axialSource(): any {
		const source = makeSource(
			{ meridian_step: 360, parallel_step: 90, symmetry: 4 },
			3
		);
		// parallel 0/90/180 -> levels 100/94/88 at frequency index 0.
		source.Responses = [
			{ Level: [ 100 ], Frequencies: [ 1000 ] },
			{ Level: [ 94 ], Frequencies: [ 1000 ] },
			{ Level: [ 88 ], Frequencies: [ 1000 ] },
		];
		return source;
	}

	it( 'returns null without a balloon grid', () => {
		expect( computePolarSlices( {}, 0 ) ).toBeNull();
	} );

	it( 'produces a label per 10° step', () => {
		const slices = computePolarSlices( axialSource(), 0 )!;

		expect( slices.labels ).toHaveLength( 36 );
		expect( slices.labels[ 0 ] ).toBe( '0°' );
	} );

	it( 'reads on-axis at 0° and the rear pole at ±180°', () => {
		const slices = computePolarSlices( axialSource(), 0 )!;

		expect( slices.horizontal.levels[ 0 ] ).toBe( 100 );
		expect( slices.vertical.levels[ 0 ] ).toBe( 100 );

		const rear = slices.labels.indexOf( '±180°' );
		expect( slices.horizontal.levels[ rear ] ).toBe( 88 );
	} );

	it( 'takes the horizontal slice from meridian 90 and the vertical from 0', () => {
		const slices = computePolarSlices( axialSource(), 0 )!;

		expect( slices.horizontal.meridianDeg ).toBe( 90 );
		expect( slices.vertical.meridianDeg ).toBe( 0 );
	} );

	it( 'reports the grid in its metadata', () => {
		const slices = computePolarSlices( axialSource(), 0 )!;

		expect( slices.meta ).toMatchObject( {
			symmetry: 4,
			symmetryName: 'Axial',
			frontHalfOnly: false,
			parallelStep: 90,
			stepDeg: 10,
		} );
	} );

	it( 'yields null levels where no response covers the direction', () => {
		const source = makeSource(
			{ meridian_step: 360, parallel_step: 90, symmetry: 4 },
			1
		);

		const slices = computePolarSlices( source, 0 )!;

		// Only the front pole exists, so everything off axis is unmeasured.
		expect( slices.horizontal.levels[ 0 ] ).toBe( 0 );
		expect( slices.horizontal.levels[ 5 ] ).toBeNull();
	} );

	it( 'adds the on-axis spectrum when the frequency grids agree', () => {
		const source = axialSource();
		source.Definition.OnAxisSpectrum = {
			Definition: {
				bands_per_octave: 3,
				start_freq: 1000,
				point_count: 1,
			},
			Level: [ 10 ],
		};

		const slices = computePolarSlices( source, 0 )!;

		expect( slices.meta.usesOnAxis ).toBe( true );
		expect( slices.horizontal.levels[ 0 ] ).toBe( 110 );
	} );

	it( 'leaves the levels alone when the grids disagree', () => {
		const source = axialSource();
		source.Definition.OnAxisSpectrum = {
			Definition: { bands_per_octave: 3, start_freq: 50, point_count: 1 },
			Level: [ 10 ],
		};

		const slices = computePolarSlices( source, 0 )!;

		expect( slices.meta.usesOnAxis ).toBe( false );
		expect( slices.horizontal.levels[ 0 ] ).toBe( 100 );
	} );

	/**
	 * The `canCombineOnAxis` guard contains the tautology
	 * `onAxisLevel.length === onAxisLevel.length`, which reads like a typo for
	 * a comparison against the response length. It is redundant rather than
	 * broken: the preceding `sampleFreqs.length === onAxisFreqs.length` already
	 * enforces the intended rule, because `onAxisFreqs` is generated with
	 * `onAxisLevel.length` as its count override and therefore always has
	 * exactly that many entries.
	 *
	 * This test is what makes that reasoning checkable — a mismatched on-axis
	 * array is rejected, via the frequency-length check rather than the
	 * tautology. Repairing the line must not change this outcome.
	 */
	it( 'rejects a mismatched on-axis level array via the frequency lengths', () => {
		const source = axialSource();
		source.Definition.OnAxisSpectrum = {
			Definition: {
				bands_per_octave: 3,
				start_freq: 1000,
				point_count: 1,
			},
			// One frequency bin in the response, two on-axis levels.
			Level: [ 10, 20 ],
		};

		const slices = computePolarSlices( source, 0 )!;

		expect( slices.meta.usesOnAxis ).toBe( false );
		expect( slices.horizontal.levels[ 0 ] ).toBe( 100 );
	} );
} );

describe( 'computeLevelRange', () => {
	it( 'reports null bounds when nothing is measured', () => {
		expect( computeLevelRange( [] ) ).toEqual( { min: null, max: null } );
		expect( computeLevelRange( [ null, null ] ) ).toEqual( {
			min: null,
			max: null,
		} );
	} );

	it( 'ignores nulls and NaNs', () => {
		expect( computeLevelRange( [ null, 90, NaN, 100 ] ) ).toEqual( {
			min: 90,
			max: 100,
		} );
	} );

	it( 'handles a single value', () => {
		expect( computeLevelRange( [ 95 ] ) ).toEqual( { min: 95, max: 95 } );
	} );

	it( 'handles negative levels', () => {
		expect( computeLevelRange( [ -6, -12, 0 ] ) ).toEqual( {
			min: -12,
			max: 0,
		} );
	} );
} );
