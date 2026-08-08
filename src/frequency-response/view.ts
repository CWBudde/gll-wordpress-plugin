/**
 * Frequency Response Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js rendering on the frontend.
 *
 * @package
 */

import Chart from 'chart.js/auto';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { escapeHtml } from '../shared/escape-html';
import {
	buildFrequencyPoints,
	buildLogFrequencyScale,
	buildSourceResponseSeries,
	formatFrequency,
} from '../shared/charting-utils';
import { applyChartThemeFrom } from '../shared/chart-theme';
import {
	describeCanvas,
	initBlockLiveRegions,
	pickThirdOctaveIndices,
	prefersReducedMotion,
	renderErrorPanel,
} from '../shared/a11y';

/**
 * Initialize all frequency response blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-frequency-response-block' );

	if ( blocks.length === 0 ) {
		return;
	}

	// Ensure WASM is ready
	try {
		await ensureWasmReady();
	} catch ( error ) {
		console.error( 'Failed to initialize WASM:', error );
		blocks.forEach( ( block ) => {
			showError( block, 'Failed to initialize WASM parser' );
		} );
		return;
	}

	// Process each block
	blocks.forEach( ( block ) => {
		initializeBlock( block );
	} );
} );

/**
 * Initialize a single frequency response block.
 *
 * @param {HTMLElement} block Block element.
 */
