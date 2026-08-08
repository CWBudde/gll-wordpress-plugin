/**
 * Registers the Configuration block.
 *
 * No `deprecated` entry here, unlike its siblings: theirs exist only to keep
 * markup saved before the `appearance` attribute from invalidating, and this
 * block has never saved anything.
 *
 * @package
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

/**
 * Register the Configuration block.
 */
registerBlockType( metadata as any, { edit: Edit, save } );
