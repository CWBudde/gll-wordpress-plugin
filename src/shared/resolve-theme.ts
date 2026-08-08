/**
 * Resolve the block's CSS theme tokens into concrete values for canvas APIs.
 *
 * Chart.js and Three.js both need real color strings, so they cannot read CSS
 * custom properties. This module bridges the gap: the browser has already
 * walked the fallback chain in `tokens.scss` by the time `getComputedStyle`
 * runs, so what comes back is the theme's final value — `#ababab` on a dark
 * theme, `#333` on a light one. No light/dark sniffing required.
 *
 * @package
 */

export interface GllTheme {
	text: string;
	textMuted: string;
	border: string;
	accent: string;
	surface: string;
	isDark: boolean;
}

/**
 * Fallbacks used when a token resolves to nothing, which happens before the
 * stylesheet loads and under jsdom. They match step 3 of the chain in
 * `tokens.scss`.
 */
export const THEME_FALLBACKS: Omit< GllTheme, 'isDark' > = {
	text: '#333',
	textMuted: '#666',
	border: '#e0e0e0',
	accent: '#667eea',
	surface: '#fff',
};

/**
 * Luminance above which a surface counts as light.
 */
const SURFACE_DARK_CUTOFF = 0.5;

/**
 * Luminance above which a *text* color implies a dark page behind it.
 *
 * Deliberately lower than the surface cutoff. Body text on a dark theme is
 * usually mid-grey rather than white — `classy-black-2026` uses `#ababab`, at
 * luminance 0.41 — while body text on a light theme sits far below that
 * (`#333` is 0.03). 0.2 separates the two populations with room on both sides.
 */
const TEXT_DARK_CUTOFF = 0.2;

const NAMED_COLORS: Record< string, [ number, number, number ] > = {
	black: [ 0, 0, 0 ],
	white: [ 255, 255, 255 ],
	silver: [ 192, 192, 192 ],
	gray: [ 128, 128, 128 ],
	grey: [ 128, 128, 128 ],
};

/**
 * Parse a CSS color into RGB channels.
 *
 * Handles the forms `getComputedStyle` and hand-written CSS actually produce:
 * `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgb()`/`rgba()` in both legacy comma syntax
 * and modern space syntax, and a few named colors. Anything else — including
 * `transparent`, `currentColor` and `color-mix()` — returns null, which callers
 * treat as "unknown" rather than an error.
 *
 * @param value CSS color string.
 * @return RGB channels 0-255, or null if not parseable.
 */
export function parseColor( value: string ): [ number, number, number ] | null {
	const input = ( value || '' ).trim().toLowerCase();
	if ( ! input || input === 'transparent' ) {
		return null;
	}

	if ( NAMED_COLORS[ input ] ) {
		return NAMED_COLORS[ input ];
	}

	if ( input.startsWith( '#' ) ) {
		const hex = input.slice( 1 );
		if ( hex.length === 3 || hex.length === 4 ) {
			const [ r, g, b ] = hex.slice( 0, 3 ).split( '' );
			return [
				parseInt( r + r, 16 ),
				parseInt( g + g, 16 ),
				parseInt( b + b, 16 ),
			];
		}
		if ( hex.length === 6 || hex.length === 8 ) {
			return [
				parseInt( hex.slice( 0, 2 ), 16 ),
				parseInt( hex.slice( 2, 4 ), 16 ),
				parseInt( hex.slice( 4, 6 ), 16 ),
			];
		}
		return null;
	}

	if ( input.startsWith( 'rgb' ) ) {
		const open = input.indexOf( '(' );
		const close = input.lastIndexOf( ')' );
		if ( open === -1 || close === -1 ) {
			return null;
		}
		// Both `rgb(1, 2, 3)` and `rgb(1 2 3 / 50%)` split cleanly this way.
		const parts = input
			.slice( open + 1, close )
			.split( /[\s,/]+/ )
			.filter( Boolean );
		if ( parts.length < 3 ) {
			return null;
		}
		const channels = parts.slice( 0, 3 ).map( ( part ) => {
			const numeric = parseFloat( part );
			if ( Number.isNaN( numeric ) ) {
				return NaN;
			}
			return part.endsWith( '%' ) ? ( numeric / 100 ) * 255 : numeric;
		} );
		if ( channels.some( Number.isNaN ) ) {
			return null;
		}
		return channels as [ number, number, number ];
	}

	return null;
}

