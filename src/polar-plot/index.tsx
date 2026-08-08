/**
 * Registers the Polar Plot block.
 *
 * @package
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import v1 from './deprecated';
import metadata from './block.json';

const deprecated = [ v1 ];

/**
 * Register the Polar Plot block.
 */
registerBlockType( metadata as any, { edit: Edit, save, deprecated } );
