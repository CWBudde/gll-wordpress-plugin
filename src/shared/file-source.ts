/**
 * Everything about *which file* a block shows, minus the UI.
 *
 * Deliberately free of React and of `@wordpress/url`. The frontend view scripts
 * import `isSafeFileUrl()` and `describeFetchFailure()` from here, and they are
 * plain modules on public pages: pulling `wp-url` in would put another script on
 * every page that renders a block, for two helpers that plain `URL` already
 * answers. The editor-side component may use `@wordpress/url` freely, and does.
 *
 * A block's file is expressed with the three attributes that have existed since
 * Phase 1, and the invariant between them is the whole of the external-file
 * feature:
 *
 *     fileId > 0                      → an attachment in this site's media library
 *     fileId === 0 && fileUrl !== ''  → a file on someone else's server
 *     fileUrl === ''                  → no file chosen
 *
 * No fourth attribute, and no change to what `save()` writes. `data-file-url`
 * already carries any URL and `data-file-id` already collapses 0 to an empty
 * string, so the frontend can already tell the two apart. Adding a `sourceMode`
 * or a cache key to the saved markup would mean seven frozen `deprecated` copies
 * and an edit to the geometry markup duplicated in `class-gll-patterns.php`, to
 * record something the existing attributes already say.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

/**
 * MIME types the media picker offers.
 *
 * The union of what the seven blocks used to ask for individually. Three of them
 * listed only `application/x-gll`, which makes a `.gll` stored as
 * `application/octet-stream` — anything uploaded before the plugin registered the
 * MIME type, or through a path where the browser sent no type — *invisible* in
 * their picker. An author with a working file in the library was told it was not
 * there. The union's cost is that other binaries are offered too, and picking one
 * produces a parse error the author sees at once. A loud failure beats a silent
 * omission.
 */
export const GLL_ALLOWED_TYPES = [
	'application/x-gll',
	'application/octet-stream',
];

export interface GllFileSource {
	fileId: number;
	fileUrl: string;
	fileName: string;
}

export interface UrlCheck {
	level: 'ok' | 'warning' | 'error';
	code: string;
	message: string;
}

/**
 * A server that answered, and said no.
 *
 * Lives here rather than in `gll-proxy.ts` because the view scripts need it too
 * and must not import that module. Carrying the status is what keeps a 404 from
 * being described as a parse failure or as a blocked cross-origin read — see
 * `describeFetchFailure()`, which branches on exactly this.
 */
export class HttpError extends Error {
	public status: number;

	public statusText: string;

	constructor( status: number, statusText: string, message?: string ) {
		super( message || `${ status } ${ statusText }` );
		this.name = 'HttpError';
		this.status = status;
		this.statusText = statusText;
	}
}

interface PageContext {
	protocol: string;
	origin: string;
}

/**
 * Where the page making the check lives.
 *
 * Injectable so the checks are testable without a jsdom navigation.
 *
 * @return {Object} Protocol and origin of the current page.
 */
function currentPage(): PageContext {
	if ( typeof window === 'undefined' || ! window.location ) {
		return { protocol: 'https:', origin: '' };
	}

	return {
		protocol: window.location.protocol,
		origin: window.location.origin,
	};
}

/**
 * Parse a URL, or return null.
 *
 * A host is required, which is what rejects `//cdn.example/x.gll` and a bare
 * file name. Schemes like `javascript:` and `data:` also parse without a host,
 * so callers that want to *name* the scheme in their message have to look before
 * calling this — see `validateGllUrl()`, which does.
 *
 * @param {string} raw Candidate URL.
 * @return {URL|null} Parsed URL, or null when it is not one.
 */
function parse( raw: string ): URL | null {
	try {
		const url = new URL( String( raw ).trim() );

		return url.host ? url : null;
	} catch ( error ) {
		return null;
	}
}

/**
 * The scheme of a string, whether or not it is a usable address.
 *
 * @param {string} raw Candidate URL.
 * @return {string} Scheme with its colon, or '' when there is none.
 */
