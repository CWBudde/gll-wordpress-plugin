/**
 * Where this plugin's REST routes live, and how a write authenticates.
 *
 * Lifted out of `gll-cache.ts` when a second client (`gll-proxy.ts`) needed the
 * same two functions. Duplicating six lines would have been the smaller change
 * right up until the day the two copies disagreed about a trailing slash.
 *
 * @package
 */

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
export function restBase(): string {
	const configured = window.gllInfoSettings?.restUrl;

	if ( configured ) {
		return configured.endsWith( '/' ) ? configured : `${ configured }/`;
	}

	return '/wp-json/gll-info/v1/';
}

/**
 * A route URL carrying one query argument.
 *
 * NOT string concatenation, and the difference is load-bearing. A site without
 * pretty permalinks gets a `restUrl` that is already a query string —
 * `https://example.org/index.php?rest_route=/gll-info/v1/` — so appending
 * `url-cache?url=…` produces a second `?` and the argument is silently lost.
 * The attachment route never noticed, because its identifier is a path segment.
 *
 * @param {string} route Route below the namespace, e.g. `url-cache`.
 * @param {string} name  Query argument name.
 * @param {string} value Query argument value.
 * @return {string} Endpoint URL.
 */
export function routeWithArg(
	route: string,
	name: string,
	value: string
): string {
	const base = `${ restBase() }${ route }`;
	const separator = base.includes( '?' ) ? '&' : '?';

	return `${ base }${ separator }${ name }=${ encodeURIComponent( value ) }`;
}

/**
 * Headers that authenticate a write.
 *
 * The nonce is only localized onto editor scripts, so a view script calling this
 * gets a plain content type and a request the server will refuse — which is the
 * intended outcome, since no view script writes.
 *
 * @return {Object} Request headers.
 */
export function writeHeaders(): Record< string, string > {
	const headers: Record< string, string > = {
		'Content-Type': 'application/json',
	};

	const nonce = window.gllInfoSettings?.nonce;
	if ( nonce ) {
		headers[ 'X-WP-Nonce' ] = nonce;
	}

	return headers;
}
