/**
 * Resources Block - Frontend Script
 *
 * Fetches the GLL, parses it through WASM, and hands the result to
 * resource-render.ts. The split keeps the DOM building testable under jsdom,
 * which importing the WASM loader would otherwise prevent.
 *
 * @package
 */

import { __ } from '@wordpress/i18n';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { initBlockLiveRegions, renderErrorPanel } from '../shared/a11y';
import {
	describeFetchFailure,
	HttpError,
	isSafeFileUrl,
} from '../shared/file-source';
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
 * Initialize a single resources block.
 *
 * @param {HTMLElement} block Block element.
 */
async function initializeBlock( block ) {
	// Before the fetch: the header's "Loading resources…" paragraph becomes the
	// live region that setBlockHeaderLabel later rewrites, and the decorative
	// spinner and header glyph are taken out of the accessibility tree.
	initBlockLiveRegions( block );

	const fileUrl = block.dataset.fileUrl;
	const showDocumentation = block.dataset.showDocumentation !== 'false';
	const showDataFiles = block.dataset.showDataFiles !== 'false';
	const showPreviews = block.dataset.showPreviews !== 'false';
	const previewMaxHeight =
		parseInt( block.dataset.previewMaxHeight, 10 ) || 240;
	const hideWhenEmpty = block.dataset.hideWhenEmpty === 'true';

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

	try {
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			// Typed, not a plain Error: `describeFetchFailure()` branches on the
			// status, and without one a 404 would be reported either as a
			// blocked cross-origin read or as a corrupt file.
			throw new HttpError( response.status, response.statusText );
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
		showError( block, describeFetchFailure( error, fileUrl ) );
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
		renderErrorPanel( container, message );
		container.style.display = 'block';
	}
}
