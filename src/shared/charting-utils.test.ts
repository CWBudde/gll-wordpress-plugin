/**
 * Tests for the frequency-response charting utilities.
 *
 * These functions carry the maths behind the frequency-response block and the
 * per-source charts in the main block: phase unwrapping, group delay, log tick
 * placement, and the on-axis combination rules. All of it is pure, and none of
 * it was covered.
 *
 * @package
 */

import {
	buildFrequencyPoints,
	buildLogFrequencyScale,
	getPhaseSeries,
	unwrapPhase,
	wrapPhase,
	computeGroupDelayMs,
	applyDelayToPhase,
	buildLogTicks,
	buildSourceResponseSeries,
	buildSourceResponseChartConfig,
	formatFrequency,
} from './charting-utils';

const TWO_PI = 2 * Math.PI;

/**
 * Frequencies matching a 1/3-octave definition starting at 50 Hz.
 *
 * `buildLogFrequencies` generates exactly this, so a fixture built from it is
 * accepted by the `frequenciesMatch` guard inside the on-axis combination.
 *
 * @param {number} count Number of points.
 */
function logFrequencies( count: number ): number[] {
	return Array.from(
		{ length: count },
		( _, i ) => 50 * Math.pow( 2, i / 3 )
	);
}

const ON_AXIS_DEFINITION = {
	bands_per_octave: 3,
	start_freq: 50,
	point_count: 5,
};

/**
 * Build a source shaped like the normalizer's PascalCase output.
 *
 * @param {Object} overrides Partial source to merge over the default.
 */
function makeSource( overrides: any = {} ): any {
	return {
		Responses: [
			{
				Frequencies: logFrequencies( 5 ),
				Level: [ 1, 2, 3, 4, 5 ],
				Phase: [ 0, 0.1, 0.2, 0.3, 0.4 ],
				Delay: 0,
			},
		],
		Definition: {
			OnAxisSpectrum: {
				Definition: ON_AXIS_DEFINITION,
				Level: [ 90, 90, 90, 90, 90 ],
				Phase: [ 1, 1, 1, 1, 1 ],
				Delay: 0,
			},
		},
		...overrides,
	};
}

describe( 'buildFrequencyPoints', () => {
	it( 'pairs frequencies with values and reports the range', () => {
		const result = buildFrequencyPoints( [ 100, 200, 400 ], [ 1, 2, 3 ] )!;

		expect( result.points ).toEqual( [
			{ x: 100, y: 1 },
			{ x: 200, y: 2 },
			{ x: 400, y: 3 },
		] );
		expect( result.minFrequency ).toBe( 100 );
		expect( result.maxFrequency ).toBe( 400 );
	} );

	it( 'rejects non-arrays, empties and length mismatches', () => {
		expect( buildFrequencyPoints( null, [ 1 ] ) ).toBeNull();
		expect( buildFrequencyPoints( [ 1 ], null ) ).toBeNull();
		expect( buildFrequencyPoints( [], [] ) ).toBeNull();
		expect( buildFrequencyPoints( [ 1, 2 ], [ 1 ] ) ).toBeNull();
	} );

	it( 'rejects a non-finite frequency range', () => {
		expect( buildFrequencyPoints( [ NaN, 200 ], [ 1, 2 ] ) ).toBeNull();
		expect(
			buildFrequencyPoints( [ 100, Infinity ], [ 1, 2 ] )
		).toBeNull();
	} );

	it( 'does not require the frequencies to be sorted', () => {
		const result = buildFrequencyPoints( [ 400, 100 ], [ 1, 2 ] )!;

		expect( result.minFrequency ).toBe( 100 );
		expect( result.maxFrequency ).toBe( 400 );
	} );
} );