function schemeOf( raw: string ): string {
	try {
		return new URL( String( raw ).trim() ).protocol;
	} catch ( error ) {
		return '';
	}
}

/**
 * Whether a URL is one a view script may fetch.
 *
 * The frontend guard, and the only validation `fileUrl` has ever had. Every view
 * used to `fetch( block.dataset.fileUrl )` with a value nothing had checked.
 * Deliberately narrow: a scheme test and nothing else. Site-relative URLs pass,
 * because that is what a media library attachment looks like on a site served
 * from a subdirectory.
 *
 * @param {string} raw Candidate URL.
 * @return {boolean} True when it may be fetched.
 */
export function isSafeFileUrl( raw ): boolean {
	const value = String( raw || '' ).trim();

	if ( ! value ) {
		return false;
	}

	// Relative to this site: no scheme to abuse.
	if ( value.startsWith( '/' ) && ! value.startsWith( '//' ) ) {
		return true;
	}

	const url = parse( value );

	return Boolean(
		url && ( url.protocol === 'http:' || url.protocol === 'https:' )
	);
}

/**
 * Check a URL an author has typed.
 *
 * Errors are refused outright; warnings are committed and explained. The
 * distinction is whether the address is *certain* to fail: an `http` file on an
 * `https` site is blocked by every browser alive, so refusing it saves the author
 * discovering that after publishing. A URL that does not end in `.gll` is only
 * suspicious — signed CDN links and download handlers routinely have no
 * extension — so it warns and proceeds.
 *
 * @param {string} raw  Candidate URL.
 * @param {Object} page Optional page context, for tests.
 * @return {Object} The verdict.
 */
export function validateGllUrl(
	raw,
	page: PageContext = currentPage()
): UrlCheck {
	const value = String( raw || '' ).trim();

	if ( ! value ) {
		return { level: 'error', code: 'empty', message: '' };
	}

	// Before the parse, so that a pasted `javascript:` or `data:` string — which
	// parses fine and simply has no host — is reported as the wrong *kind* of
	// address rather than as a malformed one.
	const scheme = schemeOf( value );

	if ( scheme && scheme !== 'http:' && scheme !== 'https:' ) {
		return {
			level: 'error',
			code: 'scheme',
			message: __(
				'Only web addresses starting with http:// or https:// can be used.',
				'gll-info'
			),
		};
	}

	const url = parse( value );

	if ( ! url ) {
		return {
			level: 'error',
			code: 'not-a-url',
			message: __(
				'Enter a full web address, starting with https://.',
				'gll-info'
			),
		};
	}

	if ( url.protocol !== 'http:' && url.protocol !== 'https:' ) {
		return {
			level: 'error',
			code: 'scheme',
			message: __(
				'Only web addresses starting with http:// or https:// can be used.',
				'gll-info'
			),
		};
	}

	if ( url.username || url.password ) {
		return {
			level: 'error',
			code: 'credentials',
			message: __(
				'Remove the user name and password from the address — they would be visible in the page.',
				'gll-info'
			),
		};
	}

	if ( url.protocol === 'http:' && page.protocol === 'https:' ) {
		return {
			level: 'error',
			code: 'mixed-content',
			message: __(
				'Your site is served over https, so browsers will block a file at an http address. Use an https address.',
				'gll-info'
			),
		};
	}

	if ( ! url.pathname.toLowerCase().endsWith( '.gll' ) ) {
		return {
			level: 'warning',
			code: 'no-extension',
			message: __(
				'This address does not end in .gll. That is allowed — some servers hide the file name — but check that it points at a GLL file.',
				'gll-info'
			),
		};
	}

	return { level: 'ok', code: 'ok', message: '' };
}

/**
 * Whether a URL points somewhere other than this site.
 *
 * @param {string} raw  Candidate URL.
 * @param {Object} page Optional page context, for tests.
 * @return {boolean} True when the URL is cross-origin.
 */