async function initializeBlock( block ) {
	// Before the fetch, so the header paragraph is already a live region by the
	// time setBlockHeaderLabel swaps "Loading frequency response…" for the
	// system label — that swap is the only signal a screen reader gets that the
	// spinner has given way to a chart.
	initBlockLiveRegions( block );

	const fileUrl = block.dataset.fileUrl;
	const fileName = block.dataset.fileName || 'GLL File';
	const sourceIndex = parseInt( block.dataset.sourceIndex, 10 ) || 0;
	const responseIndex = parseInt( block.dataset.responseIndex, 10 ) || 0;
	const phaseMode = block.dataset.phaseMode || 'unwrapped';
	const normalized = block.dataset.normalized === 'true';
	const showPhase = block.dataset.showPhase !== 'false';
	const showMagnitude = block.dataset.showMagnitude !== 'false';
	const chartHeight = parseInt( block.dataset.chartHeight, 10 ) || 400;

	if ( ! fileUrl ) {
		showError( block, 'No file URL specified' );
		return;
	}

	try {
		// Fetch and parse the GLL file
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error( `Failed to fetch file: ${ response.statusText }` );
		}

		const arrayBuffer = await response.arrayBuffer();
		const data = await parseGLL( arrayBuffer );
		setBlockHeaderLabel( block, data );

		// Hide loading indicator
		const loadingEl = block.querySelector(
			'.gll-frequency-response-loading'
		);
		if ( loadingEl ) {
			loadingEl.style.display = 'none';
		}

		// Render the chart
		renderChart( block, data, {
			fileName,
			sourceIndex,
			responseIndex,
			phaseMode,
			normalized,
			showPhase,
			showMagnitude,
			chartHeight,
		} );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, error.message );
	}
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
function extractResponseData( source, responseIndex, phaseMode, normalized ) {
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
function buildMetadataHtml( { source, frequencyData, options, phaseSeries } ) {
	const minFreq = formatFrequency( frequencyData.minFrequency );
	const maxFreq = formatFrequency( frequencyData.maxFrequency );

	const badges = [];

	// Frequency range badge
	badges.push(
		`<span class="gll-meta-badge"><strong>Range:</strong> ${ minFreq } - ${ maxFreq }</span>`
	);

	// Phase mode badge
	if ( phaseSeries ) {
		const phaseModeLabels = {
			'group-delay': 'Group Delay',
			wrapped: 'Wrapped Phase',
			unwrapped: 'Unwrapped Phase',
		};
		const phaseLabel =
			phaseModeLabels[ options.phaseMode ] || phaseModeLabels.unwrapped;
		badges.push(
			`<span class="gll-meta-badge"><strong>Phase:</strong> ${ phaseLabel }</span>`
		);
	}

	// Normalization badge
	if ( options.normalized ) {
		badges.push(
			`<span class="gll-meta-badge gll-meta-badge-highlight"><strong>Normalized</strong></span>`
		);
	}

	// Source info badge
	if ( source.Label ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>Source:</strong> ${ escapeHtml(
				source.Label
			) }</span>`
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
function buildCanvasLabel( {
	source,
	frequencyData,
	magnitudes,
	options,
	phaseSeries,
} ) {
	const finite = magnitudes.filter( ( value ) => Number.isFinite( value ) );
	const parts = [];

	parts.push(
		`Frequency response of ${ source.Label || options.fileName }` +
			( options.normalized ? ', normalized' : '' )
	);
	parts.push(
		`${ formatFrequency(
			frequencyData.minFrequency
		) } to ${ formatFrequency( frequencyData.maxFrequency ) }`
	);

	if ( options.showMagnitude && finite.length > 0 ) {
		parts.push(
			`level ${ Math.min( ...finite ).toFixed( 1 ) } to ${ Math.max(
				...finite
			).toFixed( 1 ) } dB`
		);
	}

	if ( phaseSeries ) {
		parts.push( `${ phaseSeries.label } on the right axis` );
	}

	return `${ parts.join( ', ' ) }. The plotted values follow in a table.`;
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
function buildDataTable( frequencies, magnitudes ) {
	const indices = pickThirdOctaveIndices( frequencies );
	if ( indices.length === 0 ) {
		return null;
	}

	const table = document.createElement( 'table' );
	table.className = 'gll-visually-hidden';

	const caption = document.createElement( 'caption' );
	caption.textContent =
		'Frequency response level at one-third-octave band centres';
	table.appendChild( caption );

	const head = document.createElement( 'thead' );
	const headRow = document.createElement( 'tr' );
	[ 'Frequency', 'Level (dB)' ].forEach( ( text ) => {
		const cell = document.createElement( 'th' );
		cell.scope = 'col';
		cell.textContent = text;
		headRow.appendChild( cell );
	} );
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

/**
 * Render frequency response chart.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Parsed GLL data.
 * @param {Object}      options Chart options.
 */
function renderChart( block, data, options ) {
	const chartContainer = block.querySelector(
		'.gll-frequency-response-chart'
	);
	if ( ! chartContainer ) {
		return;
	}

	// Get source data
	const source = data?.Database?.SourceDefinitions?.[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, 'Source not found' );
		return;
	}

	// Extract frequency response data
	const responseData = extractResponseData(
		source,
		options.responseIndex,
		options.phaseMode,
		options.normalized
	);

	if ( ! responseData ) {
		showError(
			block,
			'No frequency response data available for this source'
		);
		return;
	}

	const { frequencies, magnitudes, phases } = responseData;

	// Build frequency data points for magnitude
	const frequencyData = buildFrequencyPoints( frequencies, magnitudes );
	if ( ! frequencyData ) {
		showError( block, 'Invalid frequency response data' );
		return;
	}

	// The series builder has already applied the requested phase mode.
	let phaseSeries = null;
	if ( options.showPhase && phases.length > 0 ) {
		phaseSeries = {
			values: phases,
			label: responseData.phaseLabel,
			axisTitle: responseData.phaseAxisTitle,
		};
	}

	// Create metadata display
	const metadataHtml = buildMetadataHtml( {
		source,
		frequencyData,
		options,
		phaseSeries,
	} );

	// Create canvas element for chart
	const canvas = document.createElement( 'canvas' );
	describeCanvas(
		canvas,
		buildCanvasLabel( {
			source,
			frequencyData,
			magnitudes,
			options,
			phaseSeries,
		} )
	);
	chartContainer.innerHTML = metadataHtml;

	const chartWrapper = document.createElement( 'div' );
	chartWrapper.className = 'gll-chart-container';
	// Without an explicit height the canvas falls back to Chart.js' 150px
	// default, which squashes the plot and collapses the dB axis to one tick.
	chartWrapper.style.minHeight = options.chartHeight + 'px';
	chartWrapper.appendChild( canvas );
	chartContainer.appendChild( chartWrapper );

	// The numbers behind the picture, for readers the canvas cannot serve.
	const dataTable = buildDataTable( frequencies, magnitudes );
	if ( dataTable ) {
		chartContainer.appendChild( dataTable );
	}

	chartContainer.style.display = 'block';

	const ctx = canvas.getContext( '2d' );

	// Build datasets array
	const datasets = [];

	if ( options.showMagnitude ) {
		datasets.push( {
			label: 'Level (dB)',
			data: frequencyData.points,
			borderColor: '#2563eb',
			backgroundColor: 'rgba(37, 99, 235, 0.1)',
			fill: true,
			tension: 0.3,
			pointRadius: 0,
			yAxisID: 'y',
		} );
	}

	if ( phaseSeries ) {
		const phasePoints = buildFrequencyPoints(
			frequencies,
			phaseSeries.values
		);
		if ( phasePoints ) {
			datasets.push( {
				label: phaseSeries.label,
				data: phasePoints.points,
				borderColor: '#dc2626',
				backgroundColor: 'transparent',
				tension: 0.3,
				pointRadius: 0,
				yAxisID: 'y1',
			} );
		}
	}

	// Build scales configuration
	const scales: Record< string, any > = {
		x: buildLogFrequencyScale(
			frequencyData.minFrequency,
			frequencyData.maxFrequency,
			'Frequency'
		),
	};

	if ( options.showMagnitude ) {
		scales.y = {
			type: 'linear',
			display: true,
			position: 'left',
			title: {
				display: true,
				text: 'Level (dB)',
			},
		};
	}

	if ( phaseSeries ) {
		scales.y1 = {
			type: 'linear',
			display: true,
			position: 'right',
			title: {
				display: true,
				text: phaseSeries.axisTitle,
			},
			grid: {
				drawOnChartArea: false,
			},
		};
	}

	// Create the chart
	const chartConfig: Record< string, any > = {
		type: 'line',
		data: {
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			// Chart.js animates the line in over a second by default. That is
			// the largest piece of motion this block produces, so it is the
			// first thing to drop when motion is unwelcome.
			animation: prefersReducedMotion() ? false : undefined,
			interaction: {
				mode: 'index',
				intersect: false,
			},
			scales,
			plugins: {
				legend: {
					position: 'top',
				},
				title: {
					display: true,
					text:
						options.fileName +
						( source.Label ? ` - ${ source.Label }` : '' ),
				},
				tooltip: {
					callbacks: {
						title: ( items ) => {
							const value = items?.[ 0 ]?.parsed?.x;
							return value ? formatFrequency( value ) : '';
						},
					},
				},
			},
		},
	};

	// Chart.js chrome (ticks, grid, legend, tooltip) defaults to near-black and
	// would vanish on a dark theme. Dataset colors are left alone — they encode
	// which series is which.
	applyChartThemeFrom( chartConfig, chartWrapper );

	new Chart( ctx, chartConfig );
}

/**
 * Show error message in block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {string}      message Error message.
 */
function showError( block, message ) {
	const loadingEl = block.querySelector( '.gll-frequency-response-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	const chartContainer = block.querySelector(
		'.gll-frequency-response-chart'
	);
	if ( chartContainer ) {
		// The inline styles this used to carry duplicated the `.gll-error` rule
		// in style.scss and, being literal hex, painted a white box on a dark
		// theme. The class alone now, so there is one place to change.
		renderErrorPanel( chartContainer, message );
		chartContainer.style.display = 'block';
	}
}
