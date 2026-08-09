/**
 * Polar-plot rendering helpers, split out of view.ts so they can run under
 * jsdom.
 *
 * `view.ts` imports the WASM loader at module scope and registers a
 * DOMContentLoaded handler on import, which puts everything beside it out of
 * reach of a unit test. Same split as `resource-render.ts`, `config-render.ts`
 * and `response-render.ts`.
 *
 * Only the string builders and the dataset descriptions moved. The Chart
 * construction stays in view.ts, since it needs a canvas context jsdom does not
 * provide.
 *
 * @package
 */

import { __, _x, sprintf } from '@wordpress/i18n';

import { escapeHtml } from '../shared/escape-html';
import { buildPolarAngles } from '../shared/polar-utils';
import { beamwidthAtDrop } from '../shared/a11y';

export interface PolarPlotOptions {
	fileName: string;
	sourceIndex: number;
	frequencyIndex: number;
	showHorizontal: boolean;
	showVertical: boolean;
	normalized: boolean;
	chartHeight: number;
}

/**
 * Read a block's options out of its `data-` attributes.
 *
 * The defaults here are what a post serialized before an attribute existed
 * renders with, because `save()` output is frozen in post content and carries
 * no dataset entry for an attribute added later. Hence `!== 'false'` for
 * on-by-default toggles and `=== 'true'` for off-by-default ones.
 *
 * @param {DOMStringMap} dataset The block element's dataset.
 * @return {PolarPlotOptions} Resolved options.
 */
export function readBlockOptions( dataset: DOMStringMap ): PolarPlotOptions {
	return {
		fileName: dataset.fileName || __( 'GLL File', 'gll-info' ),
		sourceIndex: parseInt( dataset.sourceIndex ?? '', 10 ) || 0,
		frequencyIndex: parseInt( dataset.frequencyIndex ?? '', 10 ) || 0,
		showHorizontal: dataset.showHorizontal !== 'false',
		showVertical: dataset.showVertical !== 'false',
		normalized: dataset.normalized === 'true',
		chartHeight: parseInt( dataset.chartHeight ?? '', 10 ) || 400,
	};
}

/**
 * Build the Chart.js datasets for the visible planes.
 *
 * Horizontal is blue and vertical is red throughout the plugin, including the
 * compass labels the radar plugin draws, so these colours are series encoding
 * rather than chrome and stay fixed across themes.
 *
 * @param {Object} params                  Parameters object.
 * @param {Array}  params.horizontalLevels Horizontal levels, post-normalization.
 * @param {Array}  params.verticalLevels   Vertical levels, post-normalization.
 * @param {string} params.freqLabel        Formatted frequency.
 * @param {Object} params.options          Chart options.
 * @return {Array} Chart.js dataset descriptors.
 */
export function buildPolarDatasets( {
	horizontalLevels,
	verticalLevels,
	freqLabel,
	options,
}: {
	horizontalLevels: Array< number | null >;
	verticalLevels: Array< number | null >;
	freqLabel: string;
	options: PolarPlotOptions;
} ): any[] {
	const datasets = [];

	// The normalized variant is a whole sentence rather than a translated
	// suffix glued on, so translators can place the qualifier where their
	// language needs it. Mirrors the editor preview in edit.tsx.
	if ( options.showHorizontal ) {
		datasets.push( {
			label: options.normalized
				? sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Horizontal @ %s (normalized)', 'gll-info' ),
						freqLabel
				  )
				: sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Horizontal @ %s', 'gll-info' ),
						freqLabel
				  ),
			data: horizontalLevels,
			borderColor: '#2563eb',
			backgroundColor: 'rgba(37, 99, 235, 0.12)',
			pointRadius: 0,
			borderWidth: 2,
			fill: true,
			tension: 0.2,
		} );
	}

	if ( options.showVertical ) {
		datasets.push( {
			label: options.normalized
				? sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Vertical @ %s (normalized)', 'gll-info' ),
						freqLabel
				  )
				: sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Vertical @ %s', 'gll-info' ),
						freqLabel
				  ),
			data: verticalLevels,
			borderColor: '#dc2626',
			backgroundColor: 'rgba(220, 38, 38, 0.12)',
			pointRadius: 0,
			borderWidth: 2,
			fill: true,
			tension: 0.2,
		} );
	}

	return datasets;
}

/**
 * Build the badge row shown above the plot.
 *
 * @param {Object} params           Parameters object.
 * @param {Object} params.slices    Computed polar slices.
 * @param {Object} params.source    Source definition.
 * @param {string} params.freqLabel Formatted frequency.
 * @param {Object} params.options   Chart options.
 * @return {string} HTML string for the metadata row.
 */