describe( 'wrapPhase', () => {
	it( 'passes through null and undefined', () => {
		expect( wrapPhase( null ) ).toBeNull();
		expect( wrapPhase( undefined ) ).toBeNull();
	} );

	it( 'leaves values already inside the principal range alone', () => {
		expect( wrapPhase( 0 ) ).toBeCloseTo( 0, 12 );
		expect( wrapPhase( 1 ) ).toBeCloseTo( 1, 12 );
		expect( wrapPhase( -1 ) ).toBeCloseTo( -1, 12 );
	} );

	/**
	 * The half-open interval is [-π, π), not (-π, π]: an exact odd multiple of
	 * π lands on -π. Only the boundary sample is affected, but a chart reading
	 * -π where a reader expects +π is worth having written down.
	 */
	it( 'folds values outside the principal range back in', () => {
		expect( wrapPhase( 3 * Math.PI ) ).toBeCloseTo( -Math.PI, 10 );
		expect( wrapPhase( -3 * Math.PI ) ).toBeCloseTo( -Math.PI, 10 );
		expect( wrapPhase( Math.PI + 0.5 ) ).toBeCloseTo( -Math.PI + 0.5, 10 );
	} );

	it( 'always lands within [-π, π)', () => {
		for ( let value = -20; value <= 20; value += 0.37 ) {
			const wrapped = wrapPhase( value )!;
			expect( wrapped ).toBeGreaterThanOrEqual( -Math.PI - 1e-9 );
			expect( wrapped ).toBeLessThan( Math.PI + 1e-9 );
		}
	} );
} );

describe( 'unwrapPhase', () => {
	it( 'returns an empty array for absent or empty input', () => {
		expect( unwrapPhase( null ) ).toEqual( [] );
		expect( unwrapPhase( [] ) ).toEqual( [] );
	} );

	it( 'keeps the first sample as the anchor', () => {
		expect( unwrapPhase( [ 1.5, 1.6 ] )[ 0 ] ).toBe( 1.5 );
	} );

	it( 'removes a positive 2π jump', () => {
		// A wrapped ramp crossing +π: 3 -> -3 is a jump of -6, i.e. a wrap.
		const unwrapped = unwrapPhase( [ 3, -3 ] );

		expect( unwrapped[ 1 ] ).toBeCloseTo( -3 + TWO_PI, 10 );
	} );

	it( 'removes a negative 2π jump', () => {
		const unwrapped = unwrapPhase( [ -3, 3 ] );

		expect( unwrapped[ 1 ] ).toBeCloseTo( 3 - TWO_PI, 10 );
	} );

	it( 'reconstructs a linear ramp from its wrapped form', () => {
		// The property that matters: wrapping then unwrapping is the identity
		// (up to a constant) for any curve that never steps more than π.
		const ramp = Array.from( { length: 40 }, ( _, i ) => i * 0.7 );
		const wrapped = ramp.map( ( value ) => wrapPhase( value )! );

		const unwrapped = unwrapPhase( wrapped );
		const offset = ramp[ 0 ] - unwrapped[ 0 ];

		unwrapped.forEach( ( value: number, i: number ) => {
			expect( value + offset ).toBeCloseTo( ramp[ i ], 8 );
		} );
	} );

	it( 'leaves a monotonic series that never wraps untouched', () => {
		const input = [ 0, 0.5, 1, 1.5 ];

		expect( unwrapPhase( input ) ).toEqual( input );
	} );
} );

describe( 'computeGroupDelayMs', () => {
	it( 'returns an empty array without frequencies', () => {
		expect( computeGroupDelayMs( [], [] ) ).toEqual( [] );
		expect( computeGroupDelayMs( null, [ 1 ] ) ).toEqual( [] );
	} );

	it( 'recovers a constant delay from a linear phase ramp', () => {
		// Phase of a pure delay τ is φ(f) = -2πfτ, so the group delay
		// -1/2π · dφ/df must come back as exactly τ at every bin. This pins
		// both the sign and the 1/2π scaling.
		const tau = 0.002; // 2 ms
		const frequencies = [ 100, 200, 300, 400, 500 ];
		const phase = frequencies.map( ( f ) => -TWO_PI * f * tau );

		const delays = computeGroupDelayMs( frequencies, phase );

		expect( delays ).toHaveLength( 5 );
		delays.forEach( ( value: number ) => {
			expect( value ).toBeCloseTo( 2, 9 );
		} );
	} );

	it( 'uses one-sided differences at the ends and central ones between', () => {
		// A deliberately non-linear phase so the three branches disagree.
		const frequencies = [ 0, 1, 2 ];
		const phase = [ 0, 1, 4 ];
		const scale = ( -1 / TWO_PI ) * 1000;

		const delays = computeGroupDelayMs( frequencies, phase );

		expect( delays[ 0 ] ).toBeCloseTo( scale * 1, 9 ); // forward
		expect( delays[ 1 ] ).toBeCloseTo( scale * 2, 9 ); // central: 4/2
		expect( delays[ 2 ] ).toBeCloseTo( scale * 3, 9 ); // backward
	} );

	it( 'yields null where the frequency step is zero or not a number', () => {
		expect( computeGroupDelayMs( [ 100, 100 ], [ 0, 1 ] ) ).toEqual( [
			null,
			null,
		] );
		expect( computeGroupDelayMs( [ 100, 200 ], [ 0, NaN ] ) ).toEqual( [
			null,
			null,
		] );
	} );

	it( 'stops at the shorter of the two arrays', () => {
		expect( computeGroupDelayMs( [ 1, 2, 3, 4 ], [ 0, 1 ] ) ).toHaveLength(
			2
		);
	} );
} );

