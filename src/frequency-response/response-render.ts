/**
 * Frequency-response rendering helpers, split out of view.ts so they can run
 * under jsdom.
 *
 * `view.ts` imports the WASM loader at module scope and registers a
 * DOMContentLoaded handler on import, which makes anything living beside it
 * unreachable from a unit test. The same split already exists for the resources
 * and configuration blocks — see `resource-render.ts` and `config-render.ts`,
 * both of which say the same thing.
 *
 * Only the string and DOM builders moved. Everything that constructs a Chart
 * stays in view.ts, because a chart needs a canvas context that jsdom does not
 * provide and testing it would mean asserting against a mock.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

import { escapeHtml } from '../shared/escape-html';
import {
	buildSourceResponseSeries,
	formatFrequency,
} from '../shared/charting-utils';
import { pickThirdOctaveIndices } from '../shared/a11y';

export interface FrequencyResponseOptions {
	fileName: string;
	sourceIndex: number;
	responseIndex: number;
	phaseMode: string;
	normalized: boolean;
	showPhase: boolean;
	showMagnitude: boolean;
	chartHeight: number;
}

/**
 * Read a block's options out of its `data-` attributes.
 *
 * This is where the "an attribute added in a later version must still default
 * correctly on a post that predates it" contract lives. `save()` output is
 * frozen in post content, so a block serialized before an attribute existed
 * carries no dataset entry for it at all, and every default below is what such
 * a post renders with. Booleans therefore test `!== 'false'` when the default is
 * on and `=== 'true'` when it is off.
 *
 * @param {DOMStringMap} dataset The block element's dataset.
 * @return {FrequencyResponseOptions} Resolved options.
 */
export function readBlockOptions(
	dataset: DOMStringMap
): FrequencyResponseOptions {
	return {
		fileName: dataset.fileName || __( 'GLL File', 'gll-info' ),
		sourceIndex: parseInt( dataset.sourceIndex ?? '', 10 ) || 0,
		responseIndex: parseInt( dataset.responseIndex ?? '', 10 ) || 0,
		phaseMode: dataset.phaseMode || 'unwrapped',
		normalized: dataset.normalized === 'true',
		showPhase: dataset.showPhase !== 'false',
		showMagnitude: dataset.showMagnitude !== 'false',
		chartHeight: parseInt( dataset.chartHeight ?? '', 10 ) || 400,
	};
}

/**
 * Extract frequency response data from GLL source.
 *
 * Delegates to the shared series builder, which combines the directivity
 * response with the source's on-axis spectrum and applies the delay-corrected
 * phase representation.
 *
 * @param {Object}  source        Source definition from GLL.
 * @param {number}  responseIndex Response index to use.
 * @param {string}  phaseMode     'unwrapped' | 'wrapped' | 'group-delay'.
 * @param {boolean} normalized    If true, plot directivity only (no on-axis).
 * @return {Object|null} Object with frequencies, magnitudes, phases arrays.
 */
export function extractResponseData(
	source: any,
	responseIndex: number,
	phaseMode: string,
	normalized: boolean
) {
	const series = buildSourceResponseSeries(
		source,
		responseIndex,
		phaseMode,
		normalized
	);

	if ( ! series ) {
		return null;
	}

	return {
		frequencies: series.frequencies,
		magnitudes: series.level,
		phases: series.phase || [],
		phaseLabel: series.phaseLabel,
		phaseAxisTitle: series.phaseAxisTitle,
	};
}

/**
 * Build metadata HTML for display above chart.
 *
 * @param {Object} params               Parameters object.
 * @param {Object} params.source        Source definition.
 * @param {Object} params.frequencyData Frequency data with min/max.
 * @param {Object} params.options       Chart options.
 * @param {Object} params.phaseSeries   Phase series data.
 * @return {string} HTML string for metadata display.
 */
