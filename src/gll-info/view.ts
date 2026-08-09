/**
 * GLL Info Block - Frontend View Script
 *
 * Handles loading and displaying GLL data on the frontend.
 *
 * @package
 */

import { __, _n, sprintf } from '@wordpress/i18n';
import { normalizeGllData } from '../shared/gll-normalize';
import { sourceResponseCount } from '../shared/gll-subset';
import { fetchCachedSubset } from '../shared/gll-cache';
import { initBlockLiveRegions, renderErrorPanel } from '../shared/a11y';
// Replaces a local copy that assigned `textContent` directly. Behaviour differs
// for one input: the local version rendered a missing field as the literal text
// "undefined", where the shared one renders nothing.
import { escapeHtml } from '../shared/escape-html';

( function () {
	'use strict';

	// WASM state
	let wasmReady = false;
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
	function loadWasmExec(): Promise< void > {
		return new Promise( ( resolve, reject ) => {
			if ( typeof window.Go !== 'undefined' ) {
				resolve( undefined );
				return;
			}

			const script = document.createElement( 'script' );
			script.src = getSettings().wasmExecUrl;
			script.onload = () => resolve( undefined );
			script.onerror = () =>
				reject(
					new Error( __( 'Failed to load wasm_exec.js', 'gll-info' ) )
				);
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
			await loadWasmExec();

			const go = new window.Go();
			const response = await fetch( getSettings().wasmUrl );

			if ( ! response.ok ) {
				throw new Error(
					sprintf(
						// translators: %d: HTTP status code.
						__( 'Failed to fetch WASM: %d', 'gll-info' ),
						response.status
					)
				);
			}

			const result = await WebAssembly.instantiateStreaming(
				response,
				go.importObject
			);
			go.run( result.instance );

			if ( typeof window.parseGLL !== 'function' ) {
				throw new Error(
					__(
						'WASM module did not export parseGLL function',
						'gll-info'
					)
				);
			}

			wasmReady = true;
		} )();

		return wasmPromise;
	}

	/**
	 * Parse a GLL file from URL.
	 * @param url
	 */
	async function parseGLLFromUrl( url ) {
		await initWasm();

		const response = await fetch( url );
		if ( ! response.ok ) {
			throw new Error(
				sprintf(
					// translators: %d: HTTP status code.
					__( 'Failed to fetch GLL file: %d', 'gll-info' ),
					response.status
				)
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		const uint8Array = new Uint8Array( arrayBuffer );
		const resultJson = window.parseGLL( uint8Array );
		const result = JSON.parse( resultJson );

		if ( ! result.success ) {
			throw new Error(
				result.error || __( 'Failed to parse GLL file', 'gll-info' )
			);
		}

		return normalizeGllData( result.data );
	}

	/**
	 * Render overview section.
	 * @param data
	 */
	function renderOverview( data ) {
		const { GenSystem, Metadata } = data;
		let html = '';

		if ( GenSystem ) {
			html += `<div class="gll-section"><h4>${ __(
				'System Information',
				'gll-info'
			) }</h4>`;
			html += '<table class="gll-info-table"><tbody>';

			if ( GenSystem.Label ) {
				html += `<tr><th>${ __(
					'Label',
					'gll-info'
				) }</th><td>${ escapeHtml( GenSystem.Label ) }</td></tr>`;
			}
			if ( GenSystem.Version ) {
				html += `<tr><th>${ __(
					'Version',
					'gll-info'
				) }</th><td>${ escapeHtml( GenSystem.Version ) }</td></tr>`;
			}
			if ( GenSystem.SystemType !== undefined ) {
				// Indexed by the GLL system-type enum, so the order is fixed by
				// the file format and only the wording is translated.
				const types = [
					__( 'Line Array', 'gll-info' ),
					__( 'Cluster', 'gll-info' ),
					__( 'Loudspeaker', 'gll-info' ),
				];
				html += `<tr><th>${ __( 'Type', 'gll-info' ) }</th><td>${
					types[ GenSystem.SystemType ] || __( 'Unknown', 'gll-info' )
				}</td></tr>`;
			}
			if ( GenSystem.Manufacturer ) {
				html += `<tr><th>${ __(
					'Manufacturer',
					'gll-info'
				) }</th><td>${ escapeHtml(
					GenSystem.Manufacturer
				) }</td></tr>`;
			}

			html += '</tbody></table></div>';
		}

		if ( Metadata && Metadata.Description ) {
			html += `<div class="gll-section"><h4>${ __(
				'Description',
				'gll-info'
			) }</h4><p>${ escapeHtml( Metadata.Description ) }</p></div>`;
		}

		return html;
	}

	/**
	 * Format a number with up to one decimal place.
	 * @param value
	 */
	function formatNumber( value ) {
		if ( typeof value !== 'number' || Number.isNaN( value ) ) {
			return null;
		}
		const rounded = Math.round( value * 10 ) / 10;
		return Number.isInteger( rounded )
			? `${ rounded }`
			: rounded.toFixed( 1 );
	}

	/**
	 * Format angle in degrees.
	 * @param angle
	 */
	function formatAngleDegrees( angle ) {
		const formatted = formatNumber( angle );
		return formatted === null ? '-' : `${ formatted }°`;
	}

	/**
	 * Format position coordinates in mm.
	 * @param position
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

		if (
			formattedX === null &&
			formattedY === null &&
			formattedZ === null
		) {
			return '-';
		}

		/**
		 * Append the unit, or a dash when the file carries no value.
		 *
		 * @param {string|null} formatted Rounded value, or null when absent.
		 * @return {string} Localized length.
		 */
		const withUnit = ( formatted ) =>
			formatted === null
				? '-'
				: sprintf(
						// translators: %s: a length, already rounded.
						__( '%s mm', 'gll-info' ),
						formatted
				  );

		return [
			sprintf(
				// translators: %s: the X coordinate with its unit, e.g. "120 mm".
				__( 'X: %s', 'gll-info' ),
				withUnit( formattedX )
			),
			sprintf(
				// translators: %s: the Y coordinate with its unit, e.g. "120 mm".
				__( 'Y: %s', 'gll-info' ),
				withUnit( formattedY )
			),
			sprintf(
				// translators: %s: the Z coordinate with its unit, e.g. "120 mm".
				__( 'Z: %s', 'gll-info' ),
				withUnit( formattedZ )
			),
		].join( ', ' );
	}

	/**
	 * Normalize value to array.
	 * @param value
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
	 * @param data
	 */
	function buildSourcePlacementsMap( data ) {
		const map = new Map();
		if ( ! data?.Database ) {
			return map;
		}

		const sourceDefinitions = Array.isArray(
			data.Database.SourceDefinitions
		)
			? data.Database.SourceDefinitions
			: [];
		const boxTypes = toArray(
			data.Database.BoxTypes ||
				data.Database.box_types ||
				data.Database.Box_Types
		);

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

			const boxLabel =
				boxType?.Label ||
				boxType?.Name ||
				boxType?.Key ||
				__( 'Unknown', 'gll-info' );
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
					sourceLabel:
						placement?.Label ||
						placement?.SourceLabel ||
						placement?.Source?.Label ||
						placement?.SourceName,
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
	 * @param placements
	 */
	function buildPlacementsHtml( placements ) {
		const placementCount = placements.length;
		let html = '<div class="gll-source-placements"><details>';
		html += `<summary>${ sprintf(
			// translators: %d: number of placements of this source.
			__( 'Placements (%d)', 'gll-info' ),
			placementCount
		) }</summary>`;
		html += '<div class="gll-source-placements-list">';

		if ( placementCount === 0 ) {
			html += `<div class="gll-empty-state gll-source-placements-empty">${ __(
				'No placements found',
				'gll-info'
			) }</div>`;
		} else {
			placements.forEach( ( placement ) => {
				const rotation = placement.rotation || {};
				const heading =
					rotation.Heading ??
					rotation.H ??
					rotation.Yaw ??
					rotation.Azimuth;
				const vertical =
					rotation.Vertical ??
					rotation.V ??
					rotation.Pitch ??
					rotation.Elevation;
				const roll = rotation.Roll ?? rotation.R;

				const boxLabel = escapeHtml(
					placement.boxLabel || __( 'Unknown', 'gll-info' )
				);
				const boxKey = placement.boxKey
					? ` (${ escapeHtml( placement.boxKey ) })`
					: '';
				const sourceLabel = escapeHtml(
					placement.sourceLabel ||
						placement.sourceKey ||
						__( 'Unknown', 'gll-info' )
				);
				const sourceKey = escapeHtml( placement.sourceKey || '-' );
				const position = escapeHtml(
					formatPosition( placement.position )
				);
				const rotationText = sprintf(
					/* translators: 1: heading angle. 2: vertical angle. 3: roll angle. All already carry the degree sign. */
					__( 'H: %1$s, V: %2$s, R: %3$s', 'gll-info' ),
					formatAngleDegrees( heading ),
					formatAngleDegrees( vertical ),
					formatAngleDegrees( roll )
				);

				html += '<div class="gll-source-placement">';
				html += `<div class="gll-source-placement-detail"><strong>${ __(
					'Box:',
					'gll-info'
				) }</strong> ${ boxLabel }${ boxKey }</div>`;
				html += `<div class="gll-source-placement-detail"><strong>${ __(
					'Source:',
					'gll-info'
				) }</strong> ${ sourceLabel } (${ sourceKey })</div>`;
				html += `<div class="gll-source-placement-detail"><strong>${ __(
					'Position:',
					'gll-info'
				) }</strong> ${ position }</div>`;
				html += `<div class="gll-source-placement-detail"><strong>${ __(
					'Rotation:',
					'gll-info'
				) }</strong> ${ rotationText }</div>`;
				html += '</div>';
			} );
		}

		html += '</div></details></div>';
		return html;
	}

	/**
	 * Render the per-source response summary — measured response count and
	 * angular resolution.
	 *
	 * Gated on `BalloonData` rather than on the response count, matching the
	 * editor's `SourceCard`: a source with a balloon definition but no measured
	 * responses is a fact worth stating, not an absence worth hiding. The
	 * normalizer emits null here for a source with no balloon block at all,
	 * which is what makes that distinction available.
	 *
	 * Both strings are escaped after formatting, not before: the interpolated
	 * values are numbers, so the only thing that can carry markup into
	 * `innerHTML` is the translation itself.
	 *
	 * @param source Source definition from the parsed data.
	 * @return HTML fragment, or the empty string when the source has no balloon.
	 */
	function buildResponseSummaryHtml( source ) {
		const balloon = source?.Definition?.BalloonData;
		if ( ! balloon ) {
			return '';
		}

		// Reads the array from a full parse and the count from a cached subset,
		// so the same renderer serves both paths.
		const responseCount = sourceResponseCount( source );
		let html = `<span class="gll-source-responses">${ escapeHtml(
			sprintf(
				/* translators: %d: number of measured responses for one acoustic source. */
				_n( '%d response', '%d responses', responseCount, 'gll-info' ),
				responseCount
			)
		) }</span>`;

		const meridian = balloon.AngularResolution?.MeridianStep || 0;
		const parallel = balloon.AngularResolution?.ParallelStep || 0;
		if ( meridian || parallel ) {
			html += `<span class="gll-source-resolution">${ escapeHtml(
				sprintf(
					/* translators: 1: meridian angular step in degrees. 2: parallel angular step in degrees. */
					__( '%1$s° × %2$s°', 'gll-info' ),
					meridian,
					parallel
				)
			) }</span>`;
		}

		return html;
	}

	/**
	 * Render sources section.
	 * @param data
	 * @param showResponses Whether to include the per-source response summary.
	 */
	function renderSources( data, showResponses = true ) {
		if ( ! data?.Database?.SourceDefinitions?.length ) {
			return '';
		}

		const sources = data.Database.SourceDefinitions;
		const placementsMap = buildSourcePlacementsMap( data );
		let html = `<div class="gll-sources"><h4>${ sprintf(
			// translators: %d: number of acoustic sources in the file.
			__( 'Acoustic Sources (%d)', 'gll-info' ),
			sources.length
		) }</h4>`;
		html += '<ul class="gll-sources-list">';

		for ( const source of sources ) {
			const label = source.Definition?.Label || source.Key;
			const bandFrom = source.Definition?.NominalBandwidthFrom;
			const bandTo = source.Definition?.NominalBandwidthTo;

			html += '<li class="gll-source-item">';
			html += `<strong>${ escapeHtml( label ) }</strong>`;

			if ( bandFrom && bandTo ) {
				html += `<span class="gll-source-bandwidth">${ sprintf(
					/* translators: 1: lower band limit in Hz. 2: upper band limit in Hz. */
					__( '%1$d - %2$d Hz', 'gll-info' ),
					Math.round( bandFrom ),
					Math.round( bandTo )
				) }</span>`;
			}

			if ( showResponses ) {
				html += buildResponseSummaryHtml( source );
			}

			const placements = placementsMap.get( source.Key ) || [];
			html += buildPlacementsHtml( placements );

			html += '</li>';
		}

		html += '</ul></div>';
		return html;
	}

	/**
	 * Initialize a GLL block.
	 * @param block
	 */
	async function initBlock( block ) {
		const fileUrl = block.dataset.fileUrl;
		if ( ! fileUrl ) {
			return;
		}

		// Set up before the parse, not after it: the helper turns this block's
		// `.gll-loading-text` paragraph into the live region, and the header
		// rewrite below is what announces the loading-to-loaded transition. A
		// region that is created and filled in the same tick is treated as
		// having had that text all along, and is never read out.
		const announce = initBlockLiveRegions( block );

		const showOverview = block.dataset.showOverview === 'true';
		const showSources = block.dataset.showSources === 'true';
		const showResponses = block.dataset.showResponses === 'true';
		const loadingEl = block.querySelector( '.gll-info-loading' );
		const contentEl = block.querySelector( '.gll-info-content' );
		const loadingText = block.querySelector( '.gll-loading-text' );

		try {
			// The cache first, and WASM only if it misses. `parseGLLFromUrl()`
			// is what boots the 4.2 MB runtime, and it is called lazily here, so
			// a page whose blocks all hit the cache never requests it at all.
			//
			// A miss is not an error: it is the normal state for a file nobody
			// has opened in the editor on a host with no server-side parser, and
			// it simply means this block parses the way it always did.
			const data =
				( await fetchCachedSubset( block.dataset.fileId ) ) ||
				( await parseGLLFromUrl( fileUrl ) );

			// Update header with actual label.
			if ( loadingText && data.GenSystem?.Label ) {
				loadingText.textContent = data.GenSystem.Label;
			} else {
				// Files without a system label would otherwise leave the region
				// reading "Loading GLL data…" forever.
				announce( __( 'GLL data loaded.', 'gll-info' ) );
			}

			// Build content.
			let contentHtml = '';

			if ( showOverview ) {
				contentHtml += renderOverview( data );
			}

			if ( showSources ) {
				contentHtml += renderSources( data, showResponses );
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
			// The panel replaces the spinner the reader is waiting on and
			// arrives long after the page settled, so it is rendered as a
			// `role="alert"` region rather than being left for someone to
			// stumble over. The shared panel also carries the `.gll-error`
			// styling every other block uses.
			if ( loadingEl ) {
				renderErrorPanel(
					loadingEl,
					sprintf(
						// translators: %s: the underlying failure description.
						__( 'Could not load the GLL file. %s', 'gll-info' ),
						error.message
					)
				);
				loadingEl.style.display = '';
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
