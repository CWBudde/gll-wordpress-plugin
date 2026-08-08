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
	const fileName = block.dataset.fileName || __( 'GLL File', 'gll-info' );
	const sourceIndex = parseInt( block.dataset.sourceIndex, 10 ) || 0;
	const frequencyIndex = parseInt( block.dataset.frequencyIndex, 10 ) || 0;
	const showHorizontal = block.dataset.showHorizontal !== 'false';
	const showVertical = block.dataset.showVertical !== 'false';
	const normalized = block.dataset.normalized === 'true';
	const chartHeight = parseInt( block.dataset.chartHeight, 10 ) || 400;

	if ( ! fileUrl ) {
		showError( block, __( 'No file URL specified', 'gll-info' ) );
		return;
	}

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
	const describePlane = ( name, levels ) => {
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

	// Build metadata HTML
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
		) }</strong> ${ slices.meta.meridianStep }\u00b0 \u00d7 ${
			slices.meta.parallelStep
		}\u00b0</span>`
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
