/**
 * Tests for the shared runtime accessibility helpers.
 *
 * Every block's view script calls into this module, and until now none of it
 * was covered — which meant the accessibility claims in the readme rested on
 * code no test had ever executed.
 *
 * @package
 */

import {
	prefersReducedMotion,
	initBlockLiveRegions,
	renderErrorPanel,
	describeCanvas,
	attachKeyboardOrbit,
	pickThirdOctaveIndices,
	beamwidthAtDrop,
} from './a11y';

const ORBIT_STEP = ( 3 * Math.PI ) / 180;

describe( 'prefersReducedMotion', () => {
	const original = ( window as any ).matchMedia;

	afterEach( () => {
		( window as any ).matchMedia = original;
	} );

	it( 'reads as "no preference" when matchMedia is unimplemented', () => {
		// Older jsdom builds ship no matchMedia at all, so the guard has to
		// treat a missing implementation as "no preference expressed" rather
		// than throwing on hydration.
		delete ( window as any ).matchMedia;

		expect( prefersReducedMotion() ).toBe( false );
	} );

	it( 'reports the media query result when matchMedia exists', () => {
		( window as any ).matchMedia = jest.fn( ( query: string ) => ( {
			matches: query === '(prefers-reduced-motion: reduce)',
		} ) );

		expect( prefersReducedMotion() ).toBe( true );
		expect( ( window as any ).matchMedia ).toHaveBeenCalledWith(
			'(prefers-reduced-motion: reduce)'
		);
	} );

	it( 'reports false when the visitor expressed no preference', () => {
		( window as any ).matchMedia = jest.fn( () => ( { matches: false } ) );

		expect( prefersReducedMotion() ).toBe( false );
	} );
} );

