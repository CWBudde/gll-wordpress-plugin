/**
 * Tests for the frequency-response rendering helpers.
 *
 * These could not be reached before the split: view.ts imports the WASM loader
 * at module scope and registers a DOMContentLoaded handler on import.
 *
 * @package
 */

import {
	buildCanvasLabel,
	buildDataTable,
	buildMetadataHtml,
	extractResponseData,
	readBlockOptions,
} from './response-render';

/**
 * Frequencies matching a 1/3-octave definition from 50 Hz, which is what
 * `buildLogFrequencies` regenerates for the on-axis comparison.
 *
 * @param {number} count Number of points.
 */
function logFrequencies( count: number ): number[] {
	return Array.from(
		{ length: count },
		( _, i ) => 50 * Math.pow( 2, i / 3 )
	);
}

/**
 * A source with one response and a matching on-axis spectrum.
 */
function makeSource(): any {
	return {
		Label: 'Full Range',
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
				Definition: {
					bands_per_octave: 3,
					start_freq: 50,
					point_count: 5,
				},
				Level: [ 90, 90, 90, 90, 90 ],
				Phase: [ 0, 0, 0, 0, 0 ],
				Delay: 0,
			},
		},
	};
}

const OPTIONS = {
	fileName: 'example.gll',
	sourceIndex: 0,
	responseIndex: 0,
	phaseMode: 'unwrapped',
	normalized: false,
	showPhase: true,
	showMagnitude: true,
	chartHeight: 400,
};

/**
 * Parse an HTML string into an element so it can be queried.
 *
 * @param {string} html Markup to parse.
 */
function parse( html: string ): HTMLElement {
	const host = document.createElement( 'div' );
	host.innerHTML = html;
	return host;
}

describe( 'readBlockOptions', () => {
	it( 'supplies every default for a block with no dataset entries', () => {
		// This is what a post serialized before an attribute existed renders
		// with, since save() output is frozen in post content.
		expect( readBlockOptions( {} as DOMStringMap ) ).toEqual( {
			fileName: 'GLL File',
			sourceIndex: 0,
			responseIndex: 0,
			phaseMode: 'unwrapped',
			normalized: false,
			showPhase: true,
			showMagnitude: true,
			chartHeight: 400,
		} );
	} );

	it( 'reads the values a serialized block carries', () => {
		const options = readBlockOptions( {
			fileName: 'Coda.gll',
			sourceIndex: '2',
			responseIndex: '7',
			phaseMode: 'group-delay',
			normalized: 'true',
			showPhase: 'false',
			showMagnitude: 'false',
			chartHeight: '650',
		} as DOMStringMap );

		expect( options ).toEqual( {
			fileName: 'Coda.gll',
			sourceIndex: 2,
			responseIndex: 7,
			phaseMode: 'group-delay',
			normalized: true,
			showPhase: false,
			showMagnitude: false,
			chartHeight: 650,
		} );
	} );

	it( 'defaults the on-by-default toggles on unless explicitly false', () => {
		// `!== 'false'` and not `=== 'true'`: an absent attribute has to read as
		// on, or every pre-existing post loses its phase curve.
		expect(
			readBlockOptions( { showPhase: 'true' } as DOMStringMap ).showPhase
		).toBe( true );
		expect(
			readBlockOptions( { showPhase: 'yes' } as DOMStringMap ).showPhase
		).toBe( true );
		expect(
			readBlockOptions( { showPhase: 'false' } as DOMStringMap ).showPhase
		).toBe( false );
	} );

	it( 'defaults the off-by-default toggle off unless explicitly true', () => {
		expect(
			readBlockOptions( { normalized: 'yes' } as DOMStringMap ).normalized
		).toBe( false );
		expect(
			readBlockOptions( { normalized: 'true' } as DOMStringMap )
				.normalized
		).toBe( true );
	} );

	it( 'falls back rather than yielding NaN for malformed numbers', () => {
		const options = readBlockOptions( {
			sourceIndex: 'abc',
			chartHeight: '',
		} as DOMStringMap );

		expect( options.sourceIndex ).toBe( 0 );
		expect( options.chartHeight ).toBe( 400 );
		expect( Number.isNaN( options.chartHeight ) ).toBe( false );
	} );
} );

