/**
 * Client for the cached-display-subset REST routes.
 *
 * Deliberately free of React and of `@wordpress/api-fetch`. The frontend view
 * scripts are the main consumer and they are plain modules loaded on public
 * pages; pulling either dependency in would put a framework into every view
 * bundle to make one `fetch` call. The editor-side hook that wraps this lives in
 * `use-cache-publisher.ts` and imports React there instead.
 *
 * The contract with the server is small and one-directional:
 *
 * - `GET` returns the subset, or 404 when the cache is cold, stale or built by
 *   an older plugin. All three are the same thing to a caller — parse it
 *   yourself — so there is one failure path here, not three.
 * - `POST` needs a nonce and a logged-in author, which is why it is only ever
 *   called from the editor.
 *
 * Nothing here throws. A caller that cannot reach the cache has to fall back to
 * parsing regardless, so an exception would only be caught and discarded one
 * frame up.
 *
 * @package
 */

import { hydrateSubsetLabels } from './gll-subset';

/**
 * Base URL of the plugin's REST namespace.
 *
 * PHP localizes this onto every editor and view script. The fallback assumes
 * pretty permalinks and a site at the domain root, matching the assumption
 * `wasm-loader.ts` already makes about the plugin directory — a last resort for
 * a page where the settings object never arrived.
 *
 * @return {string} Base URL with a trailing slash.
 */
function restBase(): string {
	const configured = window.gllInfoSettings?.restUrl;

	if ( configured ) {
		return configured.endsWith( '/' ) ? configured : `${ configured }/`;
	}

	return '/wp-json/gll-info/v1/';
}

/**
 * URL of one attachment's cache entry.
 *
 * @param {number|string} fileId Attachment ID.
 * @return {string} Endpoint URL.
 */
function cacheUrl( fileId ): string {
	return `${ restBase() }cache/${ encodeURIComponent( String( fileId ) ) }`;
}

/**
 * Headers that authenticate a write.
 *
 * @return {Object} Request headers.
 */
function writeHeaders(): Record< string, string > {
	const headers: Record< string, string > = {
		'Content-Type': 'application/json',
	};

	const nonce = window.gllInfoSettings?.nonce;
	if ( nonce ) {
		headers[ 'X-WP-Nonce' ] = nonce;
	}

	return headers;
}

/**
 * Whether a value could be a stored subset.
 *
 * The endpoint is public and a site may sit behind a proxy that returns 200 with
 * an HTML error page, so a shape check is worth the three lines: rendering from
 * something that is not a subset would blank the block rather than fall back.
 *
 * @param {*} value Decoded response body.
 * @return {boolean} True when it looks like a subset.
 */
function looksLikeSubset( value ): boolean {
	return Boolean(
		value &&
			typeof value === 'object' &&
			typeof value.Version === 'number' &&
			value.Database &&
			typeof value.Database === 'object'
	);
}

/**
 * Fetch the cached subset for an attachment.
 *
 * Returns the subset with its translated labels re-attached, so callers get
 * something in the same shape a full parse produces and can hand it straight to
 * a renderer.
 *
 * @param {number|string} fileId Attachment ID.
 * @return {Promise<Object|null>} The subset, or null when there is no usable cache.
 */
export async function fetchCachedSubset( fileId ) {
	if ( ! fileId ) {
		return null;
	}

	try {
		const response = await fetch( cacheUrl( fileId ), {
			credentials: 'same-origin',
		} );

		if ( ! response.ok ) {
			return null;
		}

		const subset = await response.json();

		return looksLikeSubset( subset ) ? hydrateSubsetLabels( subset ) : null;
	} catch ( error ) {
		return null;
	}
}

/**
 * Store a subset for an attachment.
 *
 * `hash` is the SHA-256 of the bytes this subset was built from. Sending it lets
 * the server refuse the write if the file has been replaced since they were
 * read, instead of stamping this payload with the new file's fingerprint and
 * serving it as fresh forever. It is omitted where `crypto.subtle` is
 * unavailable — any page not in a secure context — and the server then stores
 * the payload without that guarantee rather than refusing it.
 *
 * @param {number|string} fileId Attachment ID.
 * @param {Object}        subset Display subset.
 * @param {string|null}   hash   Digest of the parsed bytes, when known.
 * @return {Promise<boolean>} Whether it was stored.
 */
export async function publishSubset( fileId, subset, hash = null ) {
	if ( ! fileId || ! subset ) {
		return false;
	}

	const body = hash ? { data: subset, hash } : { data: subset };

	try {
		const response = await fetch( cacheUrl( fileId ), {
			method: 'POST',
			credentials: 'same-origin',
			headers: writeHeaders(),
			body: JSON.stringify( body ),
		} );

		return response.ok;
	} catch ( error ) {
		return false;
	}
}

/**
 * Discard the cached subset for an attachment.
 *
 * @param {number|string} fileId Attachment ID.
 * @return {Promise<boolean>} Whether the request succeeded.
 */
export async function deleteCachedSubset( fileId ) {
	if ( ! fileId ) {
		return false;
	}

	try {
		const response = await fetch( cacheUrl( fileId ), {
			method: 'DELETE',
			credentials: 'same-origin',
			headers: writeHeaders(),
		} );

		return response.ok;
	} catch ( error ) {
		return false;
	}
}
