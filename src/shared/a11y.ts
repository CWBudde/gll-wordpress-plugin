/**
 * Runtime accessibility helpers shared by every block's frontend view.
 *
 * Why "runtime" and not "in save()": a block's `save()` output is serialized
 * into post content. Adding an attribute there changes the expected markup, so
 * every post that already contains the block fails validation ("This block
 * contains unexpected or invalid content") unless a matching `deprecated`
 * entry is added for all seven blocks. A demo page carrying the current markup
 * is already published. So every attribute below is applied by view.ts after
 * hydration instead.
 *
 * That is not merely the cheaper option, it is also the more correct one: the
 * things that need announcing — the spinner giving way to content, an error
 * panel replacing a chart — are DOM mutations that only happen at runtime. A
 * live region baked into `save()` would sit there inert until view.ts touched
 * it anyway.
 *
 * @package
 */

/**
 * Whether the visitor has asked for reduced motion.
 *
 * `matchMedia` is guarded rather than assumed: jsdom (which the unit tests run
 * under) does not implement it, and a missing implementation must read as
 * "no preference expressed" rather than throw.
 *
 * The value is read once per block at hydration rather than observed. A visitor
 * who changes the OS setting mid-session gets the new behaviour on reload,
 * which is the same deal every other reduced-motion consumer in this plugin
 * (the CSS media queries notwithstanding) already offers.
 *
 * @return {boolean} True when `prefers-reduced-motion: reduce` matches.
 */
export function prefersReducedMotion(): boolean {
	if ( typeof window === 'undefined' ) {
		return false;
	}
	if ( typeof window.matchMedia !== 'function' ) {
		return false;
	}
	return window.matchMedia( '(prefers-reduced-motion: reduce)' ).matches;
}

/**
 * Prepare a block's live region and hide its decorative chrome.
 *
 * Call this once, at the very start of hydration and before the fetch, so the
 * region is already live when the first mutation lands. A region that is
 * created *and* populated in the same tick is not reliably announced.
 *
 * Six of the seven blocks carry a `.gll-loading-text` paragraph in their
 * header, which `setBlockHeaderLabel` later rewrites from "Loading …" to the
 * parsed system label. Marking that paragraph as the region means the existing
 * mutation does the announcing and those views need no extra call. The geometry
 * block has no such paragraph, so one is created off-screen for it and the
 * returned `announce` is used explicitly.
 *
 * @param {HTMLElement} block Block root element.
 * @return {Function} Announce a message through the block's live region.
 */
export function initBlockLiveRegions(
	block: HTMLElement
): ( message: string ) => void {
	// The spinner is a bare styled <span> with no text: pure decoration, and
	// without this it is an unlabelled element in the accessibility tree.
	block.querySelectorAll( '.gll-spinner' ).forEach( ( spinner ) => {
		spinner.setAttribute( 'aria-hidden', 'true' );
	} );

	// Header glyphs restate the block's heading. `config` and `resources`
	// already hide theirs in save(); the other four never did. Running over
	// every <svg> is safe because this happens before any content is rendered,
	// and the icons the resources renderer adds later set the attribute
	// themselves.
	block.querySelectorAll( 'svg' ).forEach( ( svg ) => {
		if ( ! svg.hasAttribute( 'aria-hidden' ) ) {
			svg.setAttribute( 'aria-hidden', 'true' );
		}
	} );

	let region = block.querySelector< HTMLElement >( '.gll-loading-text' );

	if ( ! region ) {
		region = document.createElement( 'p' );
		region.className = 'gll-visually-hidden gll-live-region';
		block.appendChild( region );
	}

	region.setAttribute( 'role', 'status' );
	region.setAttribute( 'aria-live', 'polite' );
	// The label replaces the whole "Loading …" sentence, so the region is read
	// as a unit rather than as a diff of changed words.
	region.setAttribute( 'aria-atomic', 'true' );

	const target = region;
	return ( message: string ) => {
		target.textContent = message;
	};
}

/**
 * Replace a container's contents with an error panel that announces itself.
 *
 * `role="alert"` (an assertive live region) rather than `role="status"`: the
 * panel appears in place of the visualization the reader came for, and it
 * arrives long after the page settled, so a polite queue could leave it unread
 * behind whatever else is speaking.
 *
 * The panel is built as DOM rather than as an HTML string, which is why no
 * escaping happens here — `textContent` cannot be talked into markup, and the
 * message may quote a `statusText` that came off the wire.
 *
 * @param {Element} container Element whose contents are replaced.
 * @param {string}  message   Human-readable failure description.
 * @return {HTMLElement} The panel, already inserted.
 */
