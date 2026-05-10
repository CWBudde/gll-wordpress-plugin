/**
 * Registers the Frequency Response block.
 *
 * @package
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

/**
 * Register the Frequency Response block.
 */
registerBlockType( metadata as any, { edit: Edit, save } );
