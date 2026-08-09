/**
 * Tests for the polar-plot rendering helpers.
 *
 * Unreachable before the split, for the same reason as the other blocks:
 * view.ts pulls in the WASM loader and Chart.js at module scope.
 *
 * @package
 */

import {
	buildCanvasLabel,
	buildMetadataHtml,
	buildPolarDatasets,
	readBlockOptions,
} from './polar-render';

const OPTIONS = {
	fileName: 'example.gll',
	sourceIndex: 0,
	frequencyIndex: 0,
	showHorizontal: true,
	showVertical: true,
	normalized: false,
	chartHeight: 400,
};

/**
 * Slice metadata shaped like `computePolarSlices` returns.
 *
 * @param {Object} meta Overrides for the metadata block.
 */
function makeSlices( meta: any = {} ): any {
	return {
		meta: {
			stepDeg: 10,
			symmetryName: 'Axial',
			meridianStep: 10,
			parallelStep: 10,
			usesOnAxis: false,
			frontHalfOnly: false,
			...meta,
		},
	};
}

/**
 * A pattern flat inside `halfWidth` and well below threshold outside it, in the
 * angle order `buildPolarAngles( 10 )` produces.
 *
 * @param {number} halfWidth Half-angle at which the level drops.
 */
function pattern( halfWidth: number ): number[] {
	const angles = [ 0 ];
	for ( let a = -10; a >= -180; a -= 10 ) {
		angles.push( a );
	}
	for ( let a = 170; a > 0; a -= 10 ) {
		angles.push( a );
	}
	return angles.map( ( a ) => ( Math.abs( a ) <= halfWidth ? 100 : 80 ) );
}

