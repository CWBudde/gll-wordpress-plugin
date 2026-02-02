/**
 * GLL Info Block - Save Component
 *
 * Outputs the block markup for frontend rendering.
 * The view.js script will hydrate this with interactive content.
 *
 * @package GllInfo
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Save component for GLL Info block.
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
		showOverview,
		showSources,
		showResponses,
	} = attributes;

	// If no file selected, don't render anything.
	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: 'gll-info-block',
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-show-overview': showOverview ? 'true' : 'false',
		'data-show-sources': showSources ? 'true' : 'false',
		'data-show-responses': showResponses ? 'true' : 'false',
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-info-header">
				<svg
					viewBox="0 0 24 24"
					width="48"
					height="48"
					fill="none"
					stroke="currentColor"
					strokeWidth="1.5"
				>
					<circle cx="12" cy="12" r="3" />
					<path d="M12 9V6M12 18v-3M9 12H6M18 12h-3" />
				</svg>
				<div className="gll-info-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">Loading GLL data...</p>
				</div>
			</div>
			<div className="gll-info-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-info-content"
				style={ { display: 'none' } }
			></div>
		</div>
	);
}