describe( 'extractResponseData', () => {
	it( 'returns null when there is no such response', () => {
		expect( extractResponseData( {}, 0, 'unwrapped', false ) ).toBeNull();
		expect(
			extractResponseData( makeSource(), 9, 'unwrapped', false )
		).toBeNull();
	} );

	it( 'renames the series fields to what the chart code reads', () => {
		const data = extractResponseData(
			makeSource(),
			0,
			'unwrapped',
			false
		)!;

		expect( data.frequencies ).toHaveLength( 5 );
		expect( data.magnitudes ).toEqual( [ 91, 92, 93, 94, 95 ] );
		expect( data.phases ).toHaveLength( 5 );
		expect( data.phaseAxisTitle ).toBe( 'Phase (rad)' );
	} );

	it( 'reports an empty phase array rather than null', () => {
		const source = makeSource();
		source.Responses[ 0 ].Phase = [];
		delete source.Definition;

		const data = extractResponseData( source, 0, 'unwrapped', false )!;

		expect( Array.isArray( data.phases ) ).toBe( true );
	} );
} );

describe( 'buildMetadataHtml', () => {
	const frequencyData = { minFrequency: 50, maxFrequency: 5000 };

	it( 'always shows the frequency range', () => {
		const html = buildMetadataHtml( {
			source: {},
			frequencyData,
			options: OPTIONS,
			phaseSeries: null,
		} );

		expect( html ).toContain( 'Range:' );
		expect( html ).toContain( '50.0 Hz' );
		expect( html ).toContain( '5.00 kHz' );
	} );

	it.each( [
		[ 'unwrapped', 'Unwrapped Phase' ],
		[ 'wrapped', 'Wrapped Phase' ],
		[ 'group-delay', 'Group Delay' ],
		[ 'nonsense', 'Unwrapped Phase' ],
	] )( 'labels phase mode %s as %s', ( phaseMode, label ) => {
		const html = buildMetadataHtml( {
			source: {},
			frequencyData,
			options: { ...OPTIONS, phaseMode },
			phaseSeries: { label: 'Phase (rad)' },
		} );

		expect( html ).toContain( label );
	} );

	it( 'omits the phase badge when there is no phase series', () => {
		const html = buildMetadataHtml( {
			source: {},
			frequencyData,
			options: OPTIONS,
			phaseSeries: null,
		} );

		expect( html ).not.toContain( 'Phase:' );
	} );

	it( 'highlights the normalized badge', () => {
		const html = buildMetadataHtml( {
			source: {},
			frequencyData,
			options: { ...OPTIONS, normalized: true },
			phaseSeries: null,
		} );

		expect( html ).toContain( 'gll-meta-badge-highlight' );
		expect( html ).toContain( 'Normalized' );
	} );

	it( 'omits the source badge when the source is unnamed', () => {
		const html = buildMetadataHtml( {
			source: {},
			frequencyData,
			options: OPTIONS,
			phaseSeries: null,
		} );

		expect( html ).not.toContain( 'Source:' );
	} );

	it( 'escapes a source label out of the uploaded binary', () => {
		// The label is attacker-controlled in the sense that uploading a GLL is
		// not the same as being trusted to author markup.
		const host = parse(
			buildMetadataHtml( {
				source: { Label: '<img src=x onerror=alert(1)>' },
				frequencyData,
				options: OPTIONS,
				phaseSeries: null,
			} )
		);

		expect( host.querySelectorAll( 'img' ) ).toHaveLength( 0 );
		expect( host.textContent ).toContain( '<img src=x onerror=alert(1)>' );
	} );
} );

