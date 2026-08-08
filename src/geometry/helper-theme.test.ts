/**
 * Tests for the geometry scene's helper theming.
 *
 * These construct real three.js helpers, which is safe under jsdom as long as
 * no `WebGLRenderer` is created — nothing here renders, it only inspects the
 * buffers and materials the helpers carry.
 *
 * @package
 */

import * as THREE from 'three';
import {
	applyHelperTheme,
	geometryFallbackColors,
	GEOMETRY_FALLBACK_CSS,
} from './helper-theme';
import { parseColor, resolveTheme } from '../shared/resolve-theme';

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

/**
 * The single material of a grid helper.
 *
 * @param helper Grid helper.
 * @return Its material.
 */
function gridMaterial( helper: THREE.GridHelper ): THREE.Material {
	return Array.isArray( helper.material )
		? helper.material[ 0 ]
		: helper.material;
}

afterEach( () => {
	document.body.innerHTML = '';
} );

describe( 'applyHelperTheme', () => {
	it( 'makes the grid material transparent and marks it for update', () => {
		const scene = new THREE.Scene();
		const grid = new THREE.GridHelper( 10, 10 );
		scene.add( grid );

		const material = gridMaterial( grid );
		// `needsUpdate` is a write-only setter in three.js; the observable
		// effect is the bumped `version`.
		const version = material.version;

		applyHelperTheme( scene, elementWithTokens( { surface: '#ffffff' } ) );

		expect( material.transparent ).toBe( true );
		expect( material.opacity ).toBeCloseTo( 0.45, 5 );
		expect( material.version ).toBeGreaterThan( version );
	} );

	it( 'uses a higher grid opacity on a dark theme', () => {
		const scene = new THREE.Scene();
		const grid = new THREE.GridHelper( 10, 10 );
		scene.add( grid );

		applyHelperTheme( scene, elementWithTokens( { surface: '#111' } ) );

		expect( gridMaterial( grid ).opacity ).toBeCloseTo( 0.5, 5 );
	} );

	it( 'recolors the grid buffer and flags it for upload', () => {
		const scene = new THREE.Scene();
		const grid = new THREE.GridHelper( 10, 10 );
		scene.add( grid );

		const attribute = grid.geometry.getAttribute(
			'color'
		) as THREE.BufferAttribute;
		const version = attribute.version;

		applyHelperTheme(
			scene,
			elementWithTokens( { 'text-muted': '#ff0000' } )
		);

		expect( attribute.version ).toBeGreaterThan( version );
		// Vertex 0 belongs to the first division step, never the center cross.
		expect( attribute.getX( 0 ) ).toBeCloseTo( 1, 5 );
		expect( attribute.getY( 0 ) ).toBeCloseTo( 0, 5 );
		expect( attribute.getZ( 0 ) ).toBeCloseTo( 0, 5 );
	} );

	it( 'returns the resolved theme', () => {
		const el = elementWithTokens( { surface: '#111', text: '#ababab' } );
		const scene = new THREE.Scene();
		scene.add( new THREE.GridHelper( 10, 10 ) );

		expect( applyHelperTheme( scene, el ) ).toEqual( resolveTheme( el ) );
	} );

	it( 'leaves an axes helper untouched', () => {
		const scene = new THREE.Scene();
		const axes = new THREE.AxesHelper( 5 );
		scene.add( axes );

		const before = Array.from(
			axes.geometry.getAttribute( 'color' ).array
		);
		const material = axes.material as THREE.Material;
		const opacityBefore = material.opacity;
		const transparentBefore = material.transparent;

		applyHelperTheme( scene, elementWithTokens( { surface: '#111' } ) );

		expect(
			Array.from( axes.geometry.getAttribute( 'color' ).array )
		).toEqual( before );
		expect( material.opacity ).toBe( opacityBefore );
		expect( material.transparent ).toBe( transparentBefore );
	} );

	it( 'tolerates a scene with no helpers at all', () => {
		const scene = new THREE.Scene();
		expect( () => applyHelperTheme( scene, null ) ).not.toThrow();
	} );
} );

describe( 'geometryFallbackColors', () => {
	it( 'exposes parseable CSS colors for both themes', () => {
		Object.values( GEOMETRY_FALLBACK_CSS ).forEach( ( palette ) => {
			expect( parseColor( palette.face ) ).not.toBeNull();
			expect( parseColor( palette.edge ) ).not.toBeNull();
		} );
	} );

	it( 'returns different colors for light and dark themes', () => {
		const light = geometryFallbackColors( {
			...resolveTheme( null ),
			isDark: false,
		} );
		const dark = geometryFallbackColors( {
			...resolveTheme( null ),
			isDark: true,
		} );

		expect( light.faceColor ).not.toEqual( dark.faceColor );
		expect( light.edgeColor ).not.toEqual( dark.edgeColor );
	} );

	it( 'normalizes the channels into the 0-1 range three.js expects', () => {
		const { faceColor, edgeColor } = geometryFallbackColors( {
			...resolveTheme( null ),
			isDark: false,
		} );

		[ ...faceColor, ...edgeColor ].forEach( ( channel ) => {
			expect( channel ).toBeGreaterThanOrEqual( 0 );
			expect( channel ).toBeLessThanOrEqual( 1 );
		} );

		// #60a5fa
		expect( faceColor[ 0 ] ).toBeCloseTo( 0x60 / 255, 5 );
		expect( faceColor[ 1 ] ).toBeCloseTo( 0xa5 / 255, 5 );
		expect( faceColor[ 2 ] ).toBeCloseTo( 0xfa / 255, 5 );
	} );

	it( 'lightens the dark-theme fallbacks relative to the light ones', () => {
		const light = geometryFallbackColors( {
			...resolveTheme( null ),
			isDark: false,
		} );
		const dark = geometryFallbackColors( {
			...resolveTheme( null ),
			isDark: true,
		} );

		const sum = ( rgb: [ number, number, number ] ) =>
			rgb[ 0 ] + rgb[ 1 ] + rgb[ 2 ];

		expect( sum( dark.faceColor ) ).toBeGreaterThan(
			sum( light.faceColor )
		);
		expect( sum( dark.edgeColor ) ).toBeGreaterThan(
			sum( light.edgeColor )
		);
	} );
} );
