/**
 * WASM settings must reach a block wherever the block is delivered from.
 *
 * `gll_info_enqueue_frontend_assets()` used to gate on `has_block()`, which
 * inspects only the main post content. A GLL block reached through a reusable
 * block or a template part therefore got no `gllInfoSettings` and no script
 * translations, while its own view script was still enqueued by the renderer —
 * so `view.js` ran against wasm-loader's hardcoded
 * `/wp-content/plugins/gll-info/assets/wasm/...` fallback.
 *
 * That fallback is why nobody hit this: it is correct on a stock install, and
 * this test site is deliberately mounted at the `gll-info` slug so the normal
 * suites keep exercising the path a real install takes. Asserting the *presence*
 * of `window.gllInfoSettings` rather than a working parse is the point — the
 * settings object is the thing that was missing, and the only thing that makes
 * the plugin survive a renamed directory, a subdirectory install, non-root
 * multisite or a `WP_PLUGIN_URL` override.
 *
 * The blocks are written as pre-serialized markup rather than inserted through
 * the editor because both delivery paths store content that the editor would
 * not author for us, and because a block whose `save()` returns null renders
 * empty — and since WordPress 6.9 an empty render has its enqueues undone.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

let fileUrl = '';

/**
 * Serialized markup for a GLL block that renders something.
 *
 * @param {string} blockName Fully qualified block name.
 * @return {string} Serialized block markup.
 */
function renderedBlock( blockName: string ): string {
	const className = blockName.replace( '/', '-' );

	return (
		`<!-- wp:${ blockName } {"fileUrl":"${ fileUrl }","fileName":"sample.gll"} -->` +
		`<div class="wp-block-${ className } gll-info-block" data-file-url="${ fileUrl }" data-file-name="sample.gll"></div>` +
		`<!-- /wp:${ blockName } -->`
	);
}

test.describe( 'frontend asset delivery', () => {
	test.beforeAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		const media = await requestUtils.uploadMedia( FIXTURE );
		fileUrl = media.source_url;
	} );

	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
		await requestUtils.deleteAllPosts();
	} );

	test( 'a block inside a reusable block still receives the settings', async ( {
		requestUtils,
		page,
	} ) => {
		const reusable = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/blocks',
			data: {
				title: 'GLL reusable',
				status: 'publish',
				content: renderedBlock( 'gll-info/polar-plot' ),
			},
		} );

		const post = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/posts',
			data: {
				title: 'Reusable delivery',
				status: 'publish',
				// The post content names core/block only. This is exactly what
				// has_block() could not see through.
				content: `<!-- wp:block {"ref":${ reusable.id }} /-->`,
			},
		} );

		await page.goto( `/?p=${ post.id }` );

		const settings = await page.evaluate(
			() => ( window as any ).gllInfoSettings
		);

		expect( settings, 'gllInfoSettings was not printed' ).toBeTruthy();
		expect( settings.wasmUrl ).toContain( 'assets/wasm/gll.wasm' );
		expect( settings.wasmExecUrl ).toContain( 'assets/wasm/wasm_exec.js' );
	} );

	test( 'a block inside a template part still receives the settings', async ( {
		requestUtils,
		page,
	} ) => {
		const templatePart = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/template-parts',
			data: {
				slug: 'gll-asset-delivery',
				title: 'GLL asset delivery',
				area: 'uncategorized',
				content: renderedBlock( 'gll-info/gll-info' ),
			},
		} );

		const post = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/posts',
			data: {
				title: 'Template part delivery',
				status: 'publish',
				content: `<!-- wp:template-part {"slug":"${ templatePart.slug }","theme":"${ templatePart.theme }"} /-->`,
			},
		} );

		await page.goto( `/?p=${ post.id }` );

		const settings = await page.evaluate(
			() => ( window as any ).gllInfoSettings
		);

		expect( settings, 'gllInfoSettings was not printed' ).toBeTruthy();
		expect( settings.wasmUrl ).toContain( 'assets/wasm/gll.wasm' );
	} );

	test( 'a page with no GLL block loads none of the runtime', async ( {
		requestUtils,
		page,
	} ) => {
		const post = await requestUtils.rest( {
			method: 'POST',
			path: '/wp/v2/posts',
			data: {
				title: 'No GLL here',
				status: 'publish',
				content:
					'<!-- wp:paragraph --><p>Nothing here.</p><!-- /wp:paragraph -->',
			},
		} );

		await page.goto( `/?p=${ post.id }` );

		// The property the has_block() gate was bought to provide, and the one
		// its removal most plausibly breaks: no GLL block means no 4.2 MB of
		// WASM plumbing anywhere on the site.
		const settings = await page.evaluate(
			() => ( window as any ).gllInfoSettings
		);
		expect( settings ).toBeFalsy();

		const runtimeTags = await page
			.locator( 'script[src*="wasm_exec.js"]' )
			.count();
		expect( runtimeTags ).toBe( 0 );
	} );
} );
