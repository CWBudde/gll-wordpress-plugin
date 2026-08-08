/**
 * Polar Plot Block - Deprecated Versions
 *
 * v1 is the markup saved before the shared `appearance` attribute existed. Its
 * wrapper carried only `gll-polar-plot-block`, so already-saved posts would be
 * flagged invalid without this entry.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';
import metadata from './block.json';

// v1 predates the `appearance` attribute; everything else is unchanged.
const { appearance: _appearance, ...v1Attributes } = metadata.attributes as any;

/**
 * Save component as it existed before the appearance attribute.
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element} Saved markup.
 */
function saveV1( { attributes } ) {
	const {
		fileId,
		fileUrl,
		fileName,
		sourceIndex,
		frequencyIndex,
		showHorizontal,
		showVertical,
		normalized,
		chartHeight,
	} = attributes;

	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: 'gll-polar-plot-block',
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-source-index': sourceIndex,
		'data-frequency-index': frequencyIndex,
		'data-show-horizontal': showHorizontal ? 'true' : 'false',
		'data-show-vertical': showVertical ? 'true' : 'false',
		'data-normalized': normalized ? 'true' : 'false',
		'data-chart-height': chartHeight,
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-polar-plot-header">
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<circle cx="12" cy="12" r="10" />
					<circle cx="12" cy="12" r="6" />
					<circle cx="12" cy="12" r="2" />
					<path d="M12 2v20M2 12h20" />
				</svg>
				<div className="gll-polar-plot-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">Loading polar plot...</p>
				</div>
			</div>
			<div className="gll-polar-plot-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-polar-plot-chart"
				style={ { display: 'none', minHeight: chartHeight + 'px' } }
			></div>
		</div>
	);
}

const v1 = {
	attributes: v1Attributes,
	save: saveV1,
};

export default v1;