describe( 'applyDelayToPhase', () => {
	const phase = [ 0, 0, 0 ];
	const frequencies = [ 100, 200, 300 ];

	it( 'is the identity for a zero or absent delay', () => {
		expect( applyDelayToPhase( phase, frequencies, 0 ) ).toBe( phase );
		expect( applyDelayToPhase( phase, frequencies, undefined ) ).toBe(
			phase
		);
	} );

	it( 'is the identity when the arrays do not line up', () => {
		expect( applyDelayToPhase( phase, [ 100 ], 0.001 ) ).toBe( phase );
		expect( applyDelayToPhase( phase, null, 0.001 ) ).toBe( phase );
		expect( applyDelayToPhase( null, frequencies, 0.001 ) ).toBeNull();
	} );

	it( 'subtracts 2πfτ at each frequency', () => {
		const tau = 0.001;

		const shifted = applyDelayToPhase( phase, frequencies, tau );

		shifted.forEach( ( value: number, i: number ) => {
			expect( value ).toBeCloseTo( -TWO_PI * frequencies[ i ] * tau, 9 );
		} );
	} );

	it( 'round-trips against computeGroupDelayMs', () => {
		// Applying a delay of τ to flat phase must make the group delay read τ.
		const tau = 0.0035;
		const freqs = [ 100, 200, 300, 400 ];

		const shifted = applyDelayToPhase( [ 0, 0, 0, 0 ], freqs, tau );
		const delays = computeGroupDelayMs( freqs, shifted );

		delays.forEach( ( value: number ) => {
			expect( value ).toBeCloseTo( tau * 1000, 9 );
		} );
	} );
} );

describe( 'buildLogTicks', () => {
	it( 'returns nothing for a non-positive or missing range', () => {
		expect( buildLogTicks( 0, 1000 ) ).toEqual( [] );
		expect( buildLogTicks( 100, 0 ) ).toEqual( [] );
		expect( buildLogTicks( -10, 1000 ) ).toEqual( [] );
		expect( buildLogTicks( undefined, 1000 ) ).toEqual( [] );
	} );

	it( 'emits 1-9 per decade, clipped to the range and ascending', () => {
		const ticks = buildLogTicks( 20, 20000 ).map(
			( tick: any ) => tick.value
		);

		expect( ticks[ 0 ] ).toBe( 20 );
		expect( ticks ).toContain( 100 );
		expect( ticks ).toContain( 1000 );
		expect( ticks ).toContain( 10000 );
		expect( Math.max( ...ticks ) ).toBeLessThanOrEqual( 20000 );
		for ( let i = 1; i < ticks.length; i++ ) {
			expect( ticks[ i ] ).toBeGreaterThan( ticks[ i - 1 ] );
		}
	} );

	it( 'never emits a value outside the range', () => {
		const ticks = buildLogTicks( 250, 3000 ).map(
			( tick: any ) => tick.value
		);

		ticks.forEach( ( value: number ) => {
			expect( value ).toBeGreaterThanOrEqual( 250 );
			expect( value ).toBeLessThanOrEqual( 3000 );
		} );
	} );

	/**
	 * `startPower` is floored at 1, so the first decade considered is always
	 * 10 Hz even when the data starts below it. Sub-10 Hz data therefore gets
	 * no ticks below 10 — worth pinning, because it looks like a bug until you
	 * notice no GLL is measured down there.
	 */
	it( 'starts at the 10 Hz decade even for sub-10 Hz data', () => {
		const ticks = buildLogTicks( 1, 100 ).map(
			( tick: any ) => tick.value
		);

		expect( Math.min( ...ticks ) ).toBe( 10 );
	} );
} );

