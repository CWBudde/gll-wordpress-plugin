/**
 * Tests for the shared HTML escaper.
 *
 * This function is the only thing standing between a GLL file's text fields and
 * the `innerHTML` assignments in the view scripts, so its contract is worth
 * pinning precisely — including the part of the contract it does *not* cover.
 *
 * @package
 */

import escapeHtmlDefault, { escapeHtml } from './escape-html';

describe( 'escapeHtml', () => {
	it( 'escapes the three characters that can open a tag or an entity', () => {
		expect( escapeHtml( '&' ) ).toBe( '&amp;' );
		expect( escapeHtml( '<' ) ).toBe( '&lt;' );
		expect( escapeHtml( '>' ) ).toBe( '&gt;' );
	} );

	it( 'escapes the ampersand before the angle brackets', () => {
		// If the order were reversed, "&lt;" in the input would come back as a
		// literal "<" and the escaping would be worse than useless.
		expect( escapeHtml( '&lt;' ) ).toBe( '&amp;lt;' );
	} );

	/**
	 * The `textContent` -> `innerHTML` round trip is a text-node serializer, and
	 * text nodes have no reason to escape quotes. That makes the output safe for
	 * *element content* and unsafe for an *unquoted or quoted attribute value*.
	 *
	 * No caller interpolates it into an attribute today. This test exists so
	 * that if someone ever writes `title="${ escapeHtml( label ) }"`, the
	 * assumption they made is already written down and demonstrably false.
	 */
	it( 'does NOT escape quotes, so callers must not use it in attributes', () => {
		expect( escapeHtml( '"' ) ).toBe( '"' );
		expect( escapeHtml( "'" ) ).toBe( "'" );
		expect( escapeHtml( 'a" onmouseover="alert(1)' ) ).toBe(
			'a" onmouseover="alert(1)'
		);
	} );

	it( 'neutralizes markup when the result is assigned with innerHTML', () => {
		const host = document.createElement( 'div' );
		host.innerHTML = escapeHtml( '<img src=x onerror=alert(1)>' );

		expect( host.querySelectorAll( '*' ) ).toHaveLength( 0 );
		expect( host.textContent ).toBe( '<img src=x onerror=alert(1)>' );
	} );

	it( 'neutralizes a script element', () => {
		const host = document.createElement( 'div' );
		host.innerHTML = `<span>${ escapeHtml(
			'</span><script>alert(1)</script>'
		) }</span>`;

		expect( host.querySelector( 'script' ) ).toBeNull();
		expect( host.querySelectorAll( 'span' ) ).toHaveLength( 1 );
	} );

	/**
	 * The divergence from the copy that used to live in `gll-info/view.ts`,
	 * which assigned `textContent` directly and so rendered the literal string
	 * "undefined" for a missing field.
	 */
	it( 'renders nothing for null and undefined', () => {
		expect( escapeHtml( null ) ).toBe( '' );
		expect( escapeHtml( undefined ) ).toBe( '' );
	} );

	it( 'coerces non-strings rather than throwing', () => {
		expect( escapeHtml( 0 ) ).toBe( '0' );
		expect( escapeHtml( false ) ).toBe( 'false' );
		expect( escapeHtml( 12.5 ) ).toBe( '12.5' );
		expect( escapeHtml( NaN ) ).toBe( 'NaN' );
		expect( escapeHtml( [ 1, 2 ] ) ).toBe( '1,2' );
	} );

	it( 'leaves ordinary text untouched, including non-ASCII', () => {
		expect( escapeHtml( 'Coda Audio G-Series' ) ).toBe(
			'Coda Audio G-Series'
		);
		expect( escapeHtml( '±180° / 90 Hz' ) ).toBe( '±180° / 90 Hz' );
	} );

	it( 'exports the same function as the default export', () => {
		expect( escapeHtmlDefault ).toBe( escapeHtml );
	} );
} );
