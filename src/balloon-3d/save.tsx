/**
 * 3D Balloon Block - Save Component
 *
 * Outputs the block markup for frontend rendering.
 * The view.js script will hydrate this with the Three.js scene.
 *
 * @package GllInfo
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Save component for 3D Balloon block.
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element} Saved markup.
 */
export default function save( { attributes } ) {
	const {
		fileId,
		fileUrl,
		fileName,
		sourceIndex,
		frequencyIndex,
		dbRange,
		scale,
		wireframe,
		autoRotate,
		showReferenceSphere,
		showAxesHelper,
		canvasHeight,
	} = attributes;

	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: 'gll-balloon-3d-block',
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-source-index': sourceIndex,
		'data-frequency-index': frequencyIndex,
		'data-db-range': dbRange,
		'data-scale': scale,
		'data-wireframe': wireframe ? 'true' : 'false',
		'data-auto-rotate': autoRotate ? 'true' : 'false',
		'data-show-reference-sphere': showReferenceSphere ? 'true' : 'false',
		'data-show-axes-helper': showAxesHelper ? 'true' : 'false',
		'data-canvas-height': canvasHeight,
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-balloon-3d-header">
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="12" cy="12" r="10" />
					<ellipse cx="12" cy="12" rx="10" ry="4" />
					<ellipse cx="12" cy="12" rx="4" ry="10" />
				</svg>
				<div className="gll-balloon-3d-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">
						Loading 3D balloon...
					</p>
				</div>
			</div>
			<div className="gll-balloon-3d-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-balloon-3d-canvas"
				style={ { display: 'none', minHeight: canvasHeight + 'px' } }
			></div>
		</div>
	);
}