describe( 'buildLogFrequencyScale', () => {
	const scale = buildLogFrequencyScale( 50, 5000, 'Frequency' );

	it( 'describes a logarithmic axis over the given range', () => {
		expect( scale.type ).toBe( 'logarithmic' );
		expect( scale.min ).toBe( 50 );
		expect( scale.max ).toBe( 5000 );
		expect( scale.title ).toEqual( { display: true, text: 'Frequency' } );
		expect( scale.ticks.autoSkip ).toBe( false );
	} );

	it( 'labels only the powers of ten', () => {
		const label = scale.ticks.callback;

		expect( label( 100 ) ).toBe( '100' );
		expect( label( 1000 ) ).toBe( '1.0k' );
		expect( label( 10000 ) ).toBe( '10.0k' );
		// Everything between decades is drawn but left unlabelled, so the axis
		// keeps its log grid without turning into a wall of text.
		expect( label( 300 ) ).toBe( '' );
		expect( label( 2000 ) ).toBe( '' );
		expect( label( 0 ) ).toBe( '' );
	} );

	it( 'replaces Chart.js ticks with the decade ladder', () => {
		const target: any = { min: 50, max: 5000, ticks: [ { value: 1 } ] };

		scale.afterBuildTicks( target );

		expect( target.ticks ).toEqual( buildLogTicks( 50, 5000 ) );
	} );
} );

describe( 'getPhaseSeries', () => {
	const frequencies = [ 100, 200, 300 ];
	const phase = [ 3, -3, 3 ];
	const unwrapped = unwrapPhase( phase );

	it( 'wraps the raw phase in wrapped mode', () => {
		const series = getPhaseSeries(
			'wrapped',
			frequencies,
			phase,
			unwrapped
		);

		expect( series.values ).toEqual( phase.map( ( v ) => wrapPhase( v ) ) );
		expect( series.axisTitle ).toBe( 'Phase (rad)' );
		expect( series.format( 1.23456 ) ).toBe( '1.2346' );
	} );

	it( 'returns the unwrapped array by reference in unwrapped mode', () => {
		const series = getPhaseSeries(
			'unwrapped',
			frequencies,
			phase,
			unwrapped
		);

		expect( series.values ).toBe( unwrapped );
	} );

	it( 'falls back to unwrapped for an unknown mode', () => {
		const series = getPhaseSeries(
			'nonsense',
			frequencies,
			phase,
			unwrapped
		);

		expect( series.values ).toBe( unwrapped );
	} );

	it( 'computes group delay in group-delay mode', () => {
		const series = getPhaseSeries(
			'group-delay',
			frequencies,
			phase,
			unwrapped
		);

		expect( series.values ).toEqual(
			computeGroupDelayMs( frequencies, unwrapped )
		);
		expect( series.axisTitle ).toBe( 'Group Delay (ms)' );
		expect( series.format( 1.23456 ) ).toBe( '1.235' );
	} );

	it( 'formats a missing value as a dash rather than NaN', () => {
		const series = getPhaseSeries(
			'wrapped',
			frequencies,
			phase,
			unwrapped
		);

		expect( series.format( null ) ).toBe( '-' );
		expect( series.format( undefined ) ).toBe( '-' );
		expect( series.format( NaN ) ).toBe( '-' );
	} );
} );

