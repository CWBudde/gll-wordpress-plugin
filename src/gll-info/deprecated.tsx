/**
 * GLL Info Block - Deprecated versions
 *
 * v1 is the markup saved before the shared theming layer added the
 * `appearance` attribute and the `gll-block` / `gll-appearance--*` wrapper
 * classes. Without this entry, existing posts would be flagged as containing
 * "unexpected or invalid content".
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';
import metadata from './block.json';

/**
 * v1 save output — a verbatim copy of `save.tsx` before the appearance class
 * was merged into the wrapper. Do not refactor it to share code with the
 * current save: deprecations must stay frozen.
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element|null} Saved markup.
 */
function saveV1( { attributes } ) {
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

// v1 attributes are the current ones minus `appearance`.
const { appearance: _appearance, ...v1Attributes } = ( metadata as any )
	.attributes;

const deprecated = [
	{
		attributes: v1Attributes,
		save: saveV1,
	},
];

export default deprecated;
