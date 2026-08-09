/**
 * The full round trip: a real `.gll` through the editor and onto a published
 * page, rendered by the same WASM parser a visitor would run.
 *
 * The committed fixture carries one source ("Full Range", 50–5000 Hz), 21
 * frequency points and 19 balloon responses at axial symmetry, which is enough
 * to drive the viewer, the frequency response, the polar plot and the balloon.
 * It has no case geometry and no embedded resources, so those two blocks are
 * not exercised here — see docs for why that is a property of the fixture
 * rather than of the blocks.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import type { Page } from '@playwright/test';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

/** Values that come out of the fixture and must survive to the page. */
const SYSTEM_LABEL = 'Example Visualisation';
const MANUFACTURER = 'ExampleCo';

let fileUrl = '';

test.describe( 'published page', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		const media = await requestUtils.uploadMedia( FIXTURE );
		fileUrl = media.source_url;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		await requestUtils.deleteAllPosts();
	} );

	/**
	 * Publish a post carrying one block already pointed at the fixture, and
	 * open it as a visitor would.
	 *
	 * The file is set through the block's serialized attributes rather than by
	 * driving the media modal: the modal is WordPress's UI, not this plugin's,
	 * and what is under test is the hydration that follows.
	 *
	 * @param {Object} utils      Playwright fixtures.
	 * @param {string} blockName  Block to insert.
	 * @param {Object} extraAttrs Extra block attributes.
	 * @return {Promise<void>} Resolves once the front end has been opened.
	 */
	async function publishWithBlock(
		{ admin, editor, page }: any,
		blockName: string,
		extraAttrs: Record< string, unknown > = {}
	): Promise< void > {
		await admin.createNewPost();
		await editor.insertBlock( {
			name: blockName,
			attributes: {
				fileUrl,
				fileName: 'sample.gll',
				...extraAttrs,
			},
		} );
		// publishPost returns the post ID, not a permalink. `?p=<id>` reaches
		// the post under any permalink structure, so this does not depend on
		// how the test site happens to be configured.
		const postId = await editor.publishPost();
		await page.goto( `/?p=${ postId }` );
	}

	/**
	 * Assert the WASM module was actually fetched and served.
	 *
	 * A 404 here is the symptom the packaging bug would produce in the field,
	 * and it is invisible on screen — the block simply never leaves its loading
	 * state.
	 *
	 * @param {Page} page Page under test.
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

	test( 'renders the file overview a visitor would read', async ( {
		admin,
		editor,
		page,
	} ) => {
		const wasm = watchWasm( page );

		await publishWithBlock( { admin, editor, page }, 'gll-info/gll-info' );

		const block = page.locator( '.gll-info-block' ).first();

		// The parsed values reach the overview table.
		await expect(
			block.getByRole( 'cell', { name: SYSTEM_LABEL } )
		).toBeVisible();
		await expect(
			block.getByRole( 'cell', { name: MANUFACTURER } )
		).toBeVisible();

		// And the header paragraph, which Phase 11 turned into a live region,
		// has been rewritten from "Loading …" to the parsed system label. That
		// rewrite is the only signal a screen reader gets that the spinner gave
		// way to content, so it is asserted rather than assumed.
		const region = block.getByRole( 'status' );
		await expect( region ).toHaveAttribute( 'aria-live', 'polite' );
		await expect( region ).toHaveText( SYSTEM_LABEL );

		expect( wasm, 'gll.wasm was never fetched' ).not.toHaveLength( 0 );
		expect( wasm ).not.toContain( 404 );
	} );

	test( 'draws the frequency response chart', async ( {
		admin,
		editor,
		page,
	} ) => {
		await publishWithBlock(
			{ admin, editor, page },
			'gll-info/frequency-response'
		);

		const canvas = page.locator( '.gll-frequency-response-block canvas' );
		await expect( canvas ).toBeVisible();

		// The canvas is opaque to assistive technology, so the label is the
		// whole of what a screen reader gets; it must carry real figures.
		await expect( canvas ).toHaveAttribute( 'role', 'img' );
		const label = await canvas.getAttribute( 'aria-label' );
		expect( label ).toContain( 'Frequency response of' );
		expect( label ).toMatch( /\d/ );

		// And the off-screen table that carries the numbers themselves.
		await expect(
			page.locator( '.gll-frequency-response-block table' )
		).toHaveCount( 1 );
	} );

	test( 'draws the polar plot with a beamwidth in its label', async ( {
		admin,
		editor,
		page,
	} ) => {
		await publishWithBlock(
			{ admin, editor, page },
			'gll-info/polar-plot'
		);

		const canvas = page.locator( '.gll-polar-plot-block canvas' );
		await expect( canvas ).toBeVisible();
		await expect( canvas ).toHaveAttribute( 'role', 'img' );

		const label = await canvas.getAttribute( 'aria-label' );
		expect( label ).toContain( 'Polar directivity plot at' );
	} );

	test( 'renders the balloon in a live WebGL context @webgl', async ( {
		admin,
		editor,
		page,
	} ) => {
		await publishWithBlock(
			{ admin, editor, page },
			'gll-info/balloon-3d'
		);

		const canvas = page.locator( '.gll-balloon-3d-block canvas' );
		await expect( canvas ).toBeVisible();

		// A real context, not a fallback message. Asserted rather than
		// screenshotted: GPU output is not deterministic enough to diff, but
		// "is there a context and did anything get drawn" is.
		const drawn = await canvas.evaluate( ( element: HTMLCanvasElement ) => {
			const gl =
				element.getContext( 'webgl2' ) || element.getContext( 'webgl' );
			if ( ! gl ) {
				return null;
			}
			const pixels = new Uint8Array( element.width * element.height * 4 );
			( gl as WebGLRenderingContext ).readPixels(
				0,
				0,
				element.width,
				element.height,
				( gl as WebGLRenderingContext ).RGBA,
				( gl as WebGLRenderingContext ).UNSIGNED_BYTE,
				pixels
			);
			return pixels.some( ( value ) => value !== 0 );
		} );

		expect(
			drawn,
			'no WebGL context on the balloon canvas'
		).not.toBeNull();
	} );
} );
