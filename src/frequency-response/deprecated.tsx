/**
 * Frequency Response Block - Deprecated Versions
 *
 * v1 is the markup saved before the `appearance` attribute existed, when the
 * wrapper carried no `gll-block` class. Posts saved by that version must keep
 * validating, so its save output is preserved here verbatim.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';
import metadata from './block.json';

/**
 * Attributes as they were before `appearance` was introduced.
 */
const { appearance: _appearance, ...v1Attributes } = metadata.attributes as any;

/**
 * Save component as it was in v1.
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
		responseIndex,
		phaseMode,
		normalized,
		showPhase,
		showMagnitude,
		chartHeight,
	} = attributes;

	// If no file selected, don't render anything.
	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: 'gll-frequency-response-block',
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-source-index': sourceIndex,
		'data-response-index': responseIndex,
		'data-phase-mode': phaseMode,
		'data-normalized': normalized ? 'true' : 'false',
		'data-show-phase': showPhase ? 'true' : 'false',
		'data-show-magnitude': showMagnitude ? 'true' : 'false',
		'data-chart-height': chartHeight,
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-frequency-response-header">
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M3 3v18h18" />
					<path d="M18 17l-5-5-3 3-4-4" />
				</svg>
				<div className="gll-frequency-response-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">
						Loading frequency response...
					</p>
				</div>
			</div>
			<div className="gll-frequency-response-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-frequency-response-chart"
				style={ { display: 'none', minHeight: chartHeight + 'px' } }
			></div>
		</div>
	);
}

const deprecated = [
	{
		attributes: v1Attributes,
		save: saveV1,
	},
];

export default deprecated;
