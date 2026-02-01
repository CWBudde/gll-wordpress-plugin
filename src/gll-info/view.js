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
	 * Initialize the WASM runtime.
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
	 * Format a number with up to one decimal place.
	 */
	function formatNumber( value ) {
		if ( typeof value !== 'number' || Number.isNaN( value ) ) {
			return null;
		}
		const rounded = Math.round( value * 10 ) / 10;
		return Number.isInteger( rounded ) ? `${ rounded }` : rounded.toFixed( 1 );
	}

	/**
	 * Format angle in degrees.
	 */
	function formatAngleDegrees( angle ) {
		const formatted = formatNumber( angle );
		return formatted === null ? '-' : `${ formatted }°`;
	}

	/**
	 * Format position coordinates in mm.
	 */
	function formatPosition( position ) {
		if ( ! position ) {
			return '-';
		}

		const x = position.x ?? position.X ?? position[ 0 ];
		const y = position.y ?? position.Y ?? position[ 1 ];
		const z = position.z ?? position.Z ?? position[ 2 ];

		const formattedX = formatNumber( x );
		const formattedY = formatNumber( y );
		const formattedZ = formatNumber( z );

		if ( formattedX === null && formattedY === null && formattedZ === null ) {
			return '-';
		}

		return [
			`X: ${ formattedX === null ? '-' : `${ formattedX } mm` }`,
			`Y: ${ formattedY === null ? '-' : `${ formattedY } mm` }`,
			`Z: ${ formattedZ === null ? '-' : `${ formattedZ } mm` }`,
		].join( ', ' );
	}

	/**
	 * Normalize value to array.
	 */
	function toArray( value ) {
		if ( ! value ) {
			return [];
		}
		if ( Array.isArray( value ) ) {
			return value;
		}
		if ( typeof value === 'object' ) {
			return Object.values( value );
		}
		return [];
	}

	/**
	 * Build a map of source definition keys to placement instances.
	 */
	function buildSourcePlacementsMap( data ) {
		const map = new Map();
		if ( ! data?.Database ) {
			return map;
		}

		const sourceDefinitions = Array.isArray( data.Database.SourceDefinitions )
			? data.Database.SourceDefinitions
			: [];
		const boxTypes = toArray( data.Database.BoxTypes || data.Database.box_types || data.Database.Box_Types );

		boxTypes.forEach( ( boxType ) => {
			const placements = toArray(
				boxType?.SourcePlacements ||
					boxType?.source_placements ||
					boxType?.Sources ||
					boxType?.SourceDefinitions ||
					boxType?.SourcePlacement
			);

			if ( placements.length === 0 ) {
				return;
			}

			const boxLabel = boxType?.Label || boxType?.Name || boxType?.Key || 'Unknown';
			const boxKey = boxType?.Key || boxType?.Id || boxType?.Name || '-';

			placements.forEach( ( placement ) => {
				const sourceKey =
					placement?.SourceDefinitionKey ||
					placement?.SourceDefinition?.Key ||
					placement?.SourceDefinition?.KeyRef ||
					placement?.SourceKey ||
					placement?.Source?.Key ||
					( typeof placement?.SourceIndex === 'number'
						? sourceDefinitions[ placement.SourceIndex ]?.Key
						: null ) ||
					placement?.Key;

				if ( ! sourceKey ) {
					return;
				}

				const entry = {
					boxLabel,
					boxKey,
					sourceLabel: placement?.Label || placement?.SourceLabel || placement?.Source?.Label || placement?.SourceName,
					sourceKey,
					position:
						placement?.Position ||
						placement?.PositionMM ||
						placement?.PositionMm ||
						placement?.Offset ||
						placement?.Location ||
						placement?.Coordinates,
					rotation:
						placement?.Rotation ||
						placement?.RotationAngles ||
						placement?.Orientation ||
						placement?.Angles ||
						placement?.Euler,
				};

				const existing = map.get( sourceKey ) || [];
				existing.push( entry );
				map.set( sourceKey, existing );
			} );
		} );

		return map;
	}

	/**
	 * Build placements HTML.
	 */
	function buildPlacementsHtml( placements ) {
		const placementCount = placements.length;
		let html = '<div class="gll-source-placements"><details>';
		html += `<summary>Placements (${ placementCount })</summary>`;
		html += '<div class="gll-source-placements-list">';

		if ( placementCount === 0 ) {
			html += '<div class="gll-empty-state gll-source-placements-empty">No placements found</div>';
		} else {
			placements.forEach( ( placement ) => {
				const rotation = placement.rotation || {};
				const heading = rotation.Heading ?? rotation.H ?? rotation.Yaw ?? rotation.Azimuth;
				const vertical = rotation.Vertical ?? rotation.V ?? rotation.Pitch ?? rotation.Elevation;
				const roll = rotation.Roll ?? rotation.R;

				const boxLabel = escapeHtml( placement.boxLabel || 'Unknown' );
				const boxKey = placement.boxKey ? ` (${ escapeHtml( placement.boxKey ) })` : '';
				const sourceLabel = escapeHtml( placement.sourceLabel || placement.sourceKey || 'Unknown' );
				const sourceKey = escapeHtml( placement.sourceKey || '-' );
				const position = escapeHtml( formatPosition( placement.position ) );

				html += '<div class="gll-source-placement">';
				html += `<div class="gll-source-placement-detail"><strong>Box:</strong> ${ boxLabel }${ boxKey }</div>`;
				html += `<div class="gll-source-placement-detail"><strong>Source:</strong> ${ sourceLabel } (${ sourceKey })</div>`;
				html += `<div class="gll-source-placement-detail"><strong>Position:</strong> ${ position }</div>`;
				html += `<div class="gll-source-placement-detail"><strong>Rotation:</strong> H: ${ formatAngleDegrees( heading ) }, V: ${ formatAngleDegrees( vertical ) }, R: ${ formatAngleDegrees( roll ) }</div>`;
				html += '</div>';
			} );
		}

		html += '</div></details></div>';
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
		const placementsMap = buildSourcePlacementsMap( data );
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

			const placements = placementsMap.get( source.Key ) || [];
			html += buildPlacementsHtml( placements );

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
