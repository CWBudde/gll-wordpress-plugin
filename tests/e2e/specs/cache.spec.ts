/**
 * The cached display subset, end to end, in a real browser.
 *
 * This is the only place the payoff of Phase 13.4.1 can actually be observed:
 * that a published page renders the overview without ever requesting the 4.2 MB
 * `gll.wasm`. Every other suite can assert that the subset is correct, or that
 * the routes behave; none of them can assert that a browser did not download
 * something.
 *
 * The other specs deliberately do NOT set `fileId` on their blocks, so they
 * still exercise the parse-in-the-browser path. This one sets it, which is what
 * turns the cache on for a block.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

const SYSTEM_LABEL = 'Example Visualisation';
const MANUFACTURER = 'ExampleCo';

let fileUrl = '';
let fileId = 0;

test.describe( 'cached display subset', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		const media = await requestUtils.uploadMedia( FIXTURE );
		fileUrl = media.source_url;
		fileId = media.id;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Collect the status of every `gll.wasm` response on a page.
	 *
	 * @param {Page} page Page under test.
	 * @return {number[]} Statuses, appended as they arrive.
	 */
	function watchWasm( page: Page ) {
		const statuses: number[] = [];
		page.on( 'response', ( response ) => {
			if ( response.url().endsWith( 'gll.wasm' ) ) {
				statuses.push( response.status() );
			}
		} );
		return statuses;
	}

	/**
	 * The cache endpoint for the uploaded fixture.
	 *
	 * `?rest_route=` rather than `/wp-json/`, so this does not depend on how the
	 * test site's permalinks happen to be configured.
	 *
	 * @return {string} Endpoint path.
	 */
	function cacheRoute() {
		return `/?rest_route=/gll-info/v1/cache/${ fileId }`;
	}

	/**
	 * Publish a post carrying one cache-backed block, warming the cache first.
	 *
	 * Waiting for the endpoint to answer 200 before publishing is not just
	 * sequencing: it is the assertion that the editor's publisher ran. The
	 * editor parsed the file to draw its preview, reduced it, and POSTed it —
	 * with no server-side parser involved, which is the configuration most
	 * shared hosting is in.
	 *
	 * @param {Object} utils     Playwright fixtures.
	 * @param {string} blockName Block to insert.
	 * @return {Promise<number>} The published post ID.
	 */
	async function publishWarm(
		{ admin, editor, page }: any,
		blockName: string
	): Promise< number > {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: blockName,
			attributes: { fileUrl, fileId, fileName: 'sample.gll' },
		} );

		await expect
			.poll(
				async () => ( await page.request.get( cacheRoute() ) ).status(),
				{
					message:
						'the block editor should publish the parsed subset',
					timeout: 60000,
				}
			)
			.toBe( 200 );

		return editor.publishPost();
	}

	test( 'the editor publishes a subset that anyone may read', async ( {
		admin,
		editor,
		page,
	} ) => {
		await publishWarm( { admin, editor, page }, 'gll-info/gll-info' );

		const response = await page.request.get( cacheRoute() );
		const subset = await response.json();

		expect( subset.GenSystem.Label ).toBe( SYSTEM_LABEL );
		expect( subset.Version ).toBe( 1 );

		// The payload guards, observed from outside: what the visitor downloads
		// carries no response spectra and no embedded files.
		expect( JSON.stringify( subset ) ).not.toContain( 'data:' );
		expect(
			subset.Database.SourceDefinitions[ 0 ].Responses
		).toBeUndefined();
		expect( subset.Database.SourceDefinitions[ 0 ].ResponseCount ).toBe(
			19
		);
	} );

	test( 'a warm page renders without downloading the parser', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await publishWarm(
			{ admin, editor, page },
			'gll-info/gll-info'
		);

		const wasm = watchWasm( page );
		await page.goto( `/?p=${ postId }` );

		const block = page.locator( '.gll-info-block' ).first();

		// The positive assertion comes first and is not optional. An assertion
		// that a request is ABSENT passes just as well against a block that
		// never rendered at all, which is precisely how this test would rot.
		await expect(
			block.getByRole( 'cell', { name: SYSTEM_LABEL } )
		).toBeVisible();
		await expect(
			block.getByRole( 'cell', { name: MANUFACTURER } )
		).toBeVisible();
		await expect( block.getByRole( 'status' ) ).toHaveText( SYSTEM_LABEL );

		// And the response summary, which is rendered from `ResponseCount`
		// rather than from the array the subset dropped.
		await expect( page.locator( '.gll-source-responses' ) ).toHaveText(
			'19 responses'
		);

		expect(
			wasm,
			'a warm page must not download the 4.2 MB parser'
		).toHaveLength( 0 );
	} );

	test( 'a cold page falls back to parsing and renders the same thing', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		const postId = await publishWarm(
			{ admin, editor, page },
			'gll-info/gll-info'
		);

		await requestUtils.rest( {
			method: 'DELETE',
			path: `/gll-info/v1/cache/${ fileId }`,
		} );
		expect( ( await page.request.get( cacheRoute() ) ).status() ).toBe(
			404
		);

		const wasm = watchWasm( page );
		await page.goto( `/?p=${ postId }` );

		const block = page.locator( '.gll-info-block' ).first();

		// Identical output, by a different route. This is the fallback that
		// keeps the plugin working on a host with no server-side parser and a
		// file nobody has opened in the editor.
		await expect(
			block.getByRole( 'cell', { name: SYSTEM_LABEL } )
		).toBeVisible();
		await expect( page.locator( '.gll-source-responses' ) ).toHaveText(
			'19 responses'
		);

		expect(
			wasm,
			'a cold page must fall back to the parser'
		).not.toHaveLength( 0 );
		expect( wasm ).not.toContain( 404 );
	} );

	test( 'the config block is served from the same cache', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await publishWarm(
			{ admin, editor, page },
			'gll-info/config'
		);

		const wasm = watchWasm( page );
		await page.goto( `/?p=${ postId }` );

		// The fixture carries one box type and no frames, limits, warnings or
		// filter groups, so the box card is what proves the render happened.
		await expect(
			page.locator( '.gll-config-block' ).first()
		).toContainText( 'Test Cabinet' );

		expect( wasm ).toHaveLength( 0 );
	} );

	test( 'an author can overwrite the stored subset', async ( {
		admin,
		editor,
		page,
		requestUtils,
	} ) => {
		// The write path through a real HTTP stack, cookies and nonce included.
		// Hash-based invalidation — the case where the FILE changes rather than
		// the payload — is covered in `tests/php/GLL_Cache_Test.php`, which can
		// rewrite the bytes on disk directly.
		await publishWarm( { admin, editor, page }, 'gll-info/gll-info' );

		expect( ( await page.request.get( cacheRoute() ) ).status() ).toBe(
			200
		);

		await requestUtils.rest( {
			method: 'POST',
			path: `/gll-info/v1/cache/${ fileId }`,
			data: { data: { Version: 1, Database: {} } },
		} );

		const subset = await ( await page.request.get( cacheRoute() ) ).json();
		expect( subset.Database.SourceDefinitions ).toBeUndefined();
	} );

	test( 'the write routes are closed to anonymous callers', async ( {
		page,
	} ) => {
		// `page.request` carries the admin storage state, so a genuinely
		// unauthenticated client is needed to make this mean anything.
		const anonymous = await page.context().browser()?.newContext();
		const request = anonymous!.request;

		const post = await request.post(
			`http://localhost:8889/?rest_route=/gll-info/v1/cache/${ fileId }`,
			{ data: { data: { Version: 1, Database: {} } } }
		);
		expect( post.status() ).toBe( 401 );

		const remove = await request.delete(
			`http://localhost:8889/?rest_route=/gll-info/v1/cache/${ fileId }`
		);
		expect( remove.status() ).toBe( 401 );

		await anonymous!.close();
	} );
} );