export function isExternalUrl(
	raw,
	page: PageContext = currentPage()
): boolean {
	const url = parse( String( raw || '' ) );

	if ( ! url ) {
		return false;
	}

	return Boolean( page.origin ) && url.origin !== page.origin;
}

/**
 * A file name to show for a URL.
 *
 * The saved `fileName` attribute feeds the block header, so an external file
 * needs one. The last path segment is what a human would call the file; a URL
 * with no usable segment falls back to the host, which at least says where the
 * file came from.
 *
 * @param {string} raw Candidate URL.
 * @return {string} A display name, possibly empty.
 */
export function fileNameFromUrl( raw ): string {
	const url = parse( String( raw || '' ) );

	if ( ! url ) {
		return '';
	}

	const segment = url.pathname.split( '/' ).filter( Boolean ).pop();

	if ( ! segment ) {
		return url.host;
	}

	try {
		return decodeURIComponent( segment );
	} catch ( error ) {
		return segment;
	}
}

/**
 * What to tell a visitor when a file could not be fetched.
 *
 * Three outcomes, and keeping them apart is the whole job:
 *
 * - **A status** — the server answered, and said no. Quote it.
 * - **A `TypeError`** — `fetch` never completed. It reports a blocked
 *   cross-origin read and a dead network identically, so the origin of the URL
 *   is the only signal left, and it is enough to be useful without being a
 *   guess: a cross-origin failure with no status is overwhelmingly a missing
 *   `Access-Control-Allow-Origin`, and a same-origin one is not.
 * - **Anything else** — the bytes arrived and the parser rejected them. Saying
 *   the host refused access would be a false accusation about a website that did
 *   nothing wrong, so this branch carries the parser's own words instead.
 *
 * The words "CORS" and "Access-Control-Allow-Origin" never appear here. A visitor
 * cannot act on either; the person who can is reading the documentation.
 *
 * @param {*}      error What the fetch threw.
 * @param {string} url   The URL that failed.
 * @param {Object} page  Optional page context, for tests.
 * @return {string} A sentence for the error panel.
 */
export function describeFetchFailure(
	error,
	url,
	page: PageContext = currentPage()
): string {
	const status =
		error && typeof error === 'object' ? ( error as any ).status : null;

	if ( status ) {
		return sprintf(
			/* translators: 1: HTTP status code, e.g. 404. 2: HTTP status text. */
			__( 'The GLL file could not be loaded. %1$d %2$s', 'gll-info' ),
			status,
			( error as any ).statusText || ''
		).trim();
	}

	// ONLY A `TypeError` MEANS THE REQUEST NEVER COMPLETED. That is what `fetch`
	// throws for a blocked cross-origin read, a dead network or a reset
	// connection, and it is the only case where blaming the host is warranted. A
	// file that downloaded perfectly and then failed to parse arrives here as an
	// ordinary `Error`, and telling its reader that the website refused access
	// would be plainly false.
	if ( error instanceof TypeError ) {
		if ( isExternalUrl( url, page ) ) {
			const host = parse( String( url ) )?.host || '';

			return sprintf(
				/* translators: %s: host name of the site the file is on. */
				__(
					'This file could not be loaded from %s. The website hosting it does not allow other websites to read it.',
					'gll-info'
				),
				host
			);
		}

		return __(
			'This file could not be downloaded. It may have been moved or deleted.',
			'gll-info'
		);
	}

	// Everything else is the parser talking. Its text is not translatable — it
	// comes out of WASM already formatted — but it is the only thing that says
	// what is actually wrong with the file.
	const detail = error ? ( error as Error ).message : '';

	return detail
		? sprintf(
				/* translators: %s: the parser's description of what went wrong. */
				__( 'This GLL file could not be read. %s', 'gll-info' ),
				detail
		  )
		: __( 'This GLL file could not be read.', 'gll-info' );
}
