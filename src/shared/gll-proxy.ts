/**
 * Client for the editor-only download proxy.
 *
 * EDITOR ONLY, and kept in its own module to make that structural rather than a
 * convention. No view script imports this: an anonymous visitor could not use the
 * route anyway — it needs `upload_files` and a nonce — but a view bundle that
 * carried the call would advertise it on every public page and invite someone to
 * try. The frontend fetches external files directly from the reader's browser,
 * which is the whole design.
 *
 * Unlike `gll-cache.ts`, THIS THROWS. That module swallows everything because its
 * callers fall back to parsing regardless, so an exception would be caught and
 * discarded one frame up. Here the reason is the product: the editor has to tell
 * the author whether their file could not be reached at all, or only could not be
 * reached *by their browser* — and those two lead to different advice.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

import { HttpError } from './file-source';
import { routeWithArg } from './rest-base';

// Re-exported for the callers that only deal with the proxy. It is defined in
// `file-source.ts` because the view scripts need it and must not reach into
// this module.
export { HttpError };

/**
 * Download an external GLL file through this site.
 *
 * @param {string} url Address of the file.
 * @return {Promise<ArrayBuffer>} The bytes.
 * @throws {Error} When the site refuses or cannot fetch it.
 */
export async function fetchRemoteFile( url ): Promise< ArrayBuffer > {
	const endpoint = routeWithArg( 'remote', 'url', String( url ) );

	const response = await fetch( endpoint, {
		credentials: 'same-origin',
		headers: window.gllInfoSettings?.nonce
			? { 'X-WP-Nonce': window.gllInfoSettings.nonce }
			: {},
	} );

	if ( ! response.ok ) {
		// The route's own message is the useful part — "that address cannot be
		// loaded by this site", "too large", "turned off" all lead somewhere
		// different — so prefer it over inventing one from the status.
		let message = '';

		try {
			const body = await response.json();
			message = typeof body?.message === 'string' ? body.message : '';
		} catch ( error ) {
			message = '';
		}

		throw new HttpError(
			response.status,
			response.statusText,
			message ||
				sprintf(
					/* translators: 1: HTTP status code, e.g. 404. 2: HTTP status text. */
					__(
						'This site could not fetch the file: %1$d %2$s',
						'gll-info'
					),
					response.status,
					response.statusText
				)
		);
	}

	return response.arrayBuffer();
}

/**
 * Whether the editor may even try the proxy.
 *
 * There is no separate flag for this: the nonce is what every write path already
 * depends on, and without one the route answers 401 regardless.
 *
 * @return {boolean} True when a proxy attempt is worth making.
 */
export function canUseProxy(): boolean {
	return Boolean( window.gllInfoSettings?.nonce );
}
