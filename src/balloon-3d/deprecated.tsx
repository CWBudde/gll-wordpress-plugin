/**
 * 3D Balloon Block - Deprecations
 *
 * v1 is the markup that shipped before the shared theming layer existed: the
 * wrapper carried only `gll-balloon-3d-block`, without the `gll-block` /
 * `gll-appearance--*` classes and without the `appearance` attribute. Keeping
 * this snapshot means already-saved posts still validate.
 *
 * The attribute list and save output below are frozen copies. They must not be
 * kept in sync with `block.json` or `save.tsx` — that is the whole point.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';

const v1Attributes = {
	fileId: { type: 'number', default: 0 },
	fileUrl: { type: 'string', default: '' },
	fileName: { type: 'string', default: '' },
	sourceIndex: { type: 'number', default: 0 },
	frequencyIndex: { type: 'number', default: 0 },
	dbRange: { type: 'number', default: 40 },
	scale: { type: 'number', default: 1.0 },
	wireframe: { type: 'boolean', default: false },
	autoRotate: { type: 'boolean', default: false },
	showReferenceSphere: { type: 'boolean', default: true },
	showAxesHelper: { type: 'boolean', default: true },
	canvasHeight: { type: 'number', default: 500 },
	qualityPreset: {
		type: 'string',
		enum: [ 'low', 'medium', 'high' ],
		default: 'medium',
	},
};

/**
 * v1 save output.
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element|null} Saved markup.
 */
function v1Save( { attributes } ) {
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
		qualityPreset,
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
		'data-quality-preset': qualityPreset || 'medium',
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
					<p className="gll-loading-text">Loading 3D balloon...</p>
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

const deprecated = [
	{
		// Cast for the same reason the block metadata is cast at registration:
		// attributes read out of block.json widen to `{ type: string }`, while
		// the block types want the literal `'number' | 'string' | ...` union.
		// Only the attribute map is cast, so `save` stays type-checked.
		attributes: v1Attributes as any,
		save: v1Save,
	},
];

export default deprecated;
