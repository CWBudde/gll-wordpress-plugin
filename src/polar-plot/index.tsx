/**
 * Registers the Polar Plot block.
 *
 * @package
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

/**
 * Register the Polar Plot block.
 */
registerBlockType( metadata as any, { edit: Edit, save } );
