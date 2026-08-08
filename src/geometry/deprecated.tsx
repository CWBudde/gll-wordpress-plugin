/**
 * Geometry Viewer Block - Deprecated save implementations.
 *
 * v1 is the markup shipped before the `appearance` attribute existed, when the
 * wrapper carried only `gll-geometry-block`. Posts saved with it must keep
 * validating, so the original save output lives on here untouched.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Save output as of block version 1 (no `appearance` attribute).
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element} Saved markup.
 */
export default function saveV1( { attributes } ) {
	const {
		fileUrl,
		fileName,
		geometryIndex,
		showFaces,
		showEdges,
		showMarkers,
		showSources,
		centerReference,
		autoRotate,
		canvasHeight,
	} = attributes;

	const blockProps = useBlockProps.save( {
		className: 'gll-geometry-block',
	} );

	return (
		<div
			{ ...blockProps }
			data-file-url={ fileUrl }
			data-file-name={ fileName }
			data-geometry-index={ geometryIndex }
			data-show-faces={ showFaces }
			data-show-edges={ showEdges }
			data-show-markers-ref={ showMarkers?.ref }
			data-show-markers-com={ showMarkers?.com }
			data-show-markers-pivot={ showMarkers?.pivot }
			data-show-sources={ showSources }
			data-center-reference={ centerReference }
			data-auto-rotate={ autoRotate }
			data-canvas-height={ canvasHeight }
		>
			<div className="gll-geometry-header">
				<h3>{ fileName || 'GLL Geometry' }</h3>
			</div>
			<div className="gll-geometry-loading">
				<p>Loading geometry...</p>
			</div>
			<div className="gll-geometry-canvas" />
		</div>
	);
}
