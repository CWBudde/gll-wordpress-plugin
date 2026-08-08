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
 * The reference / center-of-mass / pivot marker colors and the error state are
 * fixed for the same reason: they identify a thing, they do not decorate it.
 *
 * The one place a data color is negotiable is the *absence* of one. A GLL file
 * may leave a face or edge without a color, and the fallback the renderer
 * substitutes is chrome by any other name — a flat mid-slate reads fine on a
 * white page and muddy on a black one. `geometryFallbackColors()` supplies
 * theme-appropriate defaults for that case; colors the file does carry still
 * pass through untouched.
 *
 * Both the editor (which renders through the shared `GeometryViewer`) and the
 * frontend view script build the same two helpers, so they share this module
 * rather than each reaching into the scene their own way.
 *
 * @package
 */

import * as THREE from 'three';
// Imported from the module rather than the `../shared` barrel: the barrel also
// pulls in `three-wrapper`, whose `three/addons` import is untransformed ESM
// and cannot be loaded by Jest.
import { parseColor, resolveTheme } from '../shared/resolve-theme';
import type { GllTheme } from '../shared/resolve-theme';

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
 * Grid line opacity per theme.
 *
 * A dark page swallows thin lines, so the grid gets slightly more presence
 * there; neither value is high enough for the grid to compete with the case.
 */
const GRID_OPACITY = {
	light: 0.45,
	dark: 0.5,
};

/**
 * Fade a grid helper's material(s) to the theme's grid opacity.
 *
 * `Object3D.material` is typed as one material or an array, and a `GridHelper`
 * only ever has one — but normalizing costs a line and survives three.js
 * changing its mind.
 *
 * @param helper Grid helper.
 * @param theme  Resolved theme.
 */
function fadeGrid( helper: THREE.GridHelper, theme: GllTheme ) {
	const opacity = theme.isDark ? GRID_OPACITY.dark : GRID_OPACITY.light;
	const materials = Array.isArray( helper.material )
		? helper.material
		: [ helper.material ];

	materials.forEach( ( material ) => {
		if ( ! material ) {
			return;
		}
		material.transparent = true;
		material.opacity = opacity;
		material.needsUpdate = true;
	} );
}

/**
 * Recolor a grid helper: the center cross in the border color, the remaining
 * lines in the muted text color so they read as secondary.
 *
 * `GridHelper` lays out four vertices per division step, so the divisions are
 * recovered from the buffer rather than assumed — the shared viewer is free to
 * change them.
 *
 * The opacity is applied even when the colors cannot be resolved: a grid in the
 * helper's built-in colors still wants to sit behind the case, not on top of
 * it.
 *
 * @param helper Grid helper.
 * @param theme  Resolved theme.
 */
function paintGrid( helper: THREE.GridHelper, theme: GllTheme ) {
	fadeGrid( helper, theme );

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
 * Fallback colors for case faces and edges the GLL file leaves uncolored.
 *
 * Shaped to drop straight into `buildCaseGeometryData`'s options, whose
 * `faceColor` / `edgeColor` are normalized 0-1 RGB triplets.
 */
export interface GeometryFallbackColors {
	faceColor: [ number, number, number ];
	edgeColor: [ number, number, number ];
}

/**
 * The fallbacks as CSS colors, per theme.
 *
 * Slate for edges and a mid blue for faces, each lightened on a dark theme so
 * the case keeps the same figure-to-ground relationship it has on a light one.
 */
export const GEOMETRY_FALLBACK_CSS = {
	light: { face: '#60a5fa', edge: '#475569' },
	dark: { face: '#93c5fd', edge: '#cbd5e1' },
};

/**
 * Convert a CSS color to a normalized RGB triplet.
 *
 * The constants above are hex literals we control, so the parse cannot fail;
 * the guard exists only to keep the return type honest.
 *
 * @param value CSS color string.
 * @return RGB channels 0-1.
 */
function toTriplet( value: string ): [ number, number, number ] {
	const rgb = parseColor( value );
	if ( ! rgb ) {
		return [ 0, 0, 0 ];
	}
	return [ rgb[ 0 ] / 255, rgb[ 1 ] / 255, rgb[ 2 ] / 255 ];
}

/**
 * Resolve the uncolored-geometry fallbacks for a theme.
 *
 * Spread the result into `buildCaseGeometryData`'s options:
 *
 *     buildCaseGeometryData( geometry, {
 *         ...geometryFallbackColors( theme ),
 *         transform,
 *     } );
 *
 * @param theme Resolved theme.
 * @return Face and edge fallback colors.
 */
export function geometryFallbackColors(
	theme: GllTheme
): GeometryFallbackColors {
	const palette = theme.isDark
		? GEOMETRY_FALLBACK_CSS.dark
		: GEOMETRY_FALLBACK_CSS.light;

	return {
		faceColor: toTriplet( palette.face ),
		edgeColor: toTriplet( palette.edge ),
	};
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
