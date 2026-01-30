/**
 * Frequency Response Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Chart.js rendering on the frontend.
 *
 * @package GllInfo
 */

/* global Chart */

import { ensureWasmReady, parseGLLFile } from '../shared/wasm-loader';

/**
 * Initialize all frequency response blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-frequency-response-block' );

	if ( blocks.length === 0 ) {
		return;
	}

	// Ensure Chart.js is loaded
	if ( typeof Chart === 'undefined' ) {
		console.error( 'Chart.js is not loaded' );
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
		const uint8Array = new Uint8Array( arrayBuffer );
		const data = await parseGLLFile( uint8Array );

		// Hide loading indicator
		const loadingEl = block.querySelector( '.gll-frequency-response-loading' );
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
 * Render frequency response chart.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Parsed GLL data.
 * @param {Object}      options Chart options.
 */
function renderChart( block, data, options ) {
	const chartContainer = block.querySelector( '.gll-frequency-response-chart' );
	if ( ! chartContainer ) {
		return;
	}

	// Get source data
	const source = data?.Database?.SourceDefinitions?.[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, 'Source not found' );
		return;
	}

	// TODO: Extract actual frequency response data from source
	// This is a placeholder - actual implementation will extract transfer functions
	const frequencies = [];
	const magnitudes = [];
	const phases = [];

	// For now, show a placeholder message
	chartContainer.innerHTML = `
		<div style="padding: 20px; text-align: center; color: #666;">
			<p>Frequency response chart will be displayed here.</p>
			<p><strong>Source:</strong> ${ source.Label || 'Unknown' }</p>
			<p><strong>Configuration:</strong></p>
			<ul style="list-style: none; padding: 0;">
				<li>Phase Mode: ${ options.phaseMode }</li>
				<li>Normalized: ${ options.normalized ? 'Yes' : 'No' }</li>
				<li>Azimuth: ${ options.azimuth }°</li>
				<li>Elevation: ${ options.elevation }°</li>
			</ul>
			<p style="font-size: 0.9em; margin-top: 20px;">
				<em>Chart rendering will be implemented in Task 4.3</em>
			</p>
		</div>
	`;
	chartContainer.style.display = 'block';

	// The actual Chart.js rendering will be implemented in Task 4.3
	// when we port the chart configuration from the web demo
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

	const chartContainer = block.querySelector( '.gll-frequency-response-chart' );
	if ( chartContainer ) {
		chartContainer.innerHTML = `
			<div class="gll-error" style="padding: 20px; color: #d63638; border: 1px solid #d63638; border-radius: 4px; background: #fff8f8;">
				<strong>Error:</strong> ${ message }
			</div>
		`;
		chartContainer.style.display = 'block';
	}
}