describe( 'initBlockLiveRegions', () => {
	it( 'hides the spinner, which is decoration with no text', () => {
		const block = document.createElement( 'div' );
		block.innerHTML =
			'<span class="gll-spinner"></span><span class="gll-spinner"></span>';

		initBlockLiveRegions( block );

		block.querySelectorAll( '.gll-spinner' ).forEach( ( spinner ) => {
			expect( spinner.getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		} );
	} );

	it( 'hides header glyphs that do not already declare themselves', () => {
		const block = document.createElement( 'div' );
		block.innerHTML = '<svg></svg><svg aria-hidden="false"></svg>';

		initBlockLiveRegions( block );

		const svgs = block.querySelectorAll( 'svg' );
		expect( svgs[ 0 ].getAttribute( 'aria-hidden' ) ).toBe( 'true' );
		// An explicit false is a decision someone made; do not overwrite it.
		expect( svgs[ 1 ].getAttribute( 'aria-hidden' ) ).toBe( 'false' );
	} );

	it( 'promotes an existing loading paragraph to the live region', () => {
		const block = document.createElement( 'div' );
		block.innerHTML = '<p class="gll-loading-text">Loading …</p>';

		initBlockLiveRegions( block );

		const region = block.querySelector( '.gll-loading-text' )!;
		expect( region.getAttribute( 'role' ) ).toBe( 'status' );
		expect( region.getAttribute( 'aria-live' ) ).toBe( 'polite' );
		expect( region.getAttribute( 'aria-atomic' ) ).toBe( 'true' );
		// Reused, not replaced: the existing "Loading …" mutation is what does
		// the announcing for six of the seven blocks.
		expect( block.querySelectorAll( '.gll-live-region' ) ).toHaveLength(
			0
		);
	} );

	it( 'creates an off-screen region for a block without one', () => {
		const block = document.createElement( 'div' );

		initBlockLiveRegions( block );

		const region = block.querySelector( '.gll-live-region' )!;
		expect( region ).not.toBeNull();
		// The class must be present or the region renders as visible page text,
		// which is exactly the defect Phase 11 found and fixed.
		expect( region.classList.contains( 'gll-visually-hidden' ) ).toBe(
			true
		);
		expect( region.getAttribute( 'role' ) ).toBe( 'status' );
		expect( region.getAttribute( 'aria-live' ) ).toBe( 'polite' );
	} );

	it( 'returns an announce function writing into that same region', () => {
		const block = document.createElement( 'div' );
		block.innerHTML = '<p class="gll-loading-text">Loading …</p>';

		const announce = initBlockLiveRegions( block );
		announce( 'Example Visualisation loaded' );

		expect( block.querySelector( '.gll-loading-text' )!.textContent ).toBe(
			'Example Visualisation loaded'
		);
	} );

	it( 'announces as text, never as markup', () => {
		const block = document.createElement( 'div' );

		const announce = initBlockLiveRegions( block );
		announce( '<img src=x onerror=alert(1)>' );

		expect( block.querySelectorAll( 'img' ) ).toHaveLength( 0 );
	} );
} );

describe( 'renderErrorPanel', () => {
	it( 'replaces the container contents with an assertive panel', () => {
		const container = document.createElement( 'div' );
		container.innerHTML = '<canvas></canvas><p>stale</p>';

		const panel = renderErrorPanel(
			container,
			'Could not fetch the file.'
		);

		expect( container.children ).toHaveLength( 1 );
		expect( container.firstElementChild ).toBe( panel );
		expect( panel.className ).toBe( 'gll-error' );
		// Assertive, not polite: the panel replaces the visualization the
		// reader came for and arrives long after the page settled.
		expect( panel.getAttribute( 'role' ) ).toBe( 'alert' );
	} );

	it( 'labels the panel and appends the message as text', () => {
		const container = document.createElement( 'div' );

		const panel = renderErrorPanel( container, 'Parse failed.' );

		expect( panel.querySelector( 'strong' )!.textContent ).toBe( 'Error:' );
		expect( panel.textContent ).toBe( 'Error: Parse failed.' );
	} );

	it( 'cannot be talked into markup by a message off the wire', () => {
		const container = document.createElement( 'div' );

		const panel = renderErrorPanel(
			container,
			'<img src=x onerror=alert(1)>'
		);

		expect( panel.querySelectorAll( '*' ) ).toHaveLength( 1 ); // the <strong>
		expect( container.querySelectorAll( 'img' ) ).toHaveLength( 0 );
		expect( panel.textContent ).toContain( '<img src=x onerror=alert(1)>' );
	} );

	it( 'survives an undefined message', () => {
		const container = document.createElement( 'div' );

		const panel = renderErrorPanel( container, undefined as any );

		expect( panel.textContent ).toBe( 'Error: ' );
	} );
} );

describe( 'describeCanvas', () => {
	it( 'turns an opaque canvas into a described single object', () => {
		const canvas = document.createElement( 'canvas' );

		describeCanvas( canvas, 'Polar plot at 1.00 kHz, beamwidth 90°.' );

		expect( canvas.getAttribute( 'role' ) ).toBe( 'img' );
		expect( canvas.getAttribute( 'aria-label' ) ).toBe(
			'Polar plot at 1.00 kHz, beamwidth 90°.'
		);
	} );
} );

describe( 'attachKeyboardOrbit', () => {
	let element: HTMLElement;
	let orbit: jest.Mock;
	let zoom: jest.Mock;
	let detach: () => void;

	beforeEach( () => {
		element = document.createElement( 'canvas' );
		document.body.appendChild( element );
		orbit = jest.fn();
		zoom = jest.fn();
		detach = attachKeyboardOrbit( element, { orbit, zoom } );
	} );

	afterEach( () => {
		detach();
		element.remove();
	} );

	/**
	 * Dispatch a cancelable keydown and report whether it was defaultPrevented.
	 *
	 * @param {string} key  Key value.
	 * @param {Object} init Extra event properties, e.g. modifier flags.
	 */
	function press( key: string, init: KeyboardEventInit = {} ): boolean {
		const event = new KeyboardEvent( 'keydown', {
			key,
			cancelable: true,
			bubbles: true,
			...init,
		} );
		element.dispatchEvent( event );
		return event.defaultPrevented;
	}

	it( 'makes the element focusable', () => {
		expect( element.getAttribute( 'tabindex' ) ).toBe( '0' );
	} );

	it( 'leaves an author-supplied tabindex alone', () => {
		const custom = document.createElement( 'canvas' );
		custom.setAttribute( 'tabindex', '-1' );

		const stop = attachKeyboardOrbit( custom, { orbit, zoom } );
		expect( custom.getAttribute( 'tabindex' ) ).toBe( '-1' );
		stop();
	} );

	it( 'orbits on each arrow key with a 3° step on one axis only', () => {
		press( 'ArrowLeft' );
		expect( orbit ).toHaveBeenLastCalledWith( -ORBIT_STEP, 0 );

		press( 'ArrowRight' );
		expect( orbit ).toHaveBeenLastCalledWith( ORBIT_STEP, 0 );

		press( 'ArrowUp' );
		expect( orbit ).toHaveBeenLastCalledWith( 0, -ORBIT_STEP );

		press( 'ArrowDown' );
		expect( orbit ).toHaveBeenLastCalledWith( 0, ORBIT_STEP );

		expect( orbit ).toHaveBeenCalledTimes( 4 );
	} );

	it( 'zooms in on + and =, out on - and _', () => {
		press( '+' );
		expect( zoom ).toHaveBeenLastCalledWith( 1 / 1.1 );
		press( '=' );
		expect( zoom ).toHaveBeenLastCalledWith( 1 / 1.1 );

		press( '-' );
		expect( zoom ).toHaveBeenLastCalledWith( 1.1 );
		press( '_' );
		expect( zoom ).toHaveBeenLastCalledWith( 1.1 );
	} );

	it( 'claims the keys it handled', () => {
		expect( press( 'ArrowLeft' ) ).toBe( true );
		expect( press( '+' ) ).toBe( true );
	} );

	it( 'leaves unhandled keys to the page', () => {
		expect( press( 'a' ) ).toBe( false );
		expect( press( 'Tab' ) ).toBe( false );
		expect( orbit ).not.toHaveBeenCalled();
		expect( zoom ).not.toHaveBeenCalled();
	} );

	it( 'yields modified presses to the browser', () => {
		// Ctrl+ArrowLeft and Cmd+- are browser and OS shortcuts; swallowing them
		// would break history navigation and page zoom.
		expect( press( 'ArrowLeft', { ctrlKey: true } ) ).toBe( false );
		expect( press( 'ArrowLeft', { metaKey: true } ) ).toBe( false );
		expect( press( '-', { altKey: true } ) ).toBe( false );

		expect( orbit ).not.toHaveBeenCalled();
		expect( zoom ).not.toHaveBeenCalled();
	} );

	it( 'stops responding once detached', () => {
		detach();

		press( 'ArrowLeft' );
		expect( orbit ).not.toHaveBeenCalled();
	} );
} );

describe( 'pickThirdOctaveIndices', () => {
	it( 'returns nothing for absent or empty input', () => {
		expect( pickThirdOctaveIndices( [] ) ).toEqual( [] );
		expect( pickThirdOctaveIndices( null as any ) ).toEqual( [] );
		expect( pickThirdOctaveIndices( undefined as any ) ).toEqual( [] );
	} );

	it( 'picks the nearest sample to each in-range band centre', () => {
		const frequencies = [ 90, 100, 110, 990, 1000, 1010 ];

		// Every centre from 100 Hz to 1 kHz is in range, and each snaps to
		// whichever of the six samples is closest — so the sparse middle of the
		// array collapses the run of centres between 125 Hz and 800 Hz onto
		// just the two samples bracketing the gap.
		expect( pickThirdOctaveIndices( frequencies ) ).toEqual( [
			1, 2, 3, 4,
		] );
	} );

	it( 'skips centres outside the measured range rather than clamping', () => {
		// A source measured from 200 Hz up must not claim a 20 Hz reading.
		const frequencies = [ 200, 250, 315, 400 ];

		const picked = pickThirdOctaveIndices( frequencies );

		expect( picked ).toEqual( [ 0, 1, 2, 3 ] );
		expect( picked ).not.toContain( -1 );
	} );

	it( 'collapses centres that land on the same coarse sample', () => {
		// Five samples an octave apart; many third-octave centres map onto each.
		const frequencies = [ 100, 200, 400, 800, 1600 ];

		const picked = pickThirdOctaveIndices( frequencies );

		expect( new Set( picked ).size ).toBe( picked.length );
	} );

	it( 'returns ascending indices', () => {
		const frequencies = Array.from(
			{ length: 241 },
			( _, index ) => 20 * Math.pow( 10, ( index * 3 ) / 240 )
		);

		const picked = pickThirdOctaveIndices( frequencies );

		for ( let i = 1; i < picked.length; i++ ) {
			expect( picked[ i ] ).toBeGreaterThan( picked[ i - 1 ] );
		}
	} );

	it( 'thins a 241-point sweep to at most the 31 band centres', () => {
		// The whole point: nobody listens to 241 rows read aloud.
		const frequencies = Array.from(
			{ length: 241 },
			( _, index ) => 20 * Math.pow( 10, ( index * 3 ) / 240 )
		);

		expect(
			pickThirdOctaveIndices( frequencies ).length
		).toBeLessThanOrEqual( 31 );
	} );
} );

describe( 'beamwidthAtDrop', () => {
	/**
	 * Build a symmetric pattern that is flat inside `halfWidth` and far below
	 * the threshold outside it.
	 *
	 * @param {number} halfWidth Half-angle at which the level drops.
	 */
	function symmetricPattern( halfWidth: number ) {
		const angles: number[] = [];
		const levels: number[] = [];
		for ( let angle = -180; angle <= 180; angle += 10 ) {
			angles.push( angle );
			levels.push( Math.abs( angle ) <= halfWidth ? 100 : 80 );
		}
		return { angles, levels };
	}

	it( 'returns null when the arrays disagree in length', () => {
		expect( beamwidthAtDrop( [ 0, 10 ], [ 100 ], 6 ) ).toBeNull();
		expect( beamwidthAtDrop( null as any, [ 100 ], 6 ) ).toBeNull();
		expect( beamwidthAtDrop( [ 0 ], null as any, 6 ) ).toBeNull();
	} );

	it( 'returns null without an on-axis sample', () => {
		expect( beamwidthAtDrop( [ -10, 10 ], [ 100, 100 ], 6 ) ).toBeNull();
	} );

	it( 'returns null when the on-axis level itself is not finite', () => {
		// A null at 0° is filtered out, so there is no on-axis entry left.
		expect(
			beamwidthAtDrop( [ -10, 0, 10 ], [ 90, null, 90 ], 6 )
		).toBeNull();
	} );

	it( 'measures a symmetric main lobe', () => {
		const { angles, levels } = symmetricPattern( 40 );

		// Flat 100 dB out to ±40, then 80 dB. The -6 dB threshold of 94 is first
		// undershot by the 80 dB sample at ±50, and interpolating back across
		// that 20 dB step puts the crossing 30% of the way from 40° to 50° —
		// so ±43°, i.e. 86° total rather than the 100° the raw samples suggest.
		expect( beamwidthAtDrop( angles, levels, 6 ) ).toBe( 86 );
	} );

	it( 'interpolates between the bracketing samples', () => {
		// Level falls linearly 100 -> 90 between 0° and 10° on each side. The
		// -5 dB threshold sits exactly halfway, at ±5°.
		const angles = [ -10, 0, 10 ];
		const levels = [ 90, 100, 90 ];

		expect( beamwidthAtDrop( angles, levels, 5 ) ).toBe( 10 );
	} );

	it( 'returns null when the level never crosses on one side', () => {
		const angles = [ -10, 0, 10 ];
		const levels = [ 100, 100, 100 ];

		expect( beamwidthAtDrop( angles, levels, 6 ) ).toBeNull();
	} );

	it( 'stops at the first crossing, so a rear lobe does not widen it', () => {
		// Main lobe out to ±10, a null, then a rear lobe back above threshold.
		const angles = [ -40, -30, -20, -10, 0, 10, 20, 30, 40 ];
		const levels = [ 99, 99, 70, 100, 100, 100, 70, 99, 99 ];

		// Threshold 94. First crossing on each side is the 70 at ±20, and the
		// 99s beyond it must be ignored.
		const width = beamwidthAtDrop( angles, levels, 6 )!;

		expect( width ).toBeLessThan( 40 );
	} );

	it( 'accepts the chart ordering rather than a sorted sweep', () => {
		// buildPolarAngles emits 0, -10 … -180, 170 … 10, which is useless for a
		// geometric walk — the function has to sort it itself.
		const angles = [ 0, -10, -20, -170, -180, 170, 20, 10 ];
		const levels = [ 100, 100, 80, 80, 80, 80, 80, 100 ];

		// Sorted, the lobe is 100 dB across -10…+10 and 80 dB at ±20, so the
		// 94 dB threshold interpolates to ±13° — 26° total. Reading the array
		// in its given order would instead walk 0° straight into -180°.
		expect( beamwidthAtDrop( angles, levels, 6 ) ).toBe( 26 );
	} );

	it( 'ignores null samples when walking outward', () => {
		const angles = [ -20, -10, 0, 10, 20 ];
		const levels = [ 80, null, 100, null, 80 ];

		// The nulls at ±10 drop out, leaving 0° bracketed directly by ±20°, so
		// the 94 dB threshold interpolates to ±6° rather than snapping to ±20°.
		expect( beamwidthAtDrop( angles, levels, 6 ) ).toBe( 12 );
	} );

	it( 'returns a rounded integer', () => {
		const angles = [ -10, 0, 10 ];
		const levels = [ 90, 100, 90 ];

		const width = beamwidthAtDrop( angles, levels, 3.33 )!;

		expect( Number.isInteger( width ) ).toBe( true );
	} );
} );
