/**
 * Theme the Three.js helper chrome of the geometry scene.
 *
 * Only the grid follows the theme. The case mesh, its edges and the reference /
 * center-of-mass / pivot markers all encode data from the GLL file, so they
 * keep the colors the parser assigned them.
 *
 * The axes helper is left alone too. Its red/green/blue is the universal X/Y/Z
 * convention — orientation information a viewer reads directly, not decoration
 * — so tinting it uniformly would cost more than it gains on a dark theme.
 *
 * Both the editor (which renders through the shared `GeometryViewer`) and the
 * frontend view script build the same two helpers, so they share this module
 * rather than each reaching into the scene their own way.
 *
 * @package
 */

import * as THREE from 'three';
import { parseColor, resolveTheme } from '../shared';
import type { GllTheme } from '../shared';

/**
 * Convert a resolved theme color into a THREE.Color.
 *
 * `getComputedStyle` hands back `rgb(51, 51, 51)` or a hex string, both of
 * which `setStyle` understands — but a theme is free to resolve a token to
 * `color-mix()` or another form it does not. Normalizing through `parseColor`
 * first keeps an exotic token from producing a three.js console warning and a
 * black helper.
 *
 * @param value CSS color string.
 * @return A THREE.Color, or null when the value is not parseable.
 */
function toThreeColor( value: string ): THREE.Color | null {
	const rgb = parseColor( value );
	if ( ! rgb ) {
		return null;
	}
	const [ r, g, b ] = rgb.map( ( channel ) => Math.round( channel ) );
	return new THREE.Color().setStyle( `rgb(${ r }, ${ g }, ${ b })` );
}

/**
 * Recolor a grid helper: the center cross in the border color, the remaining
 * lines in the muted text color so they read as secondary.
 *
 * `GridHelper` lays out four vertices per division step, so the divisions are
 * recovered from the buffer rather than assumed — the shared viewer is free to
 * change them.
 *
 * @param helper Grid helper.
 * @param theme  Resolved theme.
 */
function paintGrid( helper: THREE.GridHelper, theme: GllTheme ) {
	const attribute = helper.geometry.getAttribute( 'color' );
	if ( ! attribute ) {
		return;
	}

	const centerColor = toThreeColor( theme.border );
	const lineColor = toThreeColor( theme.textMuted );
	if ( ! centerColor || ! lineColor ) {
		return;
	}

	const centerStep = ( attribute.count / 4 - 1 ) / 2;
	for ( let i = 0; i < attribute.count; i++ ) {
		const color =
			Math.floor( i / 4 ) === centerStep ? centerColor : lineColor;
		attribute.setXYZ( i, color.r, color.g, color.b );
	}
	attribute.needsUpdate = true;
}

/**
 * Apply the block's resolved theme to the grid helper in a scene.
 *
 * Cheap enough to call from a resize handler: it walks the scene's direct
 * children and rewrites one small buffer, allocating nothing per frame.
 *
 * @param scene   Scene holding the helpers.
 * @param element Any element inside the block wrapper, used to resolve tokens.
 * @return The theme that was applied.
 */
export function applyHelperTheme(
	scene: THREE.Object3D,
	element: HTMLElement | null
): GllTheme {
	const theme = resolveTheme( element );

	scene.children.forEach( ( child ) => {
		if ( child instanceof THREE.GridHelper ) {
			paintGrid( child, theme );
		}
	} );

	return theme;
}