export function renderErrorPanel(
	container: Element,
	message: string
): HTMLElement {
	const panel = document.createElement( 'div' );
	panel.className = 'gll-error';
	panel.setAttribute( 'role', 'alert' );

	const label = document.createElement( 'strong' );
	label.textContent = 'Error:';
	panel.appendChild( label );
	panel.appendChild( document.createTextNode( ` ${ message ?? '' }` ) );

	container.replaceChildren( panel );
	return panel;
}

/**
 * Give a canvas a text alternative.
 *
 * A `<canvas>` is opaque to assistive technology: whatever Chart.js or
 * Three.js paints into it exposes nothing at all. `role="img"` plus a label
 * turns it into a single described object, which is honest — the drawing is
 * one picture, not a widget — and is the only thing standing between a screen
 * reader user and an unannounced blank.
 *
 * The label is expected to carry the figures a sighted reader takes from the
 * plot (ranges, counts, the frequency), not the word "chart".
 *
 * @param {HTMLElement} canvas Canvas element.
 * @param {string}      label  Descriptive label.
 */
export function describeCanvas( canvas: HTMLElement, label: string ): void {
	canvas.setAttribute( 'role', 'img' );
	canvas.setAttribute( 'aria-label', label );
}

export interface KeyboardOrbitHandlers {
	/** Orbit the camera by the given radian deltas. */
	orbit: ( deltaAzimuth: number, deltaPolar: number ) => void;
	/** Dolly the camera; factor < 1 moves closer, > 1 moves further away. */
	zoom: ( factor: number ) => void;
}

/** Radians per arrow-key press. 3° is small enough to aim with. */
const ORBIT_STEP = ( 3 * Math.PI ) / 180;

/** Multiplier per zoom key press. */
const ZOOM_STEP = 1.1;

/**
 * Make a 3D canvas operable from the keyboard.
 *
 * OrbitControls binds pointer and touch events only — its `enableKeys` flag
 * was removed in three r132 and the pinned r0.159 ignores it entirely, so a
 * keyboard user previously had no way to turn the model at all.
 *
 * Rather than fight OrbitControls for its event handling, the caller moves the
 * camera itself and lets `controls.update()` re-derive its spherical state on
 * the next frame; that is exactly what the pointer path does too. This module
 * therefore stays free of any three.js import and is testable under jsdom.
 *
 * @param {HTMLElement} element  Element to make focusable, normally the canvas.
 * @param {Object}      handlers Camera manipulation callbacks.
 * @return {Function} Detach the listener.
 */
export function attachKeyboardOrbit(
	element: HTMLElement,
	handlers: KeyboardOrbitHandlers
): () => void {
	if ( ! element.hasAttribute( 'tabindex' ) ) {
		element.setAttribute( 'tabindex', '0' );
	}

	const onKeyDown = ( event: KeyboardEvent ) => {
		// Modified presses belong to the browser (zoom, history, shortcuts).
		if ( event.ctrlKey || event.metaKey || event.altKey ) {
			return;
		}

		switch ( event.key ) {
			case 'ArrowLeft':
				handlers.orbit( -ORBIT_STEP, 0 );
				break;
			case 'ArrowRight':
				handlers.orbit( ORBIT_STEP, 0 );
				break;
			case 'ArrowUp':
				handlers.orbit( 0, -ORBIT_STEP );
				break;
			case 'ArrowDown':
				handlers.orbit( 0, ORBIT_STEP );
				break;
			case '+':
			case '=':
				handlers.zoom( 1 / ZOOM_STEP );
				break;
			case '-':
			case '_':
				handlers.zoom( ZOOM_STEP );
				break;
			default:
				return;
		}

		// Only reached for a key we handled, so arrow keys still scroll the
		// page whenever the viewer is not focused.
		event.preventDefault();
	};

	element.addEventListener( 'keydown', onKeyDown );
	return () => element.removeEventListener( 'keydown', onKeyDown );
}

/**
 * Preferred one-third-octave band centres, ISO 266.
 *
 * Used to thin a response curve down to something a screen reader can be read
 * out loud without becoming a denial of service — a GLL response is commonly
 * 241 points, and no one listens to 241 rows.
 */
