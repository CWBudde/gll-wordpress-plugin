/**
 * Geometry Viewer Block - Save Component
 *
 * @package GllInfo
 */

import { useBlockProps } from '@wordpress/block-editor';

export default function save( { attributes } ) {
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
