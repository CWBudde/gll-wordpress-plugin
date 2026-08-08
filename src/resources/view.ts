/**
 * Resources Block - Frontend Script
 *
 * Fetches the GLL, parses it through WASM, and hands the result to
 * resource-render.ts. The split keeps the DOM building testable under jsdom,
 * which importing the WASM loader would otherwise prevent.
 *
 * @package
 */

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { escapeHtml } from '../shared/escape-html';
import { renderResources } from './resource-render';

/**
 * Initialize all resources blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-resources-block' );

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
 * Initialize a single resources block.
 *
 * @param {HTMLElement} block Block element.
 */
async function initializeBlock( block ) {
	const fileUrl = block.dataset.fileUrl;
	const showDocumentation = block.dataset.showDocumentation !== 'false';
	const showDataFiles = block.dataset.showDataFiles !== 'false';
	const showPreviews = block.dataset.showPreviews !== 'false';
	const previewMaxHeight =
		parseInt( block.dataset.previewMaxHeight, 10 ) || 240;
	const hideWhenEmpty = block.dataset.hideWhenEmpty === 'true';

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

		const loadingEl = block.querySelector( '.gll-resources-loading' );
		if ( loadingEl ) {
			loadingEl.style.display = 'none';
		}

		renderResources( block, data, {
			showDocumentation,
			showDataFiles,
			showPreviews,
			previewMaxHeight,
			hideWhenEmpty,
		} );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, error.message );
	}
}

/**
 * Show error message in block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {string}      message Error message.
 */
function showError( block, message ) {
	const loadingEl = block.querySelector( '.gll-resources-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	const container = block.querySelector( '.gll-resources-content' );
	if ( container ) {
		container.innerHTML = `
			<div class="gll-error">
				<strong>Error:</strong> ${ escapeHtml( message ) }
			</div>
		`;
		container.style.display = 'block';
	}
}
