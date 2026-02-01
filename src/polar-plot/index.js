/**
 * Registers the Polar Plot block.
 *
 * @package GllInfo
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

/**
 * Register the Polar Plot block.
 */
registerBlockType( metadata.name, {
	edit: Edit,
	save,
} );