export function buildMetadataHtml( {
	source,
	frequencyData,
	options,
	phaseSeries,
}: {
	source: any;
	frequencyData: any;
	options: FrequencyResponseOptions;
	phaseSeries: any;
} ): string {
	const minFreq = formatFrequency( frequencyData.minFrequency );
	const maxFreq = formatFrequency( frequencyData.maxFrequency );

	const badges = [];

	// Frequency range badge
	badges.push(
		`<span class="gll-meta-badge"><strong>${ escapeHtml(
			__( 'Range:', 'gll-info' )
		) }</strong> ${ minFreq } - ${ maxFreq }</span>`
	);

	// Phase mode badge. The keys are the stored attribute values and stay in
	// English; only the labels they map to are shown to a reader.
	if ( phaseSeries ) {
		const phaseModeLabels: Record< string, string > = {
			'group-delay': __( 'Group Delay', 'gll-info' ),
			wrapped: __( 'Wrapped Phase', 'gll-info' ),
			unwrapped: __( 'Unwrapped Phase', 'gll-info' ),
		};
		const phaseLabel =
			phaseModeLabels[ options.phaseMode ] || phaseModeLabels.unwrapped;
		badges.push(
			`<span class="gll-meta-badge"><strong>${ escapeHtml(
				__( 'Phase:', 'gll-info' )
			) }</strong> ${ escapeHtml( phaseLabel ) }</span>`
		);
	}

	// Normalization badge
	if ( options.normalized ) {
		badges.push(
			`<span class="gll-meta-badge gll-meta-badge-highlight"><strong>${ escapeHtml(
				__( 'Normalized', 'gll-info' )
			) }</strong></span>`
		);
	}

	// Source info badge
	if ( source.Label ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>${ escapeHtml(
				__( 'Source:', 'gll-info' )
			) }</strong> ${ escapeHtml( source.Label ) }</span>`
		);
	}

	return `<div class="gll-frequency-response-metadata">${ badges.join(
		''
	) }</div>`;
}

/**
 * Summarize the plotted curve for the canvas's text alternative.
 *
 * A `<canvas>` exposes nothing at all, so this is the whole of what a screen
 * reader gets from the picture. It therefore states the figures a sighted
 * reader takes off the axes — the frequency span and the level span — rather
 * than the word "chart". The values are the ones already computed for the
 * visible badge row, so the two can never disagree.
 *
 * @param {Object} params               Parameters object.
 * @param {Object} params.source        Source definition.
 * @param {Object} params.frequencyData Frequency data with min/max.
 * @param {Array}  params.magnitudes    Plotted level values in dB.
 * @param {Object} params.options       Chart options.
 * @param {Object} params.phaseSeries   Phase series data, or null.
 * @return {string} Label text.
 */
export function buildCanvasLabel( {
	source,
	frequencyData,
	magnitudes,
	options,
	phaseSeries,
}: {
	source: any;
	frequencyData: any;
	magnitudes: number[];
	options: FrequencyResponseOptions;
	phaseSeries: any;
} ): string {
	const finite = magnitudes.filter( ( value ) => Number.isFinite( value ) );
	const parts = [];

	const subject = source.Label || options.fileName;

	// The normalized variant is a whole clause rather than a suffix glued on,
	// so translators can place the qualifier where their language needs it.
	parts.push(
		options.normalized
			? sprintf(
					/* translators: %s: source label, or the file name when the source is unnamed. */
					__( 'Frequency response of %s, normalized', 'gll-info' ),
					subject
			  )
			: sprintf(
					/* translators: %s: source label, or the file name when the source is unnamed. */
					__( 'Frequency response of %s', 'gll-info' ),
					subject
			  )
	);
	parts.push(
		sprintf(
			/* translators: 1: lowest plotted frequency, 2: highest plotted frequency. */
			__( '%1$s to %2$s', 'gll-info' ),
			formatFrequency( frequencyData.minFrequency ),
			formatFrequency( frequencyData.maxFrequency )
		)
	);

	if ( options.showMagnitude && finite.length > 0 ) {
		parts.push(
			sprintf(
				/* translators: 1: lowest plotted level in dB, 2: highest plotted level in dB. */
				__( 'level %1$s to %2$s dB', 'gll-info' ),
				Math.min( ...finite ).toFixed( 1 ),
				Math.max( ...finite ).toFixed( 1 )
			)
		);
	}

	if ( phaseSeries ) {
		parts.push(
			sprintf(
				/* translators: %s: phase series label, already translated, e.g. "Phase (rad)". */
				__( '%s on the right axis', 'gll-info' ),
				phaseSeries.label
			)
		);
	}

	return sprintf(
		/* translators: %s: comma-separated summary of the plotted chart. */
		__( '%s. The plotted values follow in a table.', 'gll-info' ),
		parts.join( ', ' )
	);
}

/**
 * Build an off-screen table of the plotted magnitude values.
 *
 * The `aria-label` gives the shape of the curve; this gives the numbers, which
 * for a response plot *are* the content — a reader deciding whether a cabinet
 * suits a room needs the value at 2 kHz, not "it slopes down".
 *
 * Only the magnitude is tabulated and only at third-octave centres. A GLL
 * response commonly carries 241 points, and reading 241 rows aloud is not
 * access, it is obstruction; the phase curve is left out for the same reason,
 * since a second column doubles the reading time to describe a quantity that
 * is rarely the reason anyone opened the block.
 *
 * @param {Array<number>} frequencies Measured frequencies.
 * @param {Array<number>} magnitudes  Level values in dB.
 * @return {HTMLElement|null} Table element, or null when there is nothing to show.
 */
export function buildDataTable(
	frequencies: number[],
	magnitudes: number[]
): HTMLElement | null {
	const indices = pickThirdOctaveIndices( frequencies );
	if ( indices.length === 0 ) {
		return null;
	}

	const table = document.createElement( 'table' );
	table.className = 'gll-visually-hidden';

	const caption = document.createElement( 'caption' );
	caption.textContent = __(
		'Frequency response level at one-third-octave band centres',
		'gll-info'
	);
	table.appendChild( caption );

	const head = document.createElement( 'thead' );
	const headRow = document.createElement( 'tr' );
	// Same two strings the chart axes use, so a translation reads consistently
	// between the picture and its table.
	[ __( 'Frequency', 'gll-info' ), __( 'Level (dB)', 'gll-info' ) ].forEach(
		( text ) => {
			const cell = document.createElement( 'th' );
			cell.scope = 'col';
			cell.textContent = text;
			headRow.appendChild( cell );
		}
	);
	head.appendChild( headRow );
	table.appendChild( head );

	const body = document.createElement( 'tbody' );
	indices.forEach( ( index ) => {
		const value = magnitudes[ index ];
		if ( ! Number.isFinite( value ) ) {
			return;
		}

		const row = document.createElement( 'tr' );
		const frequencyCell = document.createElement( 'th' );
		frequencyCell.scope = 'row';
		frequencyCell.textContent = formatFrequency( frequencies[ index ] );
		row.appendChild( frequencyCell );

		const levelCell = document.createElement( 'td' );
		levelCell.textContent = value.toFixed( 1 );
		row.appendChild( levelCell );

		body.appendChild( row );
	} );

	if ( body.children.length === 0 ) {
		return null;
	}

	table.appendChild( body );
	return table;
}
