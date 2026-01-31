/**
 * Frequency Response Block - Save Component
 *
 * Outputs the block markup for frontend rendering.
 * The view.js script will hydrate this with the frequency response chart.
 *
 * @package GllInfo
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Save component for Frequency Response block.
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
		responseIndex,
		phaseMode,
		normalized,
		azimuth,
		elevation,
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
		'data-azimuth': azimuth,
		'data-elevation': elevation,
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
