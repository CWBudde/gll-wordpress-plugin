/**
 * Apply resolved theme colors to a Chart.js config.
 *
 * Chart.js defaults to near-black text and faint grey grid lines, which vanish
 * on a dark theme. This walks a config and fills in the chrome colors — text,
 * ticks, grid, legend, tooltip — from the block's resolved tokens.
 *
 * Dataset colors are deliberately left alone. They encode which data series a
 * line belongs to, not chrome, so recoloring them per theme would break the
 * legend's meaning.
 *
 * @package
 */

import { resolveTheme, withAlpha } from './resolve-theme';
import type { GllTheme } from './resolve-theme';

/**
 * Opacity for grid lines, chosen so they read as a faint rule against both a
 * light and a dark surface without competing with the data.
 */
const GRID_ALPHA = 0.25;

/**
 * Fill in chrome colors on a Chart.js config, in place.
 *
 * Values already present in the config win, so a caller that deliberately sets
 * a color keeps it.
 *
 * @param config Chart.js configuration object.
 * @param theme  Resolved theme colors.
 * @return The same config, for chaining.
 */
export function applyChartTheme( config: any, theme: GllTheme ): any {
	if ( ! config ) {
		return config;
	}

	const gridColor = withAlpha( theme.border, GRID_ALPHA );

	const options = ( config.options = config.options || {} );
	options.color = options.color ?? theme.text;
	options.borderColor = options.borderColor ?? gridColor;

	const scales = ( options.scales = options.scales || {} );
	Object.keys( scales ).forEach( ( key ) => {
		const scale = scales[ key ];
		if ( ! scale || typeof scale !== 'object' ) {
			return;
		}

		scale.ticks = scale.ticks || {};
		scale.ticks.color = scale.ticks.color ?? theme.textMuted;

		scale.title = scale.title || {};
		scale.title.color = scale.title.color ?? theme.text;

		// `grid.drawOnChartArea: false` is meaningful and must survive, so
		// only the color is filled in.
		scale.grid = scale.grid || {};
		scale.grid.color = scale.grid.color ?? gridColor;
		scale.grid.borderColor = scale.grid.borderColor ?? gridColor;

		scale.border = scale.border || {};
		scale.border.color = scale.border.color ?? gridColor;

		if ( scale.angleLines ) {
			scale.angleLines.color = scale.angleLines.color ?? gridColor;
		}
		if ( scale.pointLabels ) {
			scale.pointLabels.color =
				scale.pointLabels.color ?? theme.textMuted;
		}
	} );

	const plugins = ( options.plugins = options.plugins || {} );

	plugins.legend = plugins.legend || {};
	plugins.legend.labels = plugins.legend.labels || {};
	plugins.legend.labels.color = plugins.legend.labels.color ?? theme.text;

	plugins.title = plugins.title || {};
	plugins.title.color = plugins.title.color ?? theme.text;

	// The tooltip floats above the chart, so it needs its own opaque surface
	// rather than the block's, which may be transparent.
	plugins.tooltip = plugins.tooltip || {};
	plugins.tooltip.backgroundColor =
		plugins.tooltip.backgroundColor ??
		( theme.isDark ? 'rgba(20, 20, 20, 0.92)' : 'rgba(0, 0, 0, 0.8)' );
	plugins.tooltip.titleColor = plugins.tooltip.titleColor ?? '#fff';
	plugins.tooltip.bodyColor = plugins.tooltip.bodyColor ?? '#fff';
	plugins.tooltip.borderColor = plugins.tooltip.borderColor ?? gridColor;
	plugins.tooltip.borderWidth = plugins.tooltip.borderWidth ?? 1;

	// The polar compass draws its neutral Front/Back labels on the canvas and
	// cannot read CSS. Its blue and red labels are series encoding and stay put
	// — see polar-compass-plugin.ts.
	plugins.polarCompass = plugins.polarCompass || {};
	plugins.polarCompass.textColor =
		plugins.polarCompass.textColor ?? theme.textMuted;

	return config;
}

/**
 * Resolve the theme from an element and apply it to a config in one step.
 *
 * @param config Chart.js configuration object.
 * @param el     Element to resolve tokens from, usually the chart container.
 * @return The same config, for chaining.
 */
export function applyChartThemeFrom(
	config: any,
	el: HTMLElement | null
): any {
	return applyChartTheme( config, resolveTheme( el ) );
}
