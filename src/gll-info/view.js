/**
 * GLL Info Block - Frontend View Script
 *
 * Handles loading and displaying GLL data on the frontend.
 *
 * @package GllInfo
 */

( function () {
	'use strict';

	// WASM state
	let wasmReady = false;
	let wasmError = null;
	let wasmPromise = null;

	/**
	 * Get settings from WordPress.
	 */
	function getSettings() {
		return (
			window.gllInfoSettings || {
				wasmUrl: '/wp-content/plugins/gll-info/assets/wasm/gll.wasm',
				wasmExecUrl:
					'/wp-content/plugins/gll-info/assets/wasm/wasm_exec.js',
			}
		);
	}

	/**
	 * Load the wasm_exec.js script.
	 */
	function loadWasmExec() {
		return new Promise( ( resolve, reject ) => {
			if ( typeof window.Go !== 'undefined' ) {
				resolve();
				return;
			}

			const script = document.createElement( 'script' );
			script.src = getSettings().wasmExecUrl;
			script.onload = resolve;
			script.onerror = () =>
				reject( new Error( 'Failed to load wasm_exec.js' ) );
			document.head.appendChild( script );
		} );
	}

	/**
	 * Initialize WASM.
	 */
	async function initWasm() {
		if ( wasmReady ) {
			return;
		}
		if ( wasmPromise ) {
			return wasmPromise;
		}

		wasmPromise = ( async () => {
			try {
				await loadWasmExec();

				const go = new window.Go();
				const response = await fetch( getSettings().wasmUrl );
				if ( ! response.ok ) {
					throw new Error(
						`Failed to fetch WASM: ${ response.status }`
					);
				}

				const result = await WebAssembly.instantiateStreaming(
					response,
					go.importObject
				);
				go.run( result.instance );

				if ( typeof window.parseGLL !== 'function' ) {
					throw new Error(
						'WASM module did not export parseGLL function'
					);
				}

				wasmReady = true;
			} catch ( error ) {
				wasmError = error;
				throw error;
			}
		} )();

		return wasmPromise;
	}

	/**
	 * Parse a GLL file from URL.
	 */
	async function parseGLLFromUrl( url ) {
		await initWasm();

		const response = await fetch( url );
		if ( ! response.ok ) {
			throw new Error( `Failed to fetch GLL file: ${ response.status }` );
		}

		const arrayBuffer = await response.arrayBuffer();
		const uint8Array = new Uint8Array( arrayBuffer );
		const resultJson = window.parseGLL( uint8Array );
		const result = JSON.parse( resultJson );

		if ( ! result.success ) {
			throw new Error( result.error || 'Failed to parse GLL file' );
		}

		return result.data;
	}

	/**
	 * Render overview section.
	 */
	function renderOverview( data ) {
		const { GenSystem, Metadata } = data;
		let html = '';

		if ( GenSystem ) {
			html += '<div class="gll-section"><h4>System Information</h4>';
			html += '<table class="gll-info-table"><tbody>';

			if ( GenSystem.Label ) {
				html += `<tr><th>Label</th><td>${ escapeHtml(
					GenSystem.Label
				) }</td></tr>`;
			}
			if ( GenSystem.Version ) {
				html += `<tr><th>Version</th><td>${ escapeHtml(
					GenSystem.Version
				) }</td></tr>`;
			}
			if ( GenSystem.SystemType !== undefined ) {
				const types = [ 'Line Array', 'Cluster', 'Loudspeaker' ];
				html += `<tr><th>Type</th><td>${
					types[ GenSystem.SystemType ] || 'Unknown'
				}</td></tr>`;
			}
			if ( GenSystem.Manufacturer ) {
				html += `<tr><th>Manufacturer</th><td>${ escapeHtml(
					GenSystem.Manufacturer
				) }</td></tr>`;
			}

			html += '</tbody></table></div>';
		}

		if ( Metadata && Metadata.Description ) {
			html += `<div class="gll-section"><h4>Description</h4><p>${ escapeHtml(
				Metadata.Description
			) }</p></div>`;
		}

		return html;
	}

	/**
	 * Render sources section.
	 */
	function renderSources( data ) {
		if ( ! data?.Database?.SourceDefinitions?.length ) {
			return '';
		}

		const sources = data.Database.SourceDefinitions;
		let html = `<div class="gll-sources"><h4>Acoustic Sources (${ sources.length })</h4>`;
		html += '<ul class="gll-sources-list">';

		for ( const source of sources ) {
			const label = source.Definition?.Label || source.Key;
			const bandFrom = source.Definition?.NominalBandwidthFrom;
			const bandTo = source.Definition?.NominalBandwidthTo;

			html += '<li class="gll-source-item">';
			html += `<strong>${ escapeHtml( label ) }</strong>`;

			if ( bandFrom && bandTo ) {
				html += `<span class="gll-source-bandwidth">${ Math.round(
					bandFrom
				) } - ${ Math.round( bandTo ) } Hz</span>`;
			}

			html += '</li>';
		}

		html += '</ul></div>';
		return html;
	}

	/**
	 * Escape HTML special characters.
	 */
	function escapeHtml( text ) {
		const div = document.createElement( 'div' );
		div.textContent = text;
		return div.innerHTML;
	}

	/**
	 * Initialize a GLL block.
	 */
	async function initBlock( block ) {
		const fileUrl = block.dataset.fileUrl;
		if ( ! fileUrl ) {
			return;
		}

		const showOverview = block.dataset.showOverview === 'true';
		const showSources = block.dataset.showSources === 'true';
		const loadingEl = block.querySelector( '.gll-info-loading' );
		const contentEl = block.querySelector( '.gll-info-content' );
		const loadingText = block.querySelector( '.gll-loading-text' );

		try {
			const data = await parseGLLFromUrl( fileUrl );

			// Update header with actual label.
			if ( loadingText && data.GenSystem?.Label ) {
				loadingText.textContent = data.GenSystem.Label;
			}

			// Build content.
			let contentHtml = '';

			if ( showOverview ) {
				contentHtml += renderOverview( data );
			}

			if ( showSources ) {
				contentHtml += renderSources( data );
			}

			// Render content.
			if ( contentEl ) {
				contentEl.innerHTML = contentHtml;
				contentEl.style.display = '';
			}

			// Hide loading.
			if ( loadingEl ) {
				loadingEl.style.display = 'none';
			}
		} catch ( error ) {
			// Show error.
			if ( loadingEl ) {
				loadingEl.innerHTML = `
					<div class="gll-info-error">
						<p>Error loading GLL file:</p>
						<code>${ escapeHtml( error.message ) }</code>
					</div>
				`;
			}
		}
	}

	/**
	 * Initialize all GLL blocks on the page.
	 */
	function init() {
		const blocks = document.querySelectorAll(
			'.wp-block-gll-info-gll-info'
		);
		blocks.forEach( initBlock );
	}

	// Initialize when DOM is ready.
	if ( document.readyState === 'loading' ) {
		document.addEventListener( 'DOMContentLoaded', init );
	} else {
		init();
	}
} )();
