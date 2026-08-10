/**
 * What an author is allowed to type into the address field, and what a visitor
 * is told when it does not work.
 *
 * The distinction between an error and a warning is the part worth pinning. An
 * error is a claim that the address is *certain* to fail — a plain-http file on
 * an https site is blocked by every browser alive — and refusing it saves the
 * author discovering that after publishing. A warning is a suspicion, and the
 * suspicion this file holds (an address that does not end in `.gll`) is wrong
 * often enough that blocking on it would break signed CDN links and download
 * handlers, which routinely have no extension at all.
 *
 * @package
 */

import {
	describeFetchFailure,
	fileNameFromUrl,
	isExternalUrl,
	isSafeFileUrl,
	validateGllUrl,
} from './file-source';

const HTTPS_PAGE = { protocol: 'https:', origin: 'https://example.org' };
const HTTP_PAGE = { protocol: 'http:', origin: 'http://example.org' };

describe( 'validateGllUrl', () => {
	it.each( [
		[ 'https://cdn.example/speaker.gll', 'ok' ],
		[ 'https://cdn.example/SPEAKER.GLL', 'ok' ],
		[ 'https://cdn.example/a/b/speaker.gll?sig=abc123', 'ok' ],
	] )( 'accepts %s', ( url, code ) => {
		expect( validateGllUrl( url, HTTPS_PAGE ).code ).toBe( code );
	} );

	it.each( [
		[ '', 'empty' ],
		[ '   ', 'empty' ],
		[ 'speaker.gll', 'not-a-url' ],
		[ '//cdn.example/speaker.gll', 'not-a-url' ],
		[ 'https://', 'not-a-url' ],
		[ 'javascript:alert(1)//speaker.gll', 'scheme' ],
		[ 'data:application/octet-stream,AAAA', 'scheme' ],
		[ 'ftp://cdn.example/speaker.gll', 'scheme' ],
		[ 'file:///etc/passwd', 'scheme' ],
		[ 'https://user:secret@cdn.example/speaker.gll', 'credentials' ],
	] )( 'refuses %s', ( url, code ) => {
		const check = validateGllUrl( url, HTTPS_PAGE );

		expect( check.level ).toBe( 'error' );
		expect( check.code ).toBe( code );
	} );

	it( 'refuses a plain-http address on a site served over https', () => {
		const check = validateGllUrl(
			'http://cdn.example/speaker.gll',
			HTTPS_PAGE
		);

		expect( check.level ).toBe( 'error' );
		expect( check.code ).toBe( 'mixed-content' );
	} );

	it( 'allows a plain-http address on a site served over http', () => {
		expect(
			validateGllUrl( 'http://cdn.example/speaker.gll', HTTP_PAGE ).code
		).toBe( 'ok' );
	} );

	it( 'warns about an address with no .gll ending, but allows it', () => {
		const check = validateGllUrl(
			'https://cdn.example/download?id=7',
			HTTPS_PAGE
		);

		expect( check.level ).toBe( 'warning' );
		expect( check.code ).toBe( 'no-extension' );
		expect( check.message ).not.toBe( '' );
	} );
} );

describe( 'isSafeFileUrl', () => {
	it.each( [
		'https://cdn.example/speaker.gll',
		'http://cdn.example/speaker.gll',
		'/wp-content/uploads/2026/08/speaker.gll',
	] )( 'passes %s', ( url ) => {
		expect( isSafeFileUrl( url ) ).toBe( true );
	} );

	it.each( [
		'',
		'   ',
		'javascript:alert(1)',
		'data:text/html,<script>',
		'file:///etc/passwd',
		'//evil.example/speaker.gll',
	] )( 'blocks %s', ( url ) => {
		expect( isSafeFileUrl( url ) ).toBe( false );
	} );
} );

describe( 'fileNameFromUrl', () => {
	it( 'takes the last path segment', () => {
		expect( fileNameFromUrl( 'https://cdn.example/a/b/speaker.gll' ) ).toBe(
			'speaker.gll'
		);
	} );

	it( 'ignores a query string and a trailing slash', () => {
		expect(
			fileNameFromUrl( 'https://cdn.example/a/speaker.gll?sig=1' )
		).toBe( 'speaker.gll' );
		expect( fileNameFromUrl( 'https://cdn.example/a/b/' ) ).toBe( 'b' );
	} );

	it( 'decodes an escaped name', () => {
		expect(
			fileNameFromUrl( 'https://cdn.example/My%20Speaker.gll' )
		).toBe( 'My Speaker.gll' );
	} );

	it( 'falls back to the host when there is no usable segment', () => {
		expect( fileNameFromUrl( 'https://cdn.example/?id=7' ) ).toBe(
			'cdn.example'
		);
	} );

	it( 'returns nothing for something that is not an address', () => {
		expect( fileNameFromUrl( 'speaker.gll' ) ).toBe( '' );
	} );
} );

describe( 'isExternalUrl', () => {
	it( 'is false for a file on this site', () => {
		expect(
			isExternalUrl(
				'https://example.org/uploads/speaker.gll',
				HTTPS_PAGE
			)
		).toBe( false );
	} );

	it( 'is true for a file anywhere else', () => {
		expect(
			isExternalUrl( 'https://cdn.example/speaker.gll', HTTPS_PAGE )
		).toBe( true );
	} );
} );

describe( 'describeFetchFailure', () => {
	it( 'quotes an HTTP status when there is one', () => {
		const message = describeFetchFailure(
			{ status: 404, statusText: 'Not Found' },
			'https://cdn.example/speaker.gll',
			HTTPS_PAGE
		);

		expect( message ).toContain( '404' );
		expect( message ).toContain( 'Not Found' );
	} );

	it( 'names the host when a cross-origin fetch failed with no status', () => {
		const message = describeFetchFailure(
			new TypeError( 'Failed to fetch' ),
			'https://cdn.example/speaker.gll',
			HTTPS_PAGE
		);

		expect( message ).toContain( 'cdn.example' );
		// The visitor cannot act on the mechanism, and the person who can is
		// reading the documentation.
		expect( message ).not.toMatch( /CORS|Access-Control/ );
	} );

	it( 'does not blame another website when the file is on this one', () => {
		const message = describeFetchFailure(
			new TypeError( 'Failed to fetch' ),
			'https://example.org/uploads/speaker.gll',
			HTTPS_PAGE
		);

		expect( message ).not.toContain( 'example.org' );
		expect( message ).toMatch( /moved or deleted/ );
	} );
} );