export function buildMetadataHtml( {
	slices,
	source,
	freqLabel,
	options,
}: {
	slices: any;
	source: any;
	freqLabel: string;
	options: PolarPlotOptions;
} ): string {
	const badges = [];
	badges.push(
		`<span class="gll-meta-badge"><strong>${ escapeHtml(
			__( 'Frequency:', 'gll-info' )
		) }</strong> ${ freqLabel }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ escapeHtml(
			__( 'Symmetry:', 'gll-info' )
		) }</strong> ${ escapeHtml( slices.meta.symmetryName ) }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ escapeHtml(
			__( 'Resolution:', 'gll-info' )
		) }</strong> ${ slices.meta.meridianStep }° × ${
			slices.meta.parallelStep
		}°</span>`
	);
	if ( options.normalized ) {
		badges.push(
			`<span class="gll-meta-badge gll-meta-badge-highlight"><strong>${ escapeHtml(
				__( 'Normalized', 'gll-info' )
			) }</strong></span>`
		);
	}
	if ( slices.meta.usesOnAxis ) {
		badges.push(
			`<span class="gll-meta-badge">${ escapeHtml(
				__( 'Uses on-axis', 'gll-info' )
			) }</span>`
		);
	}
	if ( slices.meta.frontHalfOnly ) {
		badges.push(
			`<span class="gll-meta-badge">${ escapeHtml(
				__( 'Front-half only', 'gll-info' )
			) }</span>`
		);
	}
	const sourceLabel = source.Definition?.Label || source.Label || '';
	if ( sourceLabel ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>${ escapeHtml(
				__( 'Source:', 'gll-info' )
			) }</strong> ${ escapeHtml( sourceLabel ) }</span>`
		);
	}

	return `<div class="gll-polar-plot-metadata">${ badges.join( '' ) }</div>`;
}

/**
 * Summarize the polar pattern for the canvas's text alternative.
 *
 * The badge row above the plot already prints the frequency, the symmetry and
 * the angular resolution, so those are not repeated at length here. What it
 * cannot print — and what a sighted reader takes from the plot's shape in a
 * glance — is how wide the pattern is, so the label leads with the −6 dB
 * beamwidth of each plane.
 *
 * No off-screen table accompanies this one, unlike the frequency response
 * block. The plotted grid is 36 angles per plane and the individual levels are
 * not what anyone reads a polar plot for; the coverage angle is, and it is
 * stated here directly. A 72-row table would bury that one useful number.
 *
 * @param {Object} params                  Parameters object.
 * @param {Object} params.slices           Computed polar slices.
 * @param {Array}  params.horizontalLevels Horizontal levels, post-normalization.
 * @param {Array}  params.verticalLevels   Vertical levels, post-normalization.
 * @param {string} params.freqLabel        Formatted frequency.
 * @param {Object} params.options          Chart options.
 * @return {string} Label text.
 */
export function buildCanvasLabel( {
	slices,
	horizontalLevels,
	verticalLevels,
	freqLabel,
	options,
}: {
	slices: any;
	horizontalLevels: Array< number | null >;
	verticalLevels: Array< number | null >;
	freqLabel: string;
	options: PolarPlotOptions;
} ): string {
	const angles = buildPolarAngles( slices.meta.stepDeg );
	const parts = [
		sprintf(
			/* translators: %s: frequency label, for example "1 kHz". */
			__( 'Polar directivity plot at %s', 'gll-info' ),
			freqLabel
		),
	];

	/**
	 * Describe one plane's coverage.
	 *
	 * @param {string} name   Plane name, already translated.
	 * @param {Array}  levels Levels for that plane.
	 * @return {string} Sentence fragment.
	 */
	const describePlane = ( name: string, levels: Array< number | null > ) => {
		const width = beamwidthAtDrop( angles, levels, 6 );
		return width === null
			? sprintf(
					/* translators: %s: measurement plane, "horizontal" or "vertical". */
					__(
						'%s coverage not determinable from the measured data',
						'gll-info'
					),
					name
			  )
			: sprintf(
					/* translators: 1: measurement plane, "horizontal" or "vertical". 2: beamwidth in degrees. */
					__( '%1$s −6 dB beamwidth %2$s°', 'gll-info' ),
					name,
					String( width )
			  );
	};

	if ( options.showHorizontal ) {
		parts.push(
			describePlane(
				_x( 'horizontal', 'measurement plane', 'gll-info' ),
				horizontalLevels
			)
		);
	}
	if ( options.showVertical ) {
		parts.push(
			describePlane(
				_x( 'vertical', 'measurement plane', 'gll-info' ),
				verticalLevels
			)
		);
	}

	parts.push(
		sprintf(
			/* translators: %s: symmetry name, already translated, e.g. "Axial". */
			__( '%s symmetry', 'gll-info' ),
			slices.meta.symmetryName
		)
	);

	if ( options.normalized ) {
		parts.push(
			__( 'levels normalized to the on-axis maximum', 'gll-info' )
		);
	}

	return `${ parts.join( ', ' ) }.`;
}