/**
 * Relative luminance of an sRGB color, per WCAG 2.1.
 *
 * @param rgb RGB channels 0-255.
 * @return Luminance in the range 0-1.
 */
export function relativeLuminance( rgb: [ number, number, number ] ): number {
	const [ r, g, b ] = rgb.map( ( channel ) => {
		const c = Math.min( Math.max( channel, 0 ), 255 ) / 255;
		return c <= 0.03928
			? c / 12.92
			: Math.pow( ( c + 0.055 ) / 1.055, 2.4 );
	} );
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Read one custom property, falling back when it resolves to nothing.
 *
 * @param styles   Computed style of the block wrapper.
 * @param name     Custom property name, without the leading dashes.
 * @param fallback Value to use when the property is unset or empty.
 * @return The resolved value.
 */
function readToken(
	styles: CSSStyleDeclaration,
	name: string,
	fallback: string
): string {
	const value = styles.getPropertyValue( `--gll-${ name }` );
	const trimmed = ( value || '' ).trim();
	return trimmed || fallback;
}

/**
 * Resolve the theme tokens on a block wrapper.
 *
 * `isDark` prefers the resolved surface. When the surface is transparent —
 * which is exactly what the `transparent` appearance sets — the surface tells
 * us nothing, so we invert the text color instead: light text implies a dark
 * page behind the block. If neither parses, we report light, since that is the
 * plugin's default palette.
 *
 * @param el Block wrapper element.
 * @return Concrete colors for canvas rendering.
 */
export function resolveTheme( el: HTMLElement | null ): GllTheme {
	if ( ! el || typeof window === 'undefined' || ! window.getComputedStyle ) {
		return { ...THEME_FALLBACKS, isDark: false };
	}

	const styles = window.getComputedStyle( el );
	const theme: Omit< GllTheme, 'isDark' > = {
		text: readToken( styles, 'text', THEME_FALLBACKS.text ),
		textMuted: readToken( styles, 'text-muted', THEME_FALLBACKS.textMuted ),
		border: readToken( styles, 'border', THEME_FALLBACKS.border ),
		accent: readToken( styles, 'accent', THEME_FALLBACKS.accent ),
		surface: readToken( styles, 'surface', THEME_FALLBACKS.surface ),
	};

	const surfaceRgb = parseColor( theme.surface );
	if ( surfaceRgb ) {
		return {
			...theme,
			isDark: relativeLuminance( surfaceRgb ) < SURFACE_DARK_CUTOFF,
		};
	}

	const textRgb = parseColor( theme.text );
	if ( textRgb ) {
		return {
			...theme,
			isDark: relativeLuminance( textRgb ) >= TEXT_DARK_CUTOFF,
		};
	}

	return { ...theme, isDark: false };
}

/**
 * Mix a theme color with transparency, for grid lines and other faint chrome.
 *
 * Returns an `rgb(... / alpha)` string when the color parses, and the original
 * value untouched when it does not, so a `color-mix()` or `currentColor` token
 * still renders rather than disappearing.
 *
 * @param value CSS color string.
 * @param alpha Opacity 0-1.
 * @return CSS color string.
 */
export function withAlpha( value: string, alpha: number ): string {
	const rgb = parseColor( value );
	if ( ! rgb ) {
		return value;
	}
	const [ r, g, b ] = rgb.map( ( channel ) => Math.round( channel ) );
	return `rgba(${ r }, ${ g }, ${ b }, ${ alpha })`;
}