describe( 'buildCanvasLabel', () => {
	const frequencyData = { minFrequency: 50, maxFrequency: 5000 };

	it( 'names the source and the plotted span', () => {
		const label = buildCanvasLabel( {
			source: { Label: 'Full Range' },
			frequencyData,
			magnitudes: [ 90, 95, 100 ],
			options: OPTIONS,
			phaseSeries: null,
		} );

		expect( label ).toContain( 'Frequency response of Full Range' );
		expect( label ).toContain( '50.0 Hz to 5.00 kHz' );
		expect( label ).toContain( 'level 90.0 to 100.0 dB' );
		expect( label ).toContain( 'The plotted values follow in a table.' );
	} );

	it( 'falls back to the file name when the source is unnamed', () => {
		const label = buildCanvasLabel( {
			source: {},
			frequencyData,
			magnitudes: [ 90 ],
			options: OPTIONS,
			phaseSeries: null,
		} );

		expect( label ).toContain( 'Frequency response of example.gll' );
	} );

	it( 'states normalization as a clause, not a glued-on suffix', () => {
		const label = buildCanvasLabel( {
			source: { Label: 'Full Range' },
			frequencyData,
			magnitudes: [ 90 ],
			options: { ...OPTIONS, normalized: true },
			phaseSeries: null,
		} );

		expect( label ).toContain(
			'Frequency response of Full Range, normalized'
		);
	} );

	it( 'omits the level span when magnitudes are hidden or unusable', () => {
		expect(
			buildCanvasLabel( {
				source: {},
				frequencyData,
				magnitudes: [ 90 ],
				options: { ...OPTIONS, showMagnitude: false },
				phaseSeries: null,
			} )
		).not.toContain( 'level' );

		expect(
			buildCanvasLabel( {
				source: {},
				frequencyData,
				magnitudes: [ NaN, Infinity ],
				options: OPTIONS,
				phaseSeries: null,
			} )
		).not.toContain( 'level' );
	} );

	it( 'mentions the right axis only when a phase series is plotted', () => {
		expect(
			buildCanvasLabel( {
				source: {},
				frequencyData,
				magnitudes: [ 90 ],
				options: OPTIONS,
				phaseSeries: { label: 'Phase (rad)' },
			} )
		).toContain( 'Phase (rad) on the right axis' );

		expect(
			buildCanvasLabel( {
				source: {},
				frequencyData,
				magnitudes: [ 90 ],
				options: OPTIONS,
				phaseSeries: null,
			} )
		).not.toContain( 'right axis' );
	} );
} );

describe( 'buildDataTable', () => {
	it( 'returns null when no band centre falls inside the range', () => {
		expect( buildDataTable( [], [] ) ).toBeNull();
		// Everything above the highest ISO centre.
		expect( buildDataTable( [ 30000, 40000 ], [ 90, 90 ] ) ).toBeNull();
	} );

	it( 'returns null when every picked value is unusable', () => {
		expect( buildDataTable( [ 100, 1000 ], [ NaN, Infinity ] ) ).toBeNull();
	} );

	it( 'builds an off-screen table with scoped headers', () => {
		const table = buildDataTable( [ 100, 1000 ], [ 90.25, 95.75 ] )!;

		// Off-screen, not hidden: a hidden table is not read at all.
		expect( table.className ).toBe( 'gll-visually-hidden' );
		expect( table.querySelector( 'caption' ) ).not.toBeNull();
		expect( table.querySelectorAll( 'th[scope="col"]' ) ).toHaveLength( 2 );
		expect( table.querySelectorAll( 'th[scope="row"]' ) ).toHaveLength( 2 );
	} );

	it( 'formats the frequency and rounds the level to one decimal', () => {
		const table = buildDataTable( [ 100, 1000 ], [ 90.25, 95.75 ] )!;
		const rows = Array.from( table.querySelectorAll( 'tbody tr' ) );

		expect( rows[ 0 ].children[ 0 ].textContent ).toBe( '100.0 Hz' );
		expect( rows[ 0 ].children[ 1 ].textContent ).toBe( '90.3' );
		expect( rows[ 1 ].children[ 0 ].textContent ).toBe( '1.00 kHz' );
		expect( rows[ 1 ].children[ 1 ].textContent ).toBe( '95.8' );
	} );

	it( 'skips rows whose level is not finite', () => {
		const table = buildDataTable( [ 100, 1000 ], [ NaN, 95 ] )!;

		expect( table.querySelectorAll( 'tbody tr' ) ).toHaveLength( 1 );
	} );

	it( 'thins a dense sweep rather than tabulating every point', () => {
		// A GLL response commonly carries 241 points, and 241 rows read aloud
		// is obstruction rather than access.
		const frequencies = Array.from(
			{ length: 241 },
			( _, i ) => 20 * Math.pow( 10, ( i * 3 ) / 240 )
		);
		const magnitudes = frequencies.map( () => 90 );

		const table = buildDataTable( frequencies, magnitudes )!;

		expect(
			table.querySelectorAll( 'tbody tr' ).length
		).toBeLessThanOrEqual( 31 );
	} );
} );
