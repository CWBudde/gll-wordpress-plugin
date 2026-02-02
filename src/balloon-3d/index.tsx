/**
 * Registers the 3D Balloon block.
 *
 * @package GllInfo
 */

import { registerBlockType } from '@wordpress/blocks';
import './style.scss';
import Edit from './edit';
import save from './save';
import metadata from './block.json';

/**
 * Register the 3D Balloon block.
 */
registerBlockType( metadata as any, { edit: Edit, save } );
