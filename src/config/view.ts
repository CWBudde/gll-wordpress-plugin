/**
 * Configuration Block - Frontend Script
 *
 * Prefers the cached display subset served over REST and falls back to fetching
 * the GLL and parsing it through WASM, handing either result to
 * config-render.ts. The split keeps the DOM building testable under jsdom,
 * which importing the WASM loader would otherwise prevent.
 *
 * Imports reach into the specific shared modules rather than the `../shared`
 * barrel on purpose: the barrel pulls in the chart and Three.js wrappers, and
 * this block needs neither in its frontend bundle.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { fetchCachedSubset } from '../shared/gll-cache';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { initBlockLiveRegions, renderErrorPanel } from '../shared/a11y';
import { renderConfig } from './config-render';

/**
 * localStorage key holding the per-card open/closed preference.
 *
 * The map is keyed by card name alone (`box-types`, `frames`, ...) and never
 * by file, post or block id. The preference we are recording is "do I care
 * about filter groups", not "...in this one file", and keying it any finer
 * would both fragment the preference and persist file-derived data.
 */
const STORAGE_KEY = 'gll-config-cards';

/**
 * Initialize all configuration blocks on the page.
 *
 * The cache is tried for every block BEFORE the WASM runtime is touched, and the
 * runtime is booted only if something missed. That ordering is the entire point
 * of the cache: on a page where every block's file has been parsed already, the
 * 4.2 MB `gll.wasm` is never requested at all. Booting it up front — as this
 * used to — would have paid the download before discovering it was not needed.
 *
 * A cache miss is not an error. It is the normal state for a file nobody has
 * opened in the editor on a host with no server-side parser, and it simply means
 * this page parses the way every page did before.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = Array.from(
		document.querySelectorAll< HTMLElement >( '.gll-config-block' )
	);

	if ( blocks.length === 0 ) {
		return;
	}

	const pending = [];

	await Promise.all(
		blocks.map( async ( block ) => {
			// Before anything async, so the header paragraph is already a live
			// region when setBlockHeaderLabel rewrites it from "Loading
			// configuration…" to the system label. A region created and filled
			// in the same tick is not reliably announced.
			initBlockLiveRegions( block );

			if ( ! block.dataset.fileUrl ) {
				showError( block, __( 'No file URL specified', 'gll-info' ) );
				return;
			}

			const options = readBlockOptions( block );
			const cached = await fetchCachedSubset( block.dataset.fileId );

			if ( cached ) {
				renderBlock( block, cached, options );
				return;
			}

			pending.push( { block, options } );
		} )
	);

	if ( pending.length === 0 ) {
		return;
	}

	try {
		await ensureWasmReady();
	} catch ( error ) {
		console.error( 'Failed to initialize WASM:', error );
		pending.forEach( ( { block } ) => {
			showError(
				block,
				__( 'Failed to initialize WASM parser', 'gll-info' )
			);
		} );
		return;
	}

	pending.forEach( ( { block, options } ) => {
		parseAndRender( block, options );
	} );
} );

/**
 * Read a block's display options from its data attributes.
 *
 * @param {HTMLElement} block Block element.
 * @return {Object} Display options.
 */
function readBlockOptions( block ) {
	return {
		// Booleans that default to true are read as "not explicitly false", so
		// a block saved before an attribute existed keeps the documented
		// default.
		showBoxTypes: block.dataset.showBoxTypes !== 'false',
		showFrames: block.dataset.showFrames !== 'false',
		showFilterGroups: block.dataset.showFilterGroups !== 'false',
		showLimits: block.dataset.showLimits !== 'false',
		showWarnings: block.dataset.showWarnings !== 'false',
		showGeometrySummary: block.dataset.showGeometrySummary !== 'false',
		showFilterDetails: block.dataset.showFilterDetails !== 'false',
		rememberCollapsed: block.dataset.rememberCollapsed !== 'false',

		// Booleans that default to false take the opposite test.
		showPinPoints: block.dataset.showPinPoints === 'true',
		initiallyCollapsed: block.dataset.initiallyCollapsed === 'true',
		hideWhenEmpty: block.dataset.hideWhenEmpty === 'true',
	};
}

/**
 * Render a block from data, whichever source it came from.
 *
 * The cached subset and a full parse are interchangeable here: the subset
 * carries the config tables whole and reduces case geometries to counts, which
 * `formatGeometrySummary()` reads through `geometryCounts()`.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Normalized data or a hydrated subset.
 * @param {Object}      options Display options.
 */
function renderBlock( block, data, options ) {
	setBlockHeaderLabel( block, data );

	const loadingEl = block.querySelector( '.gll-config-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	renderConfig( block, data, options );

	if ( options.rememberCollapsed ) {
		restoreCardState( block );
	}
}

/**
 * Fetch and parse the file, then render.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      options Display options.
 */
async function parseAndRender( block, options ) {
	try {
		const response = await fetch( block.dataset.fileUrl );
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

		renderBlock( block, await parseGLL( arrayBuffer ), options );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, error.message );
	}
}

/**
 * Read the stored card preferences.
 *
 * Every access is guarded: Safari's private mode throws on write, and some
 * privacy settings throw on read too. A failure here just means the author's
 * `initiallyCollapsed` default stands, so it is swallowed rather than logged.
 *
 * @return {Object} Map of card key to open state. Empty when unavailable.
 */
function readCardState() {
	try {
		const raw = window.localStorage.getItem( STORAGE_KEY );
		if ( ! raw ) {
			return {};
		}
		const parsed = JSON.parse( raw );
		return parsed && typeof parsed === 'object' ? parsed : {};
	} catch ( error ) {
		return {};
	}
}

/**
 * Persist one card's open state.
 *
 * @param {string}  cardKey Card identifier from `data-card`.
 * @param {boolean} isOpen  Whether the card is now open.
 */
function writeCardState( cardKey, isOpen ) {
	try {
		const state = readCardState();
		state[ cardKey ] = isOpen;
		window.localStorage.setItem( STORAGE_KEY, JSON.stringify( state ) );
	} catch ( error ) {
		// Storage is unavailable or full. The card still works; only the
		// preference is lost.
	}
}

/**
 * Apply stored open states to a block's cards and keep them in sync.
 *
 * Storage only *overrides* the author's `initiallyCollapsed` default: a card
 * with no stored entry is left exactly as the renderer emitted it.
 *
 * @param {HTMLElement} block Block element.
 */
function restoreCardState( block ) {
	const stored = readCardState();
	const cards = block.querySelectorAll(
		'details.gll-config-card[data-card]'
	);

	cards.forEach( ( card ) => {
		const cardKey = card.dataset.card;
		if ( ! cardKey ) {
			return;
		}

		if ( Object.prototype.hasOwnProperty.call( stored, cardKey ) ) {
			card.open = Boolean( stored[ cardKey ] );
		}

		card.addEventListener( 'toggle', () => {
			writeCardState( cardKey, card.open );
		} );
	} );
}

/**
 * Show error message in block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {string}      message Error message.
 */
function showError( block, message ) {
	const loadingEl = block.querySelector( '.gll-config-loading' );
	if ( loadingEl ) {
		loadingEl.style.display = 'none';
	}

	const container = block.querySelector( '.gll-config-content' );
	if ( container ) {
		renderErrorPanel( container, message );
		container.style.display = 'block';
	}
}
