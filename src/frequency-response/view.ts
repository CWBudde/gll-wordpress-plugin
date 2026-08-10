/**
 * Frequency Response Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js rendering on the frontend.
 *
 * @package
 */

import Chart from 'chart.js/auto';
import { __, sprintf } from '@wordpress/i18n';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import {
	buildFrequencyPoints,
	buildLogFrequencyScale,
	formatFrequency,
} from '../shared/charting-utils';
import { applyChartThemeFrom } from '../shared/chart-theme';
import {
	describeCanvas,
	initBlockLiveRegions,
	prefersReducedMotion,
	renderErrorPanel,
} from '../shared/a11y';
import { describeFetchFailure, isSafeFileUrl } from '../shared/file-source';
import {
	buildCanvasLabel,
	buildDataTable,
	buildMetadataHtml,
	extractResponseData,
	readBlockOptions,
} from './response-render';

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
			showError(
				block,
				__( 'Failed to initialize WASM parser', 'gll-info' )
			);
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

	if ( ! fileUrl ) {
		showError( block, __( 'No file URL specified', 'gll-info' ) );
		return;
	}

	// Saved markup, but nothing had ever checked it. A scheme test is cheap and
	// is the whole of what a view script can usefully say about an address.
	if ( ! isSafeFileUrl( fileUrl ) ) {
		showError(
			block,
			__( 'This block has an address it cannot load.', 'gll-info' )
		);
		return;
	}

	const options = readBlockOptions( block.dataset );

	try {
		// Fetch and parse the GLL file
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error(
				sprintf(
					/* translators: %s: HTTP status text, e.g. "Not Found". */
					__( 'Failed to fetch file: %s', 'gll-info' ),
					response.statusText
				)
			);
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
		renderChart( block, data, options );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, describeFetchFailure( error, fileUrl ) );
	}
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
		showError( block, __( 'Source not found', 'gll-info' ) );
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
			__(
				'No frequency response data available for this source',
				'gll-info'
			)
		);
		return;
	}

	const { frequencies, magnitudes, phases } = responseData;

	// Build frequency data points for magnitude
	const frequencyData = buildFrequencyPoints( frequencies, magnitudes );
	if ( ! frequencyData ) {
		showError( block, __( 'Invalid frequency response data', 'gll-info' ) );
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
			label: __( 'Level (dB)', 'gll-info' ),
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
			__( 'Frequency', 'gll-info' )
		),
	};

	if ( options.showMagnitude ) {
		scales.y = {
			type: 'linear',
			display: true,
			position: 'left',
			title: {
				display: true,
				text: __( 'Level (dB)', 'gll-info' ),
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
					text: source.Label
						? sprintf(
								/* translators: 1: GLL file name, 2: source label. */
								__( '%1$s - %2$s', 'gll-info' ),
								options.fileName,
								source.Label
						  )
						: options.fileName,
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

	// Cast as in polar-plot/view.ts: the config is assembled dynamically as a
	// plain record, and Chart.js' generic config type cannot be satisfied
	// without pinning the chart type and dataset shapes at construction.
	new Chart( ctx, chartConfig as any );
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
