/**
 * Pins the geometry markup embedded in the PHP block patterns.
 *
 * `includes/class-gll-patterns.php` has to carry the geometry block's save()
 * output verbatim: unlike the other six blocks, geometry does not return null
 * when no file is selected, so a pattern that only wrote a self-closing block
 * comment would fail block validation the moment it is inserted.
 *
 * This test re-serializes the real block with its default attributes and
 * asserts the PHP still contains exactly that string, so any future change to
 * `save.tsx` — a renamed class, a reordered data attribute, a new wrapper —
 * fails here instead of silently breaking the shipped patterns.
 *
 * @package
 */

// The block-editor barrel drags in the whole editor UI (and an ESM-only CSS
// dependency Jest cannot parse). Only useBlockProps.save is needed here, and
// for the default attributes it is an identity function: the block supports no
// align/color/className values that would contribute extra props.
jest.mock( '@wordpress/block-editor', () => ( {
	useBlockProps: Object.assign( ( props = {} ) => props, {
		save: ( props = {} ) => props,
	} ),
} ) );

// The shared barrel pulls in Three.js; save() only needs appearanceClass.
jest.mock( '../shared', () => ( {
	appearanceClass: jest.requireActual( '../shared/appearance-control' )
		.appearanceClass,
} ) );

import { readFileSync } from 'fs';
import { join } from 'path';
import { createBlock, registerBlockType, serialize } from '@wordpress/blocks';

import metadata from './block.json';
import save from './save';

const PATTERNS_PHP = join(
	__dirname,
	'..',
	'..',
	'includes',
	'class-gll-patterns.php'
);

describe( 'geometry markup embedded in the block patterns', () => {
	beforeAll( () => {
		registerBlockType( metadata as never, { save } as never );
	} );

	/**
	 * The generated class WordPress adds from `supports.className`.
	 *
	 * This has to be spliced in by hand because `serialize()` under jsdom does
	 * NOT add it, while a real editor does. That gap is not academic: the
	 * markup in class-gll-patterns.php was missing this class, so every shipped
	 * pattern containing the geometry block loaded as an INVALID block in the
	 * editor — and this test passed the whole time, because it was comparing
	 * the PHP against the same incomplete output.
	 *
	 * The authority is now `tests/e2e/specs/blocks.spec.ts`, which loads each
	 * pattern in a real editor and asserts every block reports `isValid`. This
	 * test remains as the cheap guard that runs without wp-env, and it can only
	 * be trusted as far as this constant is kept correct.
	 */
	const GENERATED_CLASS = 'wp-block-gll-info-geometry';

	it( 'matches the serialized default geometry block', () => {
		// Array form: `serialize` casts a lone block to an array internally and
		// joins with a blank line, so a single-element array is byte-identical
		// and matches the declared signature.
		const serialized = serialize( [ createBlock( 'gll-info/geometry' ) ] );
		const [ opener, markup, closer ] = serialized.split( '\n' );

		expect( opener ).toBe( '<!-- wp:gll-info/geometry -->' );
		expect( closer ).toBe( '<!-- /wp:gll-info/geometry -->' );

		const expected = markup.replace(
			'class="',
			`class="${ GENERATED_CLASS } `
		);

		const php = readFileSync( PATTERNS_PHP, 'utf8' );
		expect( php ).toContain( expected );
	} );
} );
