/**
 * Configuration Block - Save Component
 *
 * Outputs the block markup for frontend rendering. The view.js script hydrates
 * it with the parsed box types, frames, filter groups, limits and warnings.
 *
 * Hard rule: `save()` emits markup and data attributes only, never parsed
 * data. The configuration of a GLL runs to hundreds of entries and would bloat
 * post content, and any cached copy would silently go stale when the file is
 * replaced in the media library. The view derives everything at runtime.
 *
 * @package
 */

import { useBlockProps } from '@wordpress/block-editor';

/**
 * Internal dependencies
 */
import { appearanceClass } from '../shared';

/**
 * Save component for the Configuration block.
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
		showBoxTypes,
		showFrames,
		showFilterGroups,
		showLimits,
		showWarnings,
		showGeometrySummary,
		showFilterDetails,
		showPinPoints,
		initiallyCollapsed,
		rememberCollapsed,
		hideWhenEmpty,
		appearance,
	} = attributes;

	// If no file selected, don't render anything.
	if ( ! fileUrl ) {
		return null;
	}

	const blockProps = useBlockProps.save( {
		className: `gll-config-block ${ appearanceClass( appearance ) }`,
		'data-file-url': fileUrl,
		'data-file-id': fileId || '',
		'data-file-name': fileName || '',
		'data-show-box-types': showBoxTypes ? 'true' : 'false',
		'data-show-frames': showFrames ? 'true' : 'false',
		'data-show-filter-groups': showFilterGroups ? 'true' : 'false',
		'data-show-limits': showLimits ? 'true' : 'false',
		'data-show-warnings': showWarnings ? 'true' : 'false',
		'data-show-geometry-summary': showGeometrySummary ? 'true' : 'false',
		'data-show-filter-details': showFilterDetails ? 'true' : 'false',
		'data-show-pin-points': showPinPoints ? 'true' : 'false',
		'data-initially-collapsed': initiallyCollapsed ? 'true' : 'false',
		'data-remember-collapsed': rememberCollapsed ? 'true' : 'false',
		'data-hide-when-empty': hideWhenEmpty ? 'true' : 'false',
	} );

	return (
		<div { ...blockProps }>
			<div className="gll-config-header">
				<svg
					viewBox="0 0 24 24"
					width="32"
					height="32"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					aria-hidden="true"
				>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.2.6.76 1 1.4 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
				</svg>
				<div className="gll-config-header-text">
					<h3>{ fileName }</h3>
					<p className="gll-loading-text">Loading configuration...</p>
				</div>
			</div>
			<div className="gll-config-loading">
				<span className="gll-spinner"></span>
				<span>Parsing GLL file...</span>
			</div>
			<div
				className="gll-config-content"
				style={ { display: 'none' } }
			></div>
		</div>
	);
}