describe( 'buildSourceResponseSeries', () => {
	it( 'returns null when the response is missing or out of range', () => {
		expect( buildSourceResponseSeries( null, 0 ) ).toBeNull();
		expect( buildSourceResponseSeries( {}, 0 ) ).toBeNull();
		expect( buildSourceResponseSeries( makeSource(), 5 ) ).toBeNull();
	} );

	it( 'returns null when frequencies or levels are empty', () => {
		expect(
			buildSourceResponseSeries(
				{ Responses: [ { Frequencies: [], Level: [ 1 ] } ] },
				0
			)
		).toBeNull();
		expect(
			buildSourceResponseSeries(
				{ Responses: [ { Frequencies: [ 100 ], Level: [] } ] },
				0
			)
		).toBeNull();
	} );

	/**
	 * The `pick()` fallback chain exists because the normalizer emits
	 * PascalCase while raw parser output is snake_case, and both shapes reach
	 * this function from different call sites.
	 */
	it( 'reads PascalCase and snake_case identically', () => {
		const pascal = buildSourceResponseSeries( makeSource(), 0 )!;
		const snake = buildSourceResponseSeries(
			{
				responses: [
					{
						frequencies: logFrequencies( 5 ),
						level: [ 1, 2, 3, 4, 5 ],
						phase: [ 0, 0.1, 0.2, 0.3, 0.4 ],
						delay: 0,
					},
				],
				definition: {
					on_axis_spectrum: {
						definition: ON_AXIS_DEFINITION,
						level: [ 90, 90, 90, 90, 90 ],
						phase: [ 1, 1, 1, 1, 1 ],
						delay: 0,
					},
				},
			},
			0
		)!;

		expect( snake.level ).toEqual( pascal.level );
		expect( snake.phase ).toEqual( pascal.phase );
		expect( snake.canCombineOnAxis ).toBe( pascal.canCombineOnAxis );
		expect( snake.canCombinePhase ).toBe( pascal.canCombinePhase );
	} );

	it( 'adds the on-axis spectrum to the directivity levels', () => {
		const series = buildSourceResponseSeries( makeSource(), 0 )!;

		expect( series.canCombineOnAxis ).toBe( true );
		expect( series.level ).toEqual( [ 91, 92, 93, 94, 95 ] );
	} );

	it( 'adds the on-axis phase too', () => {
		const series = buildSourceResponseSeries( makeSource(), 0, 'wrapped' )!;

		expect( series.canCombinePhase ).toBe( true );
		// Directivity phase + 1 rad of on-axis phase, then wrapped.
		expect( series.phase[ 0 ] ).toBeCloseTo( 1, 9 );
		expect( series.phase[ 4 ] ).toBeCloseTo( 1.4, 9 );
	} );

	it( 'skips the on-axis combination when normalized', () => {
		// Normalized means "show directivity relative to on-axis", so adding
		// the on-axis level back would undo exactly what was asked for.
		const series = buildSourceResponseSeries(
			makeSource(),
			0,
			'unwrapped',
			true
		)!;

		expect( series.canCombineOnAxis ).toBe( false );
		expect( series.level ).toEqual( [ 1, 2, 3, 4, 5 ] );
	} );

	it( 'skips the combination when the lengths differ', () => {
		const source = makeSource();
		source.Definition.OnAxisSpectrum.Level = [ 90, 90, 90 ];

		const series = buildSourceResponseSeries( source, 0 )!;

		expect( series.canCombineOnAxis ).toBe( false );
		expect( series.level ).toEqual( [ 1, 2, 3, 4, 5 ] );
	} );

	it( 'skips the combination when the frequency grids disagree', () => {
		const source = makeSource();
		// Perturb one bin well past the 1e-3 relative tolerance.
		source.Responses[ 0 ].Frequencies = logFrequencies( 5 ).map(
			( value, i ) => ( i === 2 ? value * 1.5 : value )
		);

		const series = buildSourceResponseSeries( source, 0 )!;

		expect( series.canCombineOnAxis ).toBe( false );
	} );

	it( 'combines levels but not phase when only the phase lengths differ', () => {
		const source = makeSource();
		source.Definition.OnAxisSpectrum.Phase = [ 1, 1 ];

		const series = buildSourceResponseSeries( source, 0 )!;

		expect( series.canCombineOnAxis ).toBe( true );
		expect( series.canCombinePhase ).toBe( false );
	} );

	it( 'applies the response and on-axis delays to the phase', () => {
		const source = makeSource();
		source.Responses[ 0 ].Phase = [ 0, 0, 0, 0, 0 ];
		source.Responses[ 0 ].Delay = 0.001;
		source.Definition.OnAxisSpectrum.Phase = [ 0, 0, 0, 0, 0 ];
		source.Definition.OnAxisSpectrum.Delay = 0.002;

		const series = buildSourceResponseSeries( source, 0, 'wrapped' )!;
		const frequencies = logFrequencies( 5 );

		// Delays sum to 3 ms and shift phase by -2πfτ.
		expect( series.phase[ 0 ] ).toBeCloseTo(
			wrapPhase( -TWO_PI * frequencies[ 0 ] * 0.003 )!,
			9
		);
	} );

	it( 'treats a missing on-axis spectrum as directivity only', () => {
		const series = buildSourceResponseSeries(
			{ Responses: makeSource().Responses },
			0
		)!;

		expect( series.canCombineOnAxis ).toBe( false );
		expect( series.level ).toEqual( [ 1, 2, 3, 4, 5 ] );
	} );

	it( 'does not alias the source arrays', () => {
		const source = makeSource();

		const series = buildSourceResponseSeries(
			source,
			0,
			'unwrapped',
			true
		)!;
		series.level[ 0 ] = 999;

		expect( source.Responses[ 0 ].Level[ 0 ] ).toBe( 1 );
	} );
} );

