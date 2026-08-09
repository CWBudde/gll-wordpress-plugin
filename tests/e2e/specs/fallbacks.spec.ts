/**
 * Capability fallbacks, and an axe-core pass.
 *
 * The fallback specs are the only honest way to cover PLAN.md's "test fallback
 * for older browsers". An old browser cannot be obtained, and faking one with a
 * user-agent string tests nothing — the code branches on feature detection, so
 * the features are what have to be removed. `addInitScript` runs before any
 * page script, which is the only point at which that is possible.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import AxeBuilder from '@axe-core/playwright';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

let fileUrl = '';

/**
 * Publish a post carrying one block pointed at the fixture.
 *
 * @param {Object} utils     Playwright fixtures.
 * @param {string} blockName Block to insert.
 * @return {Promise<number>} The published post ID.
 */
async function publish(
	{ admin, editor }: any,
	blockName: string
): Promise< number > {
	await admin.createNewPost();
	await editor.insertBlock( {
		name: blockName,
		attributes: { fileUrl, fileName: 'sample.gll' },
	} );
	return editor.publishPost();
}

test.describe( 'capability fallbacks', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		const media = await requestUtils.uploadMedia( FIXTURE );
		fileUrl = media.source_url;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		await requestUtils.deleteAllPosts();
	} );

	test( 'says so when WebAssembly is unavailable', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await publish(
			{ admin, editor },
			'gll-info/polar-plot'
		);

		await page.addInitScript( () => {
			// The branch under test is `typeof WebAssembly === 'undefined'`.
			delete ( window as any ).WebAssembly;
		} );
		await page.goto( `/?p=${ postId }` );

		const block = page.locator( '.gll-polar-plot-block' );
		// An error panel, not a silent blank or a spinner that never stops.
		await expect( block.getByRole( 'alert' ) ).toBeVisible();
	} );

	test( 'says so when WebGL is unavailable @webgl', async ( {
		admin,
		editor,
		page,
	} ) => {
		const postId = await publish(
			{ admin, editor },
			'gll-info/balloon-3d'
		);

		await page.addInitScript( () => {
			const original = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (
				type: string,
				...rest: any[]
			) {
				if (
					type === 'webgl' ||
					type === 'webgl2' ||
					type === 'experimental-webgl'
				) {
					return null;
				}
				return ( original as any ).call( this, type, ...rest );
			} as any;
		} );
		await page.goto( `/?p=${ postId }` );

		const block = page.locator( '.gll-balloon-3d-block' );
		await expect( block.getByRole( 'alert' ) ).toBeVisible();
		await expect( block.getByRole( 'alert' ) ).toContainText( /WebGL/i );
	} );

	test( 'still renders charts without WebGL', async ( {
		admin,
		editor,
		page,
	} ) => {
		// The 2D blocks must not be collateral damage of a missing 3D context.
		const postId = await publish(
			{ admin, editor },
			'gll-info/frequency-response'
		);

		await page.addInitScript( () => {
			const original = HTMLCanvasElement.prototype.getContext;
			HTMLCanvasElement.prototype.getContext = function (
				type: string,
				...rest: any[]
			) {
				if ( type === 'webgl' || type === 'webgl2' ) {
					return null;
				}
				return ( original as any ).call( this, type, ...rest );
			} as any;
		} );
		await page.goto( `/?p=${ postId }` );

		await expect(
			page.locator( '.gll-frequency-response-block canvas' )
		).toBeVisible();
	} );
} );

test.describe( 'accessibility', () => {
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
	 * axe is not a screen reader.
	 *
	 * It finds missing labels, contrast failures, bad roles and orphaned
	 * aria-describedby references — a real but strictly smaller set than
	 * Task 11.4 asked for. It cannot say whether the geometry canvas
	 * description is *useful*, whether the live-region announcements arrive in
	 * a sensible order, or whether the 3D blocks are navigable at all. Those
	 * still need NVDA, JAWS or VoiceOver and a human, so Task 11.4 stays open.
	 */
	for ( const blockName of [
		'gll-info/gll-info',
		'gll-info/frequency-response',
		'gll-info/polar-plot',
		'gll-info/config',
	] ) {
		test( `${ blockName } has no serious axe violations`, async ( {
			admin,
			editor,
			page,
		} ) => {
			const postId = await publish( { admin, editor }, blockName );
			await page.goto( `/?p=${ postId }` );

			// Wait for hydration to actually finish. The block root ships in
			// save() output, so it is visible before any parsing starts —
			// asserting on it and then sleeping would let a slower runner scan
			// the loading state and report a clean bill of health for a
			// spinner. The spinner disappearing is the real signal.
			const block = page
				.locator( '[class*="gll-"][class*="-block"]' )
				.first();
			await expect( block ).toBeVisible();
			// Hidden rather than absent: the views set `display: none` on the
			// loading container instead of removing it, so the spinner stays in
			// the DOM. `toBeHidden` is true for either, so this keeps working
			// if that ever changes.
			await expect( block.locator( '.gll-spinner' ) ).toBeHidden();

			// And hydration must have succeeded: an error panel would other-
			// wise be scanned instead of the content, and pass easily.
			await expect( block.getByRole( 'alert' ) ).toHaveCount( 0 );

			const results = await new AxeBuilder( { page } )
				// Scoped to the block. Gutenberg's own theme markup has its own
				// violations, which this plugin cannot fix and which change
				// with every WordPress release.
				.include( '[class*="gll-"][class*="-block"]' )
				.withTags( [ 'wcag2a', 'wcag2aa' ] )
				.analyze();

			const serious = results.violations.filter( ( violation ) =>
				[ 'serious', 'critical' ].includes( violation.impact || '' )
			);

			expect(
				serious.map( ( violation ) => ( {
					id: violation.id,
					impact: violation.impact,
					nodes: violation.nodes.map( ( node ) => node.html ),
				} ) )
			).toEqual( [] );
		} );
	}
} );
