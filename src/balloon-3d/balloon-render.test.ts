/**
 * Tests for the 3D balloon rendering helpers.
 *
 * Unreachable before the split: view.ts imports Three.js and the WASM loader at
 * module scope, and jsdom has no WebGL context.
 *
 * @package
 */

import {
	buildCanvasLabel,
	buildColorbarHtml,
	buildMetadataHtml,
	readBlockOptions,
	resolveQuality,
} from './balloon-render';

const OPTIONS = {
	fileName: 'example.gll',
	sourceIndex: 0,
	frequencyIndex: 0,
	dbRange: 40,
	scale: 1,
	wireframe: false,
	autoRotate: false,
	showReferenceSphere: true,
	showAxesHelper: true,
	canvasHeight: 500,
	qualityPreset: 'medium' as const,
};

const GRID = {
	fullMeridianCount: 36,
	fullParallelCount: 19,
	meridianStep: 10,
	parallelStep: 10,
	symmetryName: 'Axial',
};

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

describe( 'resolveQuality', () => {
	it( 'subsamples and drops lighting at low quality', () => {
		expect( resolveQuality( 'low' ) ).toEqual( {
			subsampleStride: 2,
			maxPixelRatio: 1,
			antialias: false,
			directionalLightIntensity: 0,
			fillLight: false,
		} );
	} );

	it( 'adds a fill light at high quality', () => {
		expect( resolveQuality( 'high' ).fillLight ).toBe( true );
		expect( resolveQuality( 'high' ).subsampleStride ).toBe( 1 );
	} );

	it( 'treats medium and anything unrecognized alike', () => {
		const medium = resolveQuality( 'medium' );

		expect( medium.fillLight ).toBe( false );
		expect( medium.subsampleStride ).toBe( 1 );
		expect( resolveQuality( 'nonsense' as any ) ).toEqual( medium );
	} );
} );

describe( 'readBlockOptions', () => {
	const original = ( window as any ).matchMedia;

	afterEach( () => {
		( window as any ).matchMedia = original;
	} );

	it( 'supplies every default for a block with no dataset entries', () => {
		expect( readBlockOptions( {} as DOMStringMap ) ).toEqual( {
			fileName: 'GLL File',
			sourceIndex: 0,
			frequencyIndex: 0,
			dbRange: 40,
			scale: 1,
			wireframe: false,
			autoRotate: false,
			showReferenceSphere: true,
			showAxesHelper: true,
			canvasHeight: 500,
			qualityPreset: 'medium',
		} );
	} );

	it( 'reads the values a serialized block carries', () => {
		const options = readBlockOptions( {
			fileName: 'Coda.gll',
			sourceIndex: '3',
			frequencyIndex: '11',
			dbRange: '60',
			scale: '1.4',
			wireframe: 'true',
			showReferenceSphere: 'false',
			showAxesHelper: 'false',
			canvasHeight: '700',
			qualityPreset: 'high',
		} as DOMStringMap );

		expect( options ).toMatchObject( {
			fileName: 'Coda.gll',
			sourceIndex: 3,
			frequencyIndex: 11,
			dbRange: 60,
			scale: 1.4,
			wireframe: true,
			showReferenceSphere: false,
			showAxesHelper: false,
			canvasHeight: 700,
			qualityPreset: 'high',
		} );
	} );

	it( 'falls back to medium for an unrecognized quality preset', () => {
		expect(
			readBlockOptions( { qualityPreset: 'ultra' } as DOMStringMap )
				.qualityPreset
		).toBe( 'medium' );
		expect(
			readBlockOptions( { qualityPreset: 'low' } as DOMStringMap )
				.qualityPreset
		).toBe( 'low' );
	} );

	it( 'keeps the reference sphere and axes on when the attributes are absent', () => {
		const options = readBlockOptions( {} as DOMStringMap );

		expect( options.showReferenceSphere ).toBe( true );
		expect( options.showAxesHelper ).toBe( true );
	} );

	it( 'honours the author when no motion preference is expressed', () => {
		( window as any ).matchMedia = jest.fn( () => ( { matches: false } ) );

		expect(
			readBlockOptions( { autoRotate: 'true' } as DOMStringMap )
				.autoRotate
		).toBe( true );
	} );

	/**
	 * Auto-rotation is unstoppable motion — the block offers no pause control —
	 * so the visitor's preference has to beat the author's choice outright.
	 */
	it( 'overrides the author under a reduced-motion preference', () => {
		( window as any ).matchMedia = jest.fn( () => ( { matches: true } ) );

		expect(
			readBlockOptions( { autoRotate: 'true' } as DOMStringMap )
				.autoRotate
		).toBe( false );
	} );
} );