/**
 * Parse an HTML string so it can be queried.
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
		expect( readBlockOptions( {} as DOMStringMap ) ).toEqual( {
			fileName: 'GLL File',
			sourceIndex: 0,
			frequencyIndex: 0,
			showHorizontal: true,
			showVertical: true,
			normalized: false,
			chartHeight: 400,
		} );
	} );

	it( 'reads the values a serialized block carries', () => {
		expect(
			readBlockOptions( {
				fileName: 'Coda.gll',
				sourceIndex: '1',
				frequencyIndex: '12',
				showHorizontal: 'false',
				showVertical: 'false',
				normalized: 'true',
				chartHeight: '720',
			} as DOMStringMap )
		).toEqual( {
			fileName: 'Coda.gll',
			sourceIndex: 1,
			frequencyIndex: 12,
			showHorizontal: false,
			showVertical: false,
			normalized: true,
			chartHeight: 720,
		} );
	} );

	it( 'keeps both planes on when the attributes are absent', () => {
		// A post serialized before these attributes existed must still show
		// both slices rather than an empty plot.
		const options = readBlockOptions( {} as DOMStringMap );

		expect( options.showHorizontal ).toBe( true );
		expect( options.showVertical ).toBe( true );
	} );

	it( 'falls back rather than yielding NaN for malformed numbers', () => {
		const options = readBlockOptions( {
			frequencyIndex: 'x',
			chartHeight: 'tall',
		} as DOMStringMap );

		expect( options.frequencyIndex ).toBe( 0 );
		expect( options.chartHeight ).toBe( 400 );
	} );
} );

describe( 'buildPolarDatasets', () => {
	const levels = pattern( 40 );

	it( 'emits one dataset per visible plane', () => {
		expect(
			buildPolarDatasets( {
				horizontalLevels: levels,
				verticalLevels: levels,
				freqLabel: '1.00 kHz',
				options: OPTIONS,
			} )
		).toHaveLength( 2 );

		expect(
			buildPolarDatasets( {
				horizontalLevels: levels,
				verticalLevels: levels,
				freqLabel: '1.00 kHz',
				options: { ...OPTIONS, showVertical: false },
			} )
		).toHaveLength( 1 );

		expect(
			buildPolarDatasets( {
				horizontalLevels: levels,
				verticalLevels: levels,
				freqLabel: '1.00 kHz',
				options: {
					...OPTIONS,
					showHorizontal: false,
					showVertical: false,
				},
			} )
		).toHaveLength( 0 );
	} );

	it( 'keeps horizontal blue and vertical red', () => {
		// Series encoding, matching the compass labels the radar plugin draws,
		// so these must not follow the theme.
		const [ horizontal, vertical ] = buildPolarDatasets( {
			horizontalLevels: levels,
			verticalLevels: levels,
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( horizontal.borderColor ).toBe( '#2563eb' );
		expect( vertical.borderColor ).toBe( '#dc2626' );
	} );

	it( 'labels each plane with the frequency', () => {
		const [ horizontal, vertical ] = buildPolarDatasets( {
			horizontalLevels: levels,
			verticalLevels: levels,
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( horizontal.label ).toBe( 'Horizontal @ 1.00 kHz' );
		expect( vertical.label ).toBe( 'Vertical @ 1.00 kHz' );
	} );

	it( 'marks the labels normalized when the levels are', () => {
		const [ horizontal, vertical ] = buildPolarDatasets( {
			horizontalLevels: levels,
			verticalLevels: levels,
			freqLabel: '1.00 kHz',
			options: { ...OPTIONS, normalized: true },
		} );

		expect( horizontal.label ).toBe( 'Horizontal @ 1.00 kHz (normalized)' );
		expect( vertical.label ).toBe( 'Vertical @ 1.00 kHz (normalized)' );
	} );

	it( 'passes the levels through untouched', () => {
		const [ horizontal ] = buildPolarDatasets( {
			horizontalLevels: levels,
			verticalLevels: levels,
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( horizontal.data ).toBe( levels );
	} );
} );

describe( 'buildMetadataHtml', () => {
	it( 'always shows frequency, symmetry and resolution', () => {
		const html = buildMetadataHtml( {
			slices: makeSlices(),
			source: {},
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( html ).toContain( 'Frequency:' );
		expect( html ).toContain( '1.00 kHz' );
		expect( html ).toContain( 'Symmetry:' );
		expect( html ).toContain( 'Axial' );
		expect( html ).toContain( 'Resolution:' );
		expect( html ).toContain( '10° × 10°' );
	} );

	it( 'shows the conditional badges only when they apply', () => {
		const plain = buildMetadataHtml( {
			slices: makeSlices(),
			source: {},
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( plain ).not.toContain( 'Normalized' );
		expect( plain ).not.toContain( 'Uses on-axis' );
		expect( plain ).not.toContain( 'Front-half only' );

		const full = buildMetadataHtml( {
			slices: makeSlices( { usesOnAxis: true, frontHalfOnly: true } ),
			source: {},
			freqLabel: '1.00 kHz',
			options: { ...OPTIONS, normalized: true },
		} );

		expect( full ).toContain( 'Normalized' );
		expect( full ).toContain( 'gll-meta-badge-highlight' );
		expect( full ).toContain( 'Uses on-axis' );
		expect( full ).toContain( 'Front-half only' );
	} );

	it( 'prefers the definition label over the placement label', () => {
		const html = buildMetadataHtml( {
			slices: makeSlices(),
			source: { Definition: { Label: 'Full Range' }, Label: 'srcMain' },
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( html ).toContain( 'Full Range' );
		expect( html ).not.toContain( 'srcMain' );
	} );

	it( 'omits the source badge when neither label is set', () => {
		const html = buildMetadataHtml( {
			slices: makeSlices(),
			source: {},
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( html ).not.toContain( 'Source:' );
	} );

	it( 'escapes a label out of the uploaded binary', () => {
		const host = parse(
			buildMetadataHtml( {
				slices: makeSlices(),
				source: { Label: '<script>alert(1)</script>' },
				freqLabel: '1.00 kHz',
				options: OPTIONS,
			} )
		);

		expect( host.querySelector( 'script' ) ).toBeNull();
	} );
} );

describe( 'buildCanvasLabel', () => {
	it( 'leads with the frequency and states each plane beamwidth', () => {
		const label = buildCanvasLabel( {
			slices: makeSlices(),
			horizontalLevels: pattern( 40 ),
			verticalLevels: pattern( 20 ),
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( label ).toContain( 'Polar directivity plot at 1.00 kHz' );
		expect( label ).toContain( 'horizontal −6 dB beamwidth' );
		expect( label ).toContain( 'vertical −6 dB beamwidth' );
		expect( label.endsWith( '.' ) ).toBe( true );
	} );

	it( 'describes only the planes that are shown', () => {
		const label = buildCanvasLabel( {
			slices: makeSlices(),
			horizontalLevels: pattern( 40 ),
			verticalLevels: pattern( 40 ),
			freqLabel: '1.00 kHz',
			options: { ...OPTIONS, showVertical: false },
		} );

		expect( label ).toContain( 'horizontal' );
		expect( label ).not.toContain( 'vertical' );
	} );

	it( 'says so when the beamwidth cannot be determined', () => {
		// A pattern that never drops 6 dB has no determinable coverage, and
		// saying that is better than omitting the figure silently.
		const flat = pattern( 180 );

		const label = buildCanvasLabel( {
			slices: makeSlices(),
			horizontalLevels: flat,
			verticalLevels: flat,
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( label ).toContain(
			'coverage not determinable from the measured data'
		);
	} );

	it( 'names the symmetry', () => {
		const label = buildCanvasLabel( {
			slices: makeSlices( { symmetryName: 'Quarter' } ),
			horizontalLevels: pattern( 40 ),
			verticalLevels: pattern( 40 ),
			freqLabel: '1.00 kHz',
			options: OPTIONS,
		} );

		expect( label ).toContain( 'Quarter symmetry' );
	} );

	it( 'mentions normalization only when it applies', () => {
		expect(
			buildCanvasLabel( {
				slices: makeSlices(),
				horizontalLevels: pattern( 40 ),
				verticalLevels: pattern( 40 ),
				freqLabel: '1.00 kHz',
				options: { ...OPTIONS, normalized: true },
			} )
		).toContain( 'levels normalized to the on-axis maximum' );

		expect(
			buildCanvasLabel( {
				slices: makeSlices(),
				horizontalLevels: pattern( 40 ),
				verticalLevels: pattern( 40 ),
				freqLabel: '1.00 kHz',
				options: OPTIONS,
			} )
		).not.toContain( 'normalized' );
	} );
} );