describe( 'buildSourceResponseChartConfig', () => {
	it( 'returns null when no series can be built', () => {
		expect( buildSourceResponseChartConfig( null, 0 ) ).toBeNull();
		expect( buildSourceResponseChartConfig( makeSource(), 9 ) ).toBeNull();
	} );

	it( 'builds two datasets bound to the two y axes', () => {
		const config = buildSourceResponseChartConfig( makeSource(), 0 )!;

		expect( config.type ).toBe( 'line' );
		expect( config.data.datasets ).toHaveLength( 2 );
		expect( config.data.datasets[ 0 ].yAxisID ).toBe( 'y' );
		expect( config.data.datasets[ 1 ].yAxisID ).toBe( 'y1' );
		expect( config.data.datasets[ 0 ].borderColor ).toBe( '#2563eb' );
		expect( config.data.datasets[ 1 ].borderColor ).toBe( '#dc2626' );
	} );

	it( 'uses the log frequency scale on x and keeps y1 grid lines off', () => {
		const config = buildSourceResponseChartConfig( makeSource(), 0 )!;

		expect( config.options.scales.x.type ).toBe( 'logarithmic' );
		expect( config.options.scales.y1.grid.drawOnChartArea ).toBe( false );
		expect( config.options.scales.y1.position ).toBe( 'right' );
	} );

	it( 'says so in the labels when the on-axis spectrum was folded in', () => {
		const config = buildSourceResponseChartConfig( makeSource(), 0 )!;

		expect( config.data.datasets[ 0 ].label ).toBe(
			'Level (dB, on-axis + directivity)'
		);
		expect( config.data.datasets[ 1 ].label ).toBe(
			'Phase (rad) (on-axis + directivity)'
		);
	} );

	it( 'uses the plain labels when it was not', () => {
		const config = buildSourceResponseChartConfig(
			makeSource(),
			0,
			'unwrapped',
			true
		)!;

		expect( config.data.datasets[ 0 ].label ).toBe( 'Level (dB)' );
		expect( config.data.datasets[ 1 ].label ).toBe( 'Phase (rad)' );
	} );

	it( 'titles the tooltip with the formatted frequency', () => {
		const config = buildSourceResponseChartConfig( makeSource(), 0 )!;
		const title = config.options.plugins.tooltip.callbacks.title;

		expect( title( [ { parsed: { x: 1000 } } ] ) ).toBe( '1.00 kHz' );
		expect( title( [ { parsed: { x: 440 } } ] ) ).toBe( '440.0 Hz' );
		expect( title( [] ) ).toBe( '' );
		expect( title( undefined ) ).toBe( '' );
	} );

	it( 'carries the phase axis title through to y1', () => {
		const config = buildSourceResponseChartConfig(
			makeSource(),
			0,
			'group-delay'
		)!;

		expect( config.options.scales.y1.title.text ).toBe(
			'Group Delay (ms)'
		);
	} );
} );

describe( 'formatFrequency', () => {
	it( 'renders a dash for a missing or zero frequency', () => {
		expect( formatFrequency( 0 ) ).toBe( '-' );
		expect( formatFrequency( null ) ).toBe( '-' );
		expect( formatFrequency( undefined ) ).toBe( '-' );
	} );

	it( 'uses Hz below 1 kHz and kHz at or above it', () => {
		expect( formatFrequency( 50 ) ).toBe( '50.0 Hz' );
		expect( formatFrequency( 999 ) ).toBe( '999.0 Hz' );
		expect( formatFrequency( 1000 ) ).toBe( '1.00 kHz' );
		expect( formatFrequency( 12500 ) ).toBe( '12.50 kHz' );
	} );
} );