describe( 'buildMetadataHtml', () => {
	it( 'reports the frequency, display window, grid and symmetry', () => {
		const html = buildMetadataHtml( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
			source: {},
			options: OPTIONS,
		} );

		expect( html ).toContain( '1.00 kHz' );
		expect( html ).toContain( '60.0' );
		expect( html ).toContain( '100.0' );
		expect( html ).toContain( '36' );
		expect( html ).toContain( '19' );
		expect( html ).toContain( 'Axial' );
		expect( html ).toContain( 'medium' );
	} );

	it( 'shows the state badges only when the states are on', () => {
		const plain = buildMetadataHtml( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
			source: {},
			options: OPTIONS,
		} );

		expect( plain ).not.toContain( 'Wireframe' );
		expect( plain ).not.toContain( 'Auto-Rotate' );

		const both = buildMetadataHtml( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
			source: {},
			options: { ...OPTIONS, wireframe: true, autoRotate: true },
		} );

		expect( both ).toContain( 'Wireframe' );
		expect( both ).toContain( 'Auto-Rotate' );
	} );

	it( 'prefers the definition label over the placement label', () => {
		const html = buildMetadataHtml( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
			source: { Definition: { Label: 'Full Range' }, Label: 'srcMain' },
			options: OPTIONS,
		} );

		expect( html ).toContain( 'Full Range' );
		expect( html ).not.toContain( 'srcMain' );
	} );

	it( 'escapes a label out of the uploaded binary', () => {
		const host = parse(
			buildMetadataHtml( {
				freqLabel: '1.00 kHz',
				displayMin: 60,
				displayMax: 100,
				balloonGrid: GRID,
				source: { Label: '<img src=x onerror=alert(1)>' },
				options: OPTIONS,
			} )
		);

		expect( host.querySelectorAll( 'img' ) ).toHaveLength( 0 );
	} );
} );

describe( 'buildColorbarHtml', () => {
	it( 'labels the bottom, middle and top of the scale', () => {
		const host = parse( buildColorbarHtml( 60, 100 ) );
		const labels = Array.from(
			host.querySelectorAll( '.gll-colorbar-labels span' )
		).map( ( span ) => span.textContent );

		expect( labels ).toEqual( [ '60 dB', '80 dB', '100 dB' ] );
	} );

	it( 'includes the gradient element the stylesheet paints', () => {
		const host = parse( buildColorbarHtml( 60, 100 ) );

		expect( host.querySelector( '.gll-colorbar-gradient' ) ).not.toBeNull();
	} );

	it( 'rounds the ticks rather than printing raw floats', () => {
		const host = parse( buildColorbarHtml( 57.34, 97.34 ) );
		const labels = Array.from(
			host.querySelectorAll( '.gll-colorbar-labels span' )
		).map( ( span ) => span.textContent );

		expect( labels ).toEqual( [ '57 dB', '77 dB', '97 dB' ] );
	} );
} );

describe( 'buildCanvasLabel', () => {
	it( 'states what is plotted rather than the word chart', () => {
		const label = buildCanvasLabel( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
		} );

		expect( label ).toContain( '3D directivity balloon at 1.00 kHz' );
		expect( label ).toContain( 'levels from 60.0 to 100.0 dB' );
		expect( label ).toContain( '36 by 19 measurement grid' );
		expect( label ).toContain( 'Axial symmetry' );
	} );

	/**
	 * The keyboard bindings exist only here. Nothing on screen mentions them, so
	 * dropping this sentence would make the viewer silently unoperable by
	 * keyboard for the people most likely to need it.
	 */
	it( 'states the keyboard bindings, which appear nowhere else', () => {
		const label = buildCanvasLabel( {
			freqLabel: '1.00 kHz',
			displayMin: 60,
			displayMax: 100,
			balloonGrid: GRID,
		} );

		expect( label ).toContain(
			'Use the arrow keys to rotate and the plus and minus keys to zoom.'
		);
	} );
} );
