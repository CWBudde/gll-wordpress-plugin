/**
 * Polar Plot Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js radar rendering on the frontend.
 *
 * @package GllInfo
 */

/* global Chart */

import { ensureWasmReady, parseGLLFile } from '../shared/wasm-loader';
import { formatFrequency } from '../shared/charting-utils';
import { computePolarSlices, computeLevelRange } from '../shared/polar-utils';
import polarCompassPlugin from '../shared/polar-compass-plugin';

/**
 * Initialize all polar plot blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-polar-plot-block' );

	if ( blocks.length === 0 ) {
		return;
	}

	if ( typeof Chart === 'undefined' ) {
		console.error( 'Chart.js is not loaded' );
		return;
	}

	try {
		await ensureWasmReady();
	} catch ( error ) {
		console.error( 'Failed to initialize WASM:', error );
		blocks.forEach( ( block ) => {
			showError( block, 'Failed to initialize WASM parser' );
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
	const fileUrl = block.dataset.fileUrl;
	const fileName = block.dataset.fileName || 'GLL File';
	const sourceIndex = parseInt( block.dataset.sourceIndex, 10 ) || 0;
	const frequencyIndex = parseInt( block.dataset.frequencyIndex, 10 ) || 0;
	const showHorizontal = block.dataset.showHorizontal !== 'false';
	const showVertical = block.dataset.showVertical !== 'false';
	const normalized = block.dataset.normalized === 'true';
	const chartHeight = parseInt( block.dataset.chartHeight, 10 ) || 400;

	if ( ! fileUrl ) {
		showError( block, 'No file URL specified' );
		return;
	}

	try {
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error( `Failed to fetch file: ${ response.statusText }` );
		}

		const arrayBuffer = await response.arrayBuffer();
		const uint8Array = new Uint8Array( arrayBuffer );
		const data = await parseGLLFile( uint8Array );

		const loadingEl = block.querySelector( '.gll-polar-plot-loading' );
		if ( loadingEl ) {
			loadingEl.style.display = 'none';
		}

		renderChart( block, data, {
			fileName,
			sourceIndex,
			frequencyIndex,
			showHorizontal,
			showVertical,
			normalized,
			chartHeight,
		} );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, error.message );
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
	const sources = ( data?.Database?.SourceDefinitions || [] )
		.filter( ( s ) => ( s.Responses || [] ).length > 0 );

	const source = sources[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, 'Source not found' );
		return;
	}

	const frequencies = source.Responses?.[ 0 ]?.Frequencies || [];
	if ( frequencies.length === 0 ) {
		showError( block, 'No frequency data available' );
		return;
	}

	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );
	const slices = computePolarSlices( source, freqIdx );
	if ( ! slices ) {
		showError( block, 'No directivity data available for this source' );
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
	const suggestedMax = levelRange.max !== null ? levelRange.max + 3 : undefined;
	const suggestedMin = levelRange.max !== null ? levelRange.max - 40 : undefined;

	const freqLabel = formatFrequency( frequency );
	const normSuffix = options.normalized ? ' (normalized)' : '';
	const datasets = [];

	if ( options.showHorizontal ) {
		datasets.push( {
			label: `Horizontal @ ${ freqLabel }${ normSuffix }`,
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
			label: `Vertical @ ${ freqLabel }${ normSuffix }`,
			data: verticalLevels,
			borderColor: '#dc2626',
			backgroundColor: 'rgba(220, 38, 38, 0.12)',
			pointRadius: 0,
			borderWidth: 2,
			fill: true,
			tension: 0.2,
		} );
	}

	// Build metadata HTML
	const badges = [];
	badges.push( `<span class="gll-meta-badge"><strong>Frequency:</strong> ${ freqLabel }</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Symmetry:</strong> ${ slices.meta.symmetryName }</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Resolution:</strong> ${ slices.meta.stepDeg }\u00b0</span>` );
	if ( options.normalized ) {
		badges.push( '<span class="gll-meta-badge gll-meta-badge-highlight"><strong>Normalized</strong></span>' );
	}
	if ( slices.meta.usesOnAxis ) {
		badges.push( '<span class="gll-meta-badge">Uses on-axis</span>' );
	}
	if ( slices.meta.frontHalfOnly ) {
		badges.push( '<span class="gll-meta-badge">Front-half only</span>' );
	}
	const sourceLabel = source.Definition?.Label || source.Label || '';
	if ( sourceLabel ) {
		badges.push( `<span class="gll-meta-badge"><strong>Source:</strong> ${ sourceLabel }</span>` );
	}

	const metadataHtml = `<div class="gll-polar-plot-metadata">${ badges.join( '' ) }</div>`;

	// Create canvas
	const canvas = document.createElement( 'canvas' );
	chartContainer.innerHTML = metadataHtml;

	const chartWrapper = document.createElement( 'div' );
	chartWrapper.className = 'gll-chart-container';
	chartWrapper.style.minHeight = options.chartHeight + 'px';
	chartWrapper.appendChild( canvas );
	chartContainer.appendChild( chartWrapper );
	chartContainer.style.display = 'block';

	const ctx = canvas.getContext( '2d' );

	new Chart( ctx, {
		type: 'radar',
		plugins: [ polarCompassPlugin ],
		data: {
			labels: slices.labels,
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			animation: { duration: 700 },
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
							return label ? `Angle ${ label }` : '';
						},
						label: ( item ) => {
							if ( item?.raw === null || item?.raw === undefined ) {
								return `${ item.dataset?.label || 'Level' }: -`;
							}
							return `${ item.dataset?.label || 'Level' }: ${ ( item.raw as number ).toFixed( 1 ) } dB`;
						},
					},
				},
			},
			scales: {
				r: {
					suggestedMin,
					suggestedMax,
					startAngle: 90,
					ticks: {
						backdropColor: 'transparent',
						color: '#64748b',
					},
					grid: {
						color: 'rgba(148, 163, 184, 0.25)',
					},
					angleLines: {
						color: 'rgba(148, 163, 184, 0.25)',
					},
					pointLabels: {
						color: '#64748b',
						font: { size: 10 },
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
	const loadingEl = block.querySelector( '.gll-polar-plot-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	const chartContainer = block.querySelector( '.gll-polar-plot-chart' );
	if ( chartContainer ) {
		chartContainer.innerHTML = `
			<div class="gll-error" style="padding: 20px; color: #d63638; border: 1px solid #d63638; border-radius: 4px; background: #fff8f8;">
				<strong>Error:</strong> ${ message }
			</div>
		`;
		chartContainer.style.display = 'block';
	}
}
