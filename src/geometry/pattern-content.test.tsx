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

	it( 'matches the serialized default geometry block', () => {
		const serialized = serialize( createBlock( 'gll-info/geometry' ) );
		const [ opener, markup, closer ] = serialized.split( '\n' );

		expect( opener ).toBe( '<!-- wp:gll-info/geometry -->' );
		expect( closer ).toBe( '<!-- /wp:gll-info/geometry -->' );

		const php = readFileSync( PATTERNS_PHP, 'utf8' );
		expect( php ).toContain( markup );
	} );
} );
