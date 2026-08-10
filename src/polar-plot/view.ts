/**
 * Polar Plot Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js radar rendering on the frontend.
 *
 * @package
 */

import Chart from 'chart.js/auto';
import { __, _x, sprintf } from '@wordpress/i18n';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { formatFrequency } from '../shared/charting-utils';
import { computeLevelRange, computePolarSlices } from '../shared/polar-utils';
import polarCompassPlugin from '../shared/polar-compass-plugin';
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
	buildMetadataHtml,
	buildPolarDatasets,
	readBlockOptions,
} from './polar-render';

/**
 * Initialize all polar plot blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-polar-plot-block' );

	if ( blocks.length === 0 ) {
		return;
	}

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

	blocks.forEach( ( block ) => {
		initializeBlock( block );
	} );
} );

/**
 * Initialize a single polar plot block.
 *
 * @param {HTMLElement} block Block element.
 */
async function initializeBlock( block ) {
	// Before the fetch: the header paragraph has to be a live region already
	// when setBlockHeaderLabel rewrites it, or the loading-to-loaded transition
	// passes in silence.
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

		const loadingEl = block.querySelector( '.gll-polar-plot-loading' );
		if ( loadingEl ) {
			loadingEl.style.display = 'none';
		}

		renderChart( block, data, options );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, describeFetchFailure( error, fileUrl ) );
	}
}

/**
 * Render polar plot chart.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Parsed GLL data.
 * @param {Object}      options Chart options.
 */
function renderChart( block, data, options ) {
	const chartContainer = block.querySelector( '.gll-polar-plot-chart' );
	if ( ! chartContainer ) {
		return;
	}

	// Get sources with responses
	const sources = ( data?.Database?.SourceDefinitions || [] ).filter(
		( s ) => ( s.Responses || [] ).length > 0
	);

	const source = sources[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, __( 'Source not found', 'gll-info' ) );
		return;
	}

	const frequencies = source.Responses?.[ 0 ]?.Frequencies || [];
	if ( frequencies.length === 0 ) {
		showError( block, __( 'No frequency data available', 'gll-info' ) );
		return;
	}

	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );
	const slices = computePolarSlices( source, freqIdx );
	if ( ! slices ) {
		showError(
			block,
			__( 'No directivity data available for this source', 'gll-info' )
		);
		return;
	}

	const frequency = frequencies[ freqIdx ];

	// Apply normalization
	let horizontalLevels = slices.horizontal.levels;
	let verticalLevels = slices.vertical.levels;

	if ( options.normalized ) {
		const hMax = Math.max(
			...horizontalLevels.filter( ( v ) => v !== null && ! isNaN( v ) )
		);
		const vMax = Math.max(
			...verticalLevels.filter( ( v ) => v !== null && ! isNaN( v ) )
		);
		horizontalLevels = horizontalLevels.map( ( v ) =>
			v !== null && ! isNaN( v ) ? v - hMax : v
		);
		verticalLevels = verticalLevels.map( ( v ) =>
			v !== null && ! isNaN( v ) ? v - vMax : v
		);
	}

	const allLevels = [
		...( options.showHorizontal ? horizontalLevels : [] ),
		...( options.showVertical ? verticalLevels : [] ),
	];
	const levelRange = computeLevelRange( allLevels );
	const suggestedMax =
		levelRange.max !== null ? levelRange.max + 3 : undefined;
	const suggestedMin =
		levelRange.max !== null ? levelRange.max - 40 : undefined;

	const freqLabel = formatFrequency( frequency );

	const datasets = buildPolarDatasets( {
		horizontalLevels,
		verticalLevels,
		freqLabel,
		options,
	} );

	const metadataHtml = buildMetadataHtml( {
		slices,
		source,
		freqLabel,
		options,
	} );

	// Create canvas
	const canvas = document.createElement( 'canvas' );
	describeCanvas(
		canvas,
		buildCanvasLabel( {
			slices,
			horizontalLevels,
			verticalLevels,
			freqLabel,
			options,
		} )
	);
	chartContainer.innerHTML = metadataHtml;

	const chartWrapper = document.createElement( 'div' );
	chartWrapper.className = 'gll-chart-container';
	chartWrapper.style.minHeight = options.chartHeight + 'px';
	chartWrapper.appendChild( canvas );
	chartContainer.appendChild( chartWrapper );
	chartContainer.style.display = 'block';

	const ctx = canvas.getContext( '2d' );

	const chartConfig = {
		type: 'radar',
		plugins: [ polarCompassPlugin ],
		data: {
			labels: slices.labels,
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			// The 700 ms sweep-in is decorative; drop it rather than shorten it
			// when the visitor has asked for less motion.
			animation: prefersReducedMotion() ? false : { duration: 700 },
			layout: {
				padding: { top: 30, bottom: 30, left: 30, right: 30 },
			},
			plugins: {
				legend: {
					position: 'top',
				},
				tooltip: {
					callbacks: {
						title: ( items ) => {
							const label = items?.[ 0 ]?.label;
							return label
								? sprintf(
										/* translators: %s: angle label of the hovered point, for example "45°". */
										__( 'Angle %s', 'gll-info' ),
										label
								  )
								: '';
						},
						label: ( item ) => {
							const seriesLabel =
								item.dataset?.label ||
								_x( 'Level', 'chart series', 'gll-info' );
							if (
								item?.raw === null ||
								item?.raw === undefined
							) {
								return sprintf(
									/* translators: %s: chart series name. */
									__( '%s: -', 'gll-info' ),
									seriesLabel
								);
							}
							return sprintf(
								/* translators: 1: chart series name, 2: level in dB. */
								__( '%1$s: %2$s dB', 'gll-info' ),
								seriesLabel,
								( item.raw as number ).toFixed( 1 )
							);
						},
					},
				},
			},
			scales: {
				r: {
					suggestedMin,
					suggestedMax,
					startAngle: 90,
					// Chrome colors are intentionally omitted: the shared
					// chart theme fills them from the block's resolved
					// tokens, and `applyChartTheme` never overwrites a color
					// that is already set.
					ticks: {
						backdropColor: 'transparent',
					},
					grid: {},
					angleLines: {},
					pointLabels: {
						font: { size: 10 },
					},
				},
			},
		},
	};

	// Custom properties inherit, so any descendant of the block wrapper
	// resolves the same tokens.
	applyChartThemeFrom( chartConfig, chartWrapper );

	new Chart( ctx, chartConfig as any );
}

/**
 * Show error message in block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {string}      message Error message.
 */
function showError( block, message ) {
	const loadingEl = block.querySelector( '.gll-polar-plot-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	const chartContainer = block.querySelector( '.gll-polar-plot-chart' );
	if ( chartContainer ) {
		// The inline styles this used to carry duplicated the `.gll-error` rule
		// in style.scss; the class alone now, so there is one place to change.
		renderErrorPanel( chartContainer, message );
		chartContainer.style.display = 'block';
	}
}
