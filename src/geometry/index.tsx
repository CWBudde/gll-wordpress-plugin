/**
 * Registers the Geometry Viewer block.
 *
 * @package
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import saveV1 from './deprecated';
import metadata from './block.json';

/**
 * Attributes as of block version 1, i.e. everything except `appearance`.
 *
 * Derived from the manifest rather than duplicated, so the two cannot drift.
 */
const { appearance: _appearance, ...v1Attributes } =
	metadata.attributes as Record< string, unknown >;

/**
 * Deprecations, newest first.
 *
 * v1 predates the `appearance` attribute and the `gll-block` wrapper class it
 * adds. Without this entry every already-saved block would fail validation.
 */
const deprecated = [
	{
		// Cast for the same reason `metadata` is cast below: attributes read out
		// of block.json widen to `{ type: string }`, while the block types want
		// the literal `'number' | 'string' | ...` union. Only the attribute map
		// is cast, so `save` stays type-checked.
		attributes: v1Attributes as any,
		save: saveV1,
	},
];

/**
 * Register the Geometry Viewer block.
 */
registerBlockType( metadata as any, { edit: Edit, save, deprecated } );
