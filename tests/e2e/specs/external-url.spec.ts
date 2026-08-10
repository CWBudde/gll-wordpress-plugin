/**
 * A GLL file that does not live in this site's media library, end to end.
 *
 * wp-env hands this suite a genuine cross-origin case for free: the site is
 * served from `http://localhost:8889`, and the very same upload is reachable at
 * `http://127.0.0.1:8889/...`. To a browser those are different origins, and the
 * PHP built-in server behind wp-env sends no `Access-Control-Allow-Origin`, so a
 * fetch of the second address from a page on the first is blocked exactly the
 * way a file on a stranger's CDN would be. No extra infrastructure, and no
 * pretending.
 *
 * The most valuable assertion here is the cheapest one: that inserting a block
 * with an external address produces no "unexpected or invalid content" notice.
 * That is the whole no-new-attribute decision — external files reuse `fileUrl`
 * with `fileId` left at 0, so `save()` output is unchanged and no block needed a
 * frozen `deprecated` copy.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

const SYSTEM_LABEL = 'Example Visualisation';

let sameOriginUrl = '';
let crossOriginUrl = '';

test.describe( 'a file hosted somewhere else', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		const media = await requestUtils.uploadMedia( FIXTURE );

		sameOriginUrl = media.source_url;
		crossOriginUrl = sameOriginUrl.replace( 'localhost', '127.0.0.1' );
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * The URL cache endpoint for an address.
	 *
	 * `?rest_route=` rather than `/wp-json/`, so this does not depend on how the
	 * test site's permalinks happen to be configured.
	 *
	 * @param {string} url The file's address.
	 * @return {string} Endpoint path.
	 */
	function urlCacheRoute( url: string ) {
		return `/?rest_route=/gll-info/v1/url-cache&url=${ encodeURIComponent(
			url
		) }`;
	}

	test( 'an external address needs no deprecation', async ( {
		admin,
		editor,
	} ) => {
		await admin.createNewPost();

		for ( const name of [ 'gll-info/gll-info', 'gll-info/geometry' ] ) {
			await editor.insertBlock( {
				name,
				// No `fileId`: this is what an external file looks like, and the
				// saved markup is the same shape a media library file produces
				// — which is exactly why no block needed a new deprecation.
				attributes: { fileUrl: crossOriginUrl, fileName: 'sample.gll' },
			} );

			await expect(
				editor.canvas.locator( `[data-type="${ name }"]` )
			).toBeVisible();
		}

		await expect(
			editor.canvas.getByText(
				'This block contains unexpected or invalid content'
			)
		).toHaveCount( 0 );
	} );

	test( 'the editor warms the stored summary for an external address', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'gll-info/gll-info',
			// Same origin here: the point of this test is the cache write, not
			// the fetch, and a same-origin address reaches the parser without
			// depending on whether the proxy is switched on.
			attributes: { fileUrl: sameOriginUrl, fileName: 'sample.gll' },
		} );

		await expect
			.poll(
				async () =>
					(
						await page.request.get( urlCacheRoute( sameOriginUrl ) )
					).status(),
				{
					message:
						'the block editor should publish the parsed subset against the address',
					timeout: 60000,
				}
			)
			.toBe( 200 );

		const subset = await (
			await page.request.get( urlCacheRoute( sameOriginUrl ) )
		).json();

		expect( subset.GenSystem.Label ).toBe( SYSTEM_LABEL );
	} );

	test( 'a visitor is served the stored summary of an external file', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'gll-info/gll-info',
			attributes: { fileUrl: sameOriginUrl, fileName: 'sample.gll' },
		} );

		await expect
			.poll(
				async () =>
					(
						await page.request.get( urlCacheRoute( sameOriginUrl ) )
					).status(),
				{ timeout: 60000 }
			)
			.toBe( 200 );

		const postId = await editor.publishPost();

		const wasmRequests: string[] = [];
		page.on( 'response', ( response ) => {
			if ( response.url().endsWith( 'gll.wasm' ) ) {
				wasmRequests.push( response.url() );
			}
		} );

		await page.goto( `/?p=${ postId }` );
		await expect( page.locator( '.gll-info-block' ).first() ).toContainText(
			SYSTEM_LABEL,
			{ timeout: 30000 }
		);

		// The whole point of the tier: a block pointed at an address on another
		// server still renders without the visitor downloading the parser.
		expect( wasmRequests ).toEqual( [] );
	} );

	test( 'a blocked cross-origin file reports something a reader can act on', async ( {
		admin,
		editor,
		page,
	} ) => {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: 'gll-info/geometry',
			// A measurement block, which has no stored summary to fall back on:
			// its visitors see the failure, and the message has to name the site
			// that refused rather than print a bare TypeError.
			attributes: { fileUrl: crossOriginUrl, fileName: 'sample.gll' },
		} );

		const postId = await editor.publishPost();

		await page.goto( `/?p=${ postId }` );

		await expect( page.locator( '.gll-error' ).first() ).toContainText(
			'127.0.0.1',
			{ timeout: 30000 }
		);
	} );
} );
