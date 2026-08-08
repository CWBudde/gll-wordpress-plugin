/**
 * 3D Balloon Block - Three.js chrome theming.
 *
 * The balloon surface itself is data: its vertex colors encode dB level and
 * must never be tinted. The wireframe reference sphere around it is chrome, and
 * has to stay visible on a dark theme where the old hardcoded grey disappears.
 *
 * The axes helper is deliberately left alone. Its red/green/blue is the
 * universal X/Y/Z convention — orientation information a viewer reads directly,
 * not decoration — so tinting it uniformly would cost more than it gains.
 *
 * The editor gets its scene from the shared `ThreeWrapper`, which builds those
 * helpers itself, so we recolor by walking the scene rather than by threading
 * colors through the wrapper's config.
 *
 * @package
 */

import * as THREE from 'three';
import { resolveTheme } from '../shared';
import type { GllTheme } from '../shared';

/**
 * Recolor one helper material in place.
 *
 * @param material Material to recolor.
 * @param color    CSS color string.
 */
function recolor(
	material: THREE.Material | THREE.Material[],
	color: string
): void {
	const materials = Array.isArray( material ) ? material : [ material ];
	for ( const mat of materials ) {
		const colored = mat as THREE.Material & { color?: THREE.Color };
		if ( colored.color ) {
			colored.color.set( color );
		}
	}
}

/**
 * Apply the block's resolved theme to the scene's chrome objects.
 *
 * Only the wireframe reference sphere is touched. The balloon mesh uses
 * `MeshStandardMaterial` with `vertexColors`, the axes helper keeps its X/Y/Z
 * coding, and lights are left white so the colormap reads true.
 *
 * The sphere takes the muted text color rather than the border color: it is
 * drawn at low opacity, and `--gll-border` defaults to a very light grey that
 * would be all but invisible on a light theme.
 *
 * @param scene Scene to walk.
 * @param theme Resolved theme colors.
 */
export function applySceneTheme(
	scene: THREE.Scene | null,
	theme: GllTheme
): void {
	if ( ! scene ) {
		return;
	}

	scene.traverse( ( object ) => {
		if ( object instanceof THREE.AxesHelper ) {
			return;
		}

		// The reference sphere is the only `MeshBasicMaterial` wireframe in
		// these scenes; the balloon is a `MeshStandardMaterial`.
		if ( object instanceof THREE.Mesh ) {
			const material = object.material;
			const first = Array.isArray( material ) ? material[ 0 ] : material;
			if ( first instanceof THREE.MeshBasicMaterial && first.wireframe ) {
				recolor( material, theme.textMuted );
			}
		}
	} );
}

/**
 * Resolve the theme from an element inside the block and apply it.
 *
 * Custom properties inherit, so any descendant of the `.gll-block` wrapper
 * resolves the same values.
 *
 * @param scene Scene to theme.
 * @param el    Element inside the block, used to read the tokens.
 * @return The theme that was applied.
 */
export function applySceneThemeFrom(
	scene: THREE.Scene | null,
	el: HTMLElement | null
): GllTheme {
	const theme = resolveTheme( el );
	applySceneTheme( scene, theme );
	return theme;
}