const THIRD_OCTAVE_CENTRES = [
	20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630,
	800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
	12500, 16000, 20000,
];

/**
 * Pick the sample indices closest to the third-octave band centres.
 *
 * Centres outside the measured range are skipped rather than clamped, so a
 * source measured from 200 Hz up does not claim a 20 Hz reading. Duplicates are
 * dropped, which matters for coarse data where two centres land on one sample.
 *
 * @param {Array<number>} frequencies Measured frequencies, ascending.
 * @return {Array<number>} Indices into `frequencies`, ascending.
 */
export function pickThirdOctaveIndices( frequencies: number[] ): number[] {
	if ( ! Array.isArray( frequencies ) || frequencies.length === 0 ) {
		return [];
	}

	const min = frequencies[ 0 ];
	const max = frequencies[ frequencies.length - 1 ];
	const picked: number[] = [];

	THIRD_OCTAVE_CENTRES.forEach( ( centre ) => {
		if ( centre < min || centre > max ) {
			return;
		}

		let bestIndex = 0;
		let bestDistance = Infinity;
		frequencies.forEach( ( frequency, index ) => {
			const distance = Math.abs( frequency - centre );
			if ( distance < bestDistance ) {
				bestDistance = distance;
				bestIndex = index;
			}
		} );

		if ( picked[ picked.length - 1 ] !== bestIndex ) {
			picked.push( bestIndex );
		}
	} );

	return picked;
}

/**
 * Angular width of the main lobe at a given drop below the on-axis level.
 *
 * This lives here rather than in polar-utils because it exists solely to put a
 * number in the polar canvas's `aria-label`: the beamwidth is what a sighted
 * reader takes from the plot's shape at a glance, and it is the one figure the
 * block does not already print in its badge row.
 *
 * The walk goes outward from 0° in each direction and stops at the first sample
 * that falls below the threshold, linearly interpolating between the last two
 * samples. Stopping at the *first* crossing is deliberate: a rear lobe that
 * climbs back above the threshold is not part of the main lobe.
 *
 * @param {Array<number>} angles Angles in degrees, in `buildPolarAngles` order.
 * @param {Array<number>} levels Levels in dB, aligned with `angles`.
 * @param {number}        dropDb Drop below the on-axis level, e.g. 6.
 * @return {number|null} Total beamwidth in degrees, or null when undeterminable.
 */
export function beamwidthAtDrop(
	angles: number[],
	levels: Array< number | null >,
	dropDb: number
): number | null {
	if ( ! Array.isArray( angles ) || angles.length !== levels?.length ) {
		return null;
	}

	// Sort into a monotonic -180 … +180 sweep. The chart order starts at 0 and
	// walks the negative half first, which is convenient for Chart.js and
	// useless for a geometric walk.
	const sorted = angles
		.map( ( angle, index ) => ( { angle, level: levels[ index ] } ) )
		.filter( ( entry ) => Number.isFinite( entry.level as number ) )
		.sort( ( a, b ) => a.angle - b.angle ) as Array< {
		angle: number;
		level: number;
	} >;

	const onAxis = sorted.find( ( entry ) => entry.angle === 0 );
	if ( ! onAxis ) {
		return null;
	}

	const threshold = onAxis.level - dropDb;
	const zeroIndex = sorted.indexOf( onAxis );

	/**
	 * Walk away from on-axis until the level crosses the threshold.
	 *
	 * @param {number} step +1 towards positive angles, -1 towards negative.
	 * @return {number|null} Half-angle in degrees, or null when never crossed.
	 */
	const halfAngle = ( step: number ): number | null => {
		for (
			let index = zeroIndex + step;
			index >= 0 && index < sorted.length;
			index += step
		) {
			const current = sorted[ index ];
			if ( current.level > threshold ) {
				continue;
			}

			const previous = sorted[ index - step ];
			const span = previous.level - current.level;
			// A flat pair cannot be interpolated; take the sample itself.
			const fraction =
				span > 0 ? ( previous.level - threshold ) / span : 0;
			return Math.abs(
				previous.angle + ( current.angle - previous.angle ) * fraction
			);
		}
		return null;
	};

	const negative = halfAngle( -1 );
	const positive = halfAngle( 1 );

	if ( negative === null || positive === null ) {
		return null;
	}

	return Math.round( negative + positive );
}
