/**
 * Tests for the polar compass Chart.js plugin.
 *
 * The plugin touches only a handful of 2D-context members, so a hand-rolled
 * recording stub is enough — and is preferable to pulling in a canvas mocking
 * library, which would bring a large dependency to cover six `fillText` calls.
 *
 * @package
 */

import polarCompassPlugin from './polar-compass-plugin';

interface DrawCall {
	text: string;
	x: number;
	y: number;
	fillStyle: string;
	textAlign: string;
	textBaseline: string;
}

/**
 * A minimal 2D context that records each `fillText` with the style state that
 * was active at the time.
 */
function createRecordingContext() {
	const calls: DrawCall[] = [];
	let saves = 0;
	let restores = 0;

	const ctx = {
		font: '',
		fillStyle: '',
		textAlign: '',
		textBaseline: '',
		save() {
			saves++;
		},
		restore() {
			restores++;
		},
		fillText( text: string, x: number, y: number ) {
			calls.push( {
				text,
				x,
				y,
				fillStyle: ctx.fillStyle,
				textAlign: ctx.textAlign,
				textBaseline: ctx.textBaseline,
			} );
		},
	};

	return {
		ctx,
		calls,
		get saves() {
			return saves;
		},
		get restores() {
			return restores;
		},
	};
}

/**
 * Build a chart stub with a radial scale.
 *
 * @param {Object|null} scale Radial scale, or null to omit `scales.r`.
 */
function createChart(
	scale: any = { xCenter: 200, yCenter: 150, drawingArea: 100 }
) {
	const recorder = createRecordingContext();
	return {
		recorder,
		chart: {
			ctx: recorder.ctx,
			scales: scale ? { r: scale } : {},
		},
	};
}

/**
 * Find the single recorded call for a label.
 *
 * @param {DrawCall[]} calls Recorded calls.
 * @param {string}     text  Label to look for.
 */
function call( calls: DrawCall[], text: string ): DrawCall {
	const found = calls.filter( ( entry ) => entry.text === text );
	expect( found ).toHaveLength( 1 );
	return found[ 0 ];
}

describe( 'polarCompassPlugin', () => {
	it( 'registers under the id Chart.js looks up in options', () => {
		// The plugin's per-chart options live at `options.plugins.polarCompass`,
		// which Chart.js keys off this id.
		expect( polarCompassPlugin.id ).toBe( 'polarCompass' );
		expect( polarCompassPlugin.defaults.textColor ).toBe( '#334155' );
	} );

	it( 'draws nothing when the radial scale is missing', () => {
		const { chart, recorder } = createChart( null );

		polarCompassPlugin.afterDraw( chart, {}, {} );

		expect( recorder.calls ).toHaveLength( 0 );
		expect( recorder.saves ).toBe( 0 );
	} );

	it( 'draws all six compass labels', () => {
		const { chart, recorder } = createChart();

		polarCompassPlugin.afterDraw( chart, {}, {} );

		expect( recorder.calls.map( ( entry ) => entry.text ) ).toEqual( [
			'Front',
			'Back',
			'Right',
			'Top',
			'Left',
			'Bottom',
		] );
	} );

	it( 'balances save and restore', () => {
		const { chart, recorder } = createChart();

		polarCompassPlugin.afterDraw( chart, {}, {} );

		expect( recorder.saves ).toBe( 1 );
		expect( recorder.restores ).toBe( 1 );
	} );

	it( 'colours the shared labels from the themed option', () => {
		const { chart, recorder } = createChart();

		polarCompassPlugin.afterDraw( chart, {}, { textColor: '#abcdef' } );

		expect( call( recorder.calls, 'Front' ).fillStyle ).toBe( '#abcdef' );
		expect( call( recorder.calls, 'Back' ).fillStyle ).toBe( '#abcdef' );
	} );

	it( 'falls back to the default text colour when options are absent', () => {
		const { chart, recorder } = createChart();

		polarCompassPlugin.afterDraw( chart, {}, undefined );

		expect( call( recorder.calls, 'Front' ).fillStyle ).toBe( '#334155' );
		expect( call( recorder.calls, 'Back' ).fillStyle ).toBe( '#334155' );
	} );

	it( 'keeps the horizontal and vertical labels on their series colours', () => {
		const { chart, recorder } = createChart();

		// These are series encoding, not chrome: they must ignore textColor so
		// they keep matching the blue and red datasets across themes.
		polarCompassPlugin.afterDraw( chart, {}, { textColor: '#abcdef' } );

		expect( call( recorder.calls, 'Right' ).fillStyle ).toBe( '#2563eb' );
		expect( call( recorder.calls, 'Left' ).fillStyle ).toBe( '#2563eb' );
		expect( call( recorder.calls, 'Top' ).fillStyle ).toBe( '#dc2626' );
		expect( call( recorder.calls, 'Bottom' ).fillStyle ).toBe( '#dc2626' );
	} );

	it( 'positions the labels around the drawing area', () => {
		// xCenter 200, yCenter 150, drawingArea 100; side offset 40, vert 28.
		const { chart, recorder } = createChart();

		polarCompassPlugin.afterDraw( chart, {}, {} );

		expect( call( recorder.calls, 'Front' ) ).toMatchObject( {
			x: 340,
			y: 150,
			textAlign: 'left',
			textBaseline: 'middle',
		} );
		expect( call( recorder.calls, 'Back' ) ).toMatchObject( {
			x: 60,
			y: 150,
			textAlign: 'right',
			textBaseline: 'middle',
		} );
		expect( call( recorder.calls, 'Right' ) ).toMatchObject( {
			x: 182,
			y: 22,
			textAlign: 'center',
			textBaseline: 'bottom',
		} );
		expect( call( recorder.calls, 'Top' ) ).toMatchObject( {
			x: 218,
			y: 22,
			textBaseline: 'bottom',
		} );
		expect( call( recorder.calls, 'Left' ) ).toMatchObject( {
			x: 178,
			y: 278,
			textBaseline: 'top',
		} );
		expect( call( recorder.calls, 'Bottom' ) ).toMatchObject( {
			x: 222,
			y: 278,
			textBaseline: 'top',
		} );
	} );

	it( 'keeps Front and Back vertically centred so the axis reads as an axis', () => {
		const { chart, recorder } = createChart( {
			xCenter: 50,
			yCenter: 75,
			drawingArea: 30,
		} );

		polarCompassPlugin.afterDraw( chart, {}, {} );

		expect( call( recorder.calls, 'Front' ).y ).toBe( 75 );
		expect( call( recorder.calls, 'Back' ).y ).toBe( 75 );
		expect( call( recorder.calls, 'Front' ).x ).toBe( 120 );
		expect( call( recorder.calls, 'Back' ).x ).toBe( -20 );
	} );
} );
