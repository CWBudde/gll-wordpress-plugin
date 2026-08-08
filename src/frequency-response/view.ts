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
	const fileUrl = block.dataset.fileUrl;
	const fileName = block.dataset.fileName || 'GLL File';
	const sourceIndex = parseInt( block.dataset.sourceIndex, 10 ) || 0;
	const responseIndex = parseInt( block.dataset.responseIndex, 10 ) || 0;
	const phaseMode = block.dataset.phaseMode || 'unwrapped';
	const normalized = block.dataset.normalized === 'true';
	const azimuth = parseFloat( block.dataset.azimuth ) || 0;
	const elevation = parseFloat( block.dataset.elevation ) || 0;
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
			azimuth,
			elevation,
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

	// Angular position badge
	if ( options.azimuth !== 0 || options.elevation !== 0 ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>Position:</strong> Az ${ options.azimuth }° / El ${ options.elevation }°</span>`
		);
	} else {
		badges.push(
			`<span class="gll-meta-badge"><strong>Position:</strong> On-axis (0° / 0°)</span>`
		);
	}

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
	chartContainer.innerHTML = metadataHtml;

	const chartWrapper = document.createElement( 'div' );
	chartWrapper.className = 'gll-chart-container';
	// Without an explicit height the canvas falls back to Chart.js' 150px
	// default, which squashes the plot and collapses the dB axis to one tick.
	chartWrapper.style.minHeight = options.chartHeight + 'px';
	chartWrapper.appendChild( canvas );
	chartContainer.appendChild( chartWrapper );
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
	new Chart( ctx, {
		type: 'line',
		data: {
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
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
	} );
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
		chartContainer.innerHTML = `
			<div class="gll-error" style="padding: 20px; color: #d63638; border: 1px solid #d63638; border-radius: 4px; background: #fff8f8;">
				<strong>Error:</strong> ${ escapeHtml( message ) }
			</div>
		`;
		chartContainer.style.display = 'block';
	}
}
