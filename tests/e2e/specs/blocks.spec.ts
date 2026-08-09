/**
 * Inserting every block and every pattern in the editor.
 *
 * Broad and cheap. The pattern spec is the highest-yield regression guard in
 * the suite: `includes/class-gll-patterns.php` carries the geometry block's
 * save() markup verbatim as a PHP string, because that block's save() returns
 * markup rather than null and a bare block comment would fail validation. A
 * renamed class or a reordered attribute there breaks every shipped pattern,
 * and nothing else notices.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';

const BLOCKS = [
	'gll-info/gll-info',
	'gll-info/frequency-response',
	'gll-info/polar-plot',
	'gll-info/balloon-3d',
	'gll-info/geometry',
	'gll-info/resources',
	'gll-info/config',
];

const PATTERNS = [
	'Full GLL Viewer',
	'Quick GLL Overview',
	'GLL Acoustic Analysis',
];

test.describe( 'editor insertion', () => {
	test.beforeEach( async ( { admin } ) => {
		await admin.createNewPost();
	} );

	for ( const name of BLOCKS ) {
		test( `inserts ${ name } without console errors`, async ( {
			editor,
			page,
		} ) => {
			const errors: string[] = [];
			page.on( 'console', ( message ) => {
				if ( message.type() === 'error' ) {
					errors.push( message.text() );
				}
			} );

			await editor.insertBlock( { name } );

			const block = editor.canvas.locator( `[data-type="${ name }"]` );
			await expect( block ).toBeVisible();

			// A block whose save() output does not match what the editor
			// re-serializes shows this notice, which is how a broken
			// deprecation or a changed class name surfaces.
			await expect(
				editor.canvas.getByText(
					'This block contains unexpected or invalid content'
				)
			).toHaveCount( 0 );

			expect( errors, errors.join( '\n' ) ).toHaveLength( 0 );
		} );
	}

	for ( const title of PATTERNS ) {
		test( `loads the ${ title } pattern and it stays valid`, async ( {
			editor,
			page,
			requestUtils,
		} ) => {
			// Read from the REST endpoint rather than driving the inserter UI:
			// the assertion is about whether the registered markup still parses
			// against the current blocks, not about how a user reaches it, and
			// this is the same markup WordPress would insert.
			const patterns = await requestUtils.rest< any[] >( {
				path: '/wp/v2/block-patterns/patterns',
			} );
			const match = patterns.find(
				( pattern ) => pattern.title === title
			);

			expect(
				match,
				`Pattern "${ title }" is not registered.`
			).toBeDefined();
			const content = match.content;

			await editor.setContent( content );

			await expect(
				editor.canvas.getByText(
					'This block contains unexpected or invalid content'
				)
			).toHaveCount( 0 );

			// Every block the pattern brought in must have resolved. A renamed
			// class or reordered attribute in the geometry markup duplicated
			// into class-gll-patterns.php shows up here as core/missing.
			const blocks = await editor.getBlocks();
			expect( blocks.length ).toBeGreaterThan( 0 );
			for ( const block of blocks ) {
				expect( block.name ).not.toBe( 'core/missing' );
			}

			// The assertion that matters, and the one the jsdom-side guard
			// could not make. WordPress recovers an invalid block rather than
			// refusing to show it, so a mismatch between the stored pattern
			// markup and what save() produces is invisible on screen and only
			// visible here. This caught the geometry block shipping without its
			// generated wp-block-gll-info-geometry class, which made it invalid
			// in every pattern that contained it.
			const validity = await page.evaluate( () =>
				( window as any ).wp.data
					.select( 'core/block-editor' )
					.getBlocks()
					.map( ( block: any ) => ( {
						name: block.name,
						isValid: block.isValid,
					} ) )
			);
			const invalid = validity.filter(
				( block: any ) => ! block.isValid
			);
			expect(
				invalid,
				`Invalid blocks in "${ title }": ${ JSON.stringify( invalid ) }`
			).toHaveLength( 0 );
		} );
	}
} );
