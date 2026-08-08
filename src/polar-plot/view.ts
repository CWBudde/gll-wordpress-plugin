/**
 * Polar Plot Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js radar rendering on the frontend.
 *
 * @package
 */

import Chart from 'chart.js/auto';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { escapeHtml } from '../shared/escape-html';
import { formatFrequency } from '../shared/charting-utils';
import {
	buildPolarAngles,
	computeLevelRange,
	computePolarSlices,
} from '../shared/polar-utils';
import polarCompassPlugin from '../shared/polar-compass-plugin';
import { applyChartThemeFrom } from '../shared/chart-theme';
import {
	beamwidthAtDrop,
	describeCanvas,
	initBlockLiveRegions,
	prefersReducedMotion,
	renderErrorPanel,
} from '../shared/a11y';

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
	// Before the fetch: the header paragraph has to be a live region already
	// when setBlockHeaderLabel rewrites it, or the loading-to-loaded transition
	// passes in silence.
	initBlockLiveRegions( block );

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
		const data = await parseGLL( arrayBuffer );
		setBlockHeaderLabel( block, data );

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
function buildCanvasLabel( {
	slices,
	horizontalLevels,
	verticalLevels,
	freqLabel,
	options,
} ) {
	const angles = buildPolarAngles( slices.meta.stepDeg );
	const parts = [ `Polar directivity plot at ${ freqLabel }` ];

	/**
	 * Describe one plane's coverage.
	 *
	 * @param {string} name   Plane name.
	 * @param {Array}  levels Levels for that plane.
	 * @return {string} Sentence fragment.
	 */
	const describePlane = ( name, levels ) => {
		const width = beamwidthAtDrop( angles, levels, 6 );
		return width === null
			? `${ name } coverage not determinable from the measured data`
			: `${ name } −6 dB beamwidth ${ width }°`;
	};

	if ( options.showHorizontal ) {
		parts.push( describePlane( 'horizontal', horizontalLevels ) );
	}
	if ( options.showVertical ) {
		parts.push( describePlane( 'vertical', verticalLevels ) );
	}

	parts.push( `${ slices.meta.symmetryName } symmetry` );

	if ( options.normalized ) {
		parts.push( 'levels normalized to the on-axis maximum' );
	}

	return `${ parts.join( ', ' ) }.`;
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
	const suggestedMax =
		levelRange.max !== null ? levelRange.max + 3 : undefined;
	const suggestedMin =
		levelRange.max !== null ? levelRange.max - 40 : undefined;

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
	badges.push(
		`<span class="gll-meta-badge"><strong>Frequency:</strong> ${ freqLabel }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>Symmetry:</strong> ${ slices.meta.symmetryName }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>Resolution:</strong> ${ slices.meta.meridianStep }\u00b0 \u00d7 ${ slices.meta.parallelStep }\u00b0</span>`
	);
	if ( options.normalized ) {
		badges.push(
			'<span class="gll-meta-badge gll-meta-badge-highlight"><strong>Normalized</strong></span>'
		);
	}
	if ( slices.meta.usesOnAxis ) {
		badges.push( '<span class="gll-meta-badge">Uses on-axis</span>' );
	}
	if ( slices.meta.frontHalfOnly ) {
		badges.push( '<span class="gll-meta-badge">Front-half only</span>' );
	}
	const sourceLabel = source.Definition?.Label || source.Label || '';
	if ( sourceLabel ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>Source:</strong> ${ escapeHtml(
				sourceLabel
			) }</span>`
		);
	}

	const metadataHtml = `<div class="gll-polar-plot-metadata">${ badges.join(
		''
	) }</div>`;

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
							return label ? `Angle ${ label }` : '';
						},
						label: ( item ) => {
							if (
								item?.raw === null ||
								item?.raw === undefined
							) {
								return `${ item.dataset?.label || 'Level' }: -`;
							}
							return `${ item.dataset?.label || 'Level' }: ${ (
								item.raw as number
							 ).toFixed( 1 ) } dB`;
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
