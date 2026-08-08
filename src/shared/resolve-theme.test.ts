/**
 * Tests for theme token resolution.
 *
 * @package
 */

import {
	resolveTheme,
	parseColor,
	relativeLuminance,
	withAlpha,
	THEME_FALLBACKS,
} from './resolve-theme';

/**
 * Build a detached element carrying the given custom properties.
 *
 * Custom properties are set inline because jsdom does not implement custom
 * property inheritance through stylesheets.
 *
 * @param tokens Map of token name (without `--gll-`) to value.
 * @return The element, attached to the document.
 */
function elementWithTokens( tokens: Record< string, string > ): HTMLElement {
	const el = document.createElement( 'div' );
	Object.entries( tokens ).forEach( ( [ name, value ] ) => {
		el.style.setProperty( `--gll-${ name }`, value );
	} );
	document.body.appendChild( el );
	return el;
}

afterEach( () => {
	document.body.innerHTML = '';
} );

describe( 'parseColor', () => {
	it( 'parses six-digit hex', () => {
		expect( parseColor( '#ababab' ) ).toEqual( [ 171, 171, 171 ] );
	} );

	it( 'parses three-digit hex', () => {
		expect( parseColor( '#111' ) ).toEqual( [ 17, 17, 17 ] );
	} );

	it( 'parses eight-digit hex by ignoring alpha', () => {
		expect( parseColor( '#0a0a0aff' ) ).toEqual( [ 10, 10, 10 ] );
	} );

	it( 'parses legacy comma rgb syntax', () => {
		expect( parseColor( 'rgb(255, 128, 0)' ) ).toEqual( [ 255, 128, 0 ] );
	} );

	it( 'parses modern space rgb syntax with alpha', () => {
		expect( parseColor( 'rgb(9 9 9 / 50%)' ) ).toEqual( [ 9, 9, 9 ] );
	} );

	it( 'parses percentage channels', () => {
		expect( parseColor( 'rgb(100%, 0%, 0%)' ) ).toEqual( [ 255, 0, 0 ] );
	} );

	it( 'parses named colors it knows', () => {
		expect( parseColor( 'white' ) ).toEqual( [ 255, 255, 255 ] );
	} );

	it( 'returns null for transparent', () => {
		expect( parseColor( 'transparent' ) ).toBeNull();
	} );

	it( 'returns null for values it cannot understand', () => {
		expect( parseColor( 'color-mix(in srgb, red, blue)' ) ).toBeNull();
		expect( parseColor( 'currentColor' ) ).toBeNull();
		expect( parseColor( '' ) ).toBeNull();
		expect( parseColor( '#12345' ) ).toBeNull();
	} );
} );

describe( 'relativeLuminance', () => {
	it( 'reports 0 for black and 1 for white', () => {
		expect( relativeLuminance( [ 0, 0, 0 ] ) ).toBeCloseTo( 0, 5 );
		expect( relativeLuminance( [ 255, 255, 255 ] ) ).toBeCloseTo( 1, 5 );
	} );

	it( 'clamps out-of-range channels', () => {
		expect( relativeLuminance( [ 300, 300, 300 ] ) ).toBeCloseTo( 1, 5 );
		expect( relativeLuminance( [ -20, -20, -20 ] ) ).toBeCloseTo( 0, 5 );
	} );
} );

describe( 'withAlpha', () => {
	it( 'converts a parseable color to rgba', () => {
		expect( withAlpha( '#444', 0.25 ) ).toBe( 'rgba(68, 68, 68, 0.25)' );
	} );

	it( 'passes through a color it cannot parse', () => {
		expect( withAlpha( 'currentColor', 0.25 ) ).toBe( 'currentColor' );
	} );
} );

describe( 'resolveTheme', () => {
	it( 'returns the theme tokens when they are present', () => {
		// The values classy-black-2026 resolves to on pcjv.de.
		const el = elementWithTokens( {
			text: '#ababab',
			'text-muted': '#757575',
			border: '#444',
			accent: '#fefefe',
			surface: '#111',
		} );

		expect( resolveTheme( el ) ).toEqual( {
			text: '#ababab',
			textMuted: '#757575',
			border: '#444',
			accent: '#fefefe',
			surface: '#111',
			isDark: true,
		} );
	} );

	it( 'falls back to the plugin defaults when no tokens are set', () => {
		const el = elementWithTokens( {} );

		expect( resolveTheme( el ) ).toEqual( {
			...THEME_FALLBACKS,
			isDark: false,
		} );
	} );

	it( 'falls back for individual tokens that are missing', () => {
		const el = elementWithTokens( { text: '#0f0f0f' } );
		const theme = resolveTheme( el );

		expect( theme.text ).toBe( '#0f0f0f' );
		expect( theme.border ).toBe( THEME_FALLBACKS.border );
	} );

	it( 'reports isDark false for a light surface', () => {
		const el = elementWithTokens( { surface: '#ffffff' } );
		expect( resolveTheme( el ).isDark ).toBe( false );
	} );

	it( 'reports isDark true for a dark surface', () => {
		const el = elementWithTokens( { surface: '#090909' } );
		expect( resolveTheme( el ).isDark ).toBe( true );
	} );

	it( 'infers isDark from light text when the surface is transparent', () => {
		// What the `transparent` appearance produces: the surface says nothing,
		// so the text color has to decide.
		const el = elementWithTokens( {
			surface: 'transparent',
			text: '#ababab',
		} );
		expect( resolveTheme( el ).isDark ).toBe( true );
	} );

	it( 'infers isDark false from dark text when the surface is transparent', () => {
		const el = elementWithTokens( {
			surface: 'transparent',
			text: '#222222',
		} );
		expect( resolveTheme( el ).isDark ).toBe( false );
	} );

	it( 'reports light rather than throwing when nothing parses', () => {
		const el = elementWithTokens( {
			surface: 'color-mix(in srgb, red, blue)',
			text: 'currentColor',
		} );

		const theme = resolveTheme( el );
		expect( theme.isDark ).toBe( false );
		expect( theme.surface ).toBe( 'color-mix(in srgb, red, blue)' );
	} );

	it( 'returns defaults for a null element', () => {
		expect( resolveTheme( null ) ).toEqual( {
			...THEME_FALLBACKS,
			isDark: false,
		} );
	} );
} );
