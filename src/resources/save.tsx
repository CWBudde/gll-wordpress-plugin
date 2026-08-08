/**
 * Resources Block - Save Component
 *
 * Outputs the block markup for frontend rendering. The view.js script hydrates
 * it with the list of embedded documents and data files.
 *
 * Note what is deliberately absent: the embedded files themselves. The parser
 * hands us each one as a base64 `data:` URI, and one corpus file carries a
 * 2.17 MB PDF — roughly 2.9 MB of base64. None of that belongs in post
 * content. The view derives the URIs at runtime from the parsed file.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { appearanceClass } from '../shared';

/**
 * Save component for the Resources block.
 *
 * @param {Object} props            Component props.
 * @param {Object} props.attributes Block attributes.
 * @return {JSX.Element|null} Saved markup.
 */
export default function save( { attributes } ) {
	const {
		fileId,
		fileUrl,
		fileName,
		showDocumentation,
		showDataFiles,
		showPreviews,
		previewMaxHeight,
		hideWhenEmpty,
		appearance,
	} = attributes;

	// If no file selected, don't render anything.
	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: `gll-resources-block ${ appearanceClass( appearance ) }`,
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-show-documentation': showDocumentation ? 'true' : 'false',
		'data-show-data-files': showDataFiles ? 'true' : 'false',
		'data-show-previews': showPreviews ? 'true' : 'false',
		'data-preview-max-height': previewMaxHeight,
		'data-hide-when-empty': hideWhenEmpty ? 'true' : 'false',
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-resources-header">
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<path d="M14 2v6h6" />
					<path d="M9 13h6" />
					<path d="M9 17h6" />
				</svg>
				<div className="gll-resources-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">Loading resources...</p>
				</div>
			</div>
			<div className="gll-resources-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-resources-content"
				style={ { display: 'none' } }
			></div>
		</div>
	);
}
