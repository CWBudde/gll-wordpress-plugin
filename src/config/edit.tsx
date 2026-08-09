/**
 * WordPress dependencies
 */
import { __ } from '@wordpress/i18n';
import {
	InspectorControls,
	useBlockProps,
	MediaUpload,
	MediaUploadCheck,
} from '@wordpress/block-editor';
import {
	PanelBody,
	Button,
	ToggleControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import { useEffect, useState, useMemo } from '@wordpress/element';

/**
 * Internal dependencies
 */
import {
	useGLLLoader,
	useCachePublisher,
	CacheRebuildControl,
	AppearanceControl,
	appearanceClass,
} from '../shared';
import { collectConfig } from './config-model';
import type { ConfigEntry, ConfigSection } from './config-model';
import './editor.scss';

/**
 * One configuration entry: a box type, a frame, a filter group, a limit or a
 * warning.
 *
 * `details` arrives pre-formatted and pre-sanitized from the model, so every
 * line renders as plain text. Children recurse exactly one level — a filter
 * group holds filter definitions, and nothing holds a filter definition.
 *
 * @param {Object} props       Component props.
 * @param {Object} props.entry Configuration entry.
 * @return {JSX.Element} Entry markup.
 */
function ConfigEntryView( { entry }: { entry: ConfigEntry } ) {
	return (
		<div className="gll-config-entry">
			<span className="gll-config-entry-title">{ entry.title }</span>
			{ entry.subtitle && (
				<span className="gll-config-entry-subtitle">
					{ entry.subtitle }
				</span>
			) }

			{ entry.badges && entry.badges.length > 0 && (
				<div className="gll-config-entry-badges">
					{ entry.badges.map( ( badge ) => (
						<span
							className="gll-config-entry-badge"
							key={ `${ entry.id }-badge-${ badge }` }
						>
							{ badge }
						</span>
					) ) }
				</div>
			) }

			{ entry.details.map( ( detail, index ) => (
				<div
					className="gll-config-entry-detail"
					// Detail lines are free-form text and repeat across
					// entries, so the index is the only stable key here. The
					// list is derived, never reordered.
					key={ `${ entry.id }-detail-${ index }` }
				>
					{ detail }
				</div>
			) ) }

			{ entry.children && entry.children.length > 0 && (
				<div className="gll-config-children">
					{ entry.children.map( ( child ) => (
						<ConfigEntryView key={ child.id } entry={ child } />
					) ) }
				</div>
			) }
		</div>
	);
}

/**
 * One collapsible configuration card.
 *
 * The markup mirrors what the frontend renderer emits — a native `<details>`
 * with a counted `<summary>` — so the editor preview and the published page
 * look the same. What deliberately differs: the frontend drops an empty
 * section, the editor keeps it and shows a placeholder instead. An author who
 * flips a toggle and sees nothing change has no way to tell "switched off"
 * from "not in this file", and empty is the common case here — across the
 * reference corpus most files carry no warnings and no frames at all.
 *
 * No localStorage either: the frontend restores the reader's own open/closed
 * state, but in the editor `initiallyCollapsed` must visibly do something the
 * moment it is toggled.
 *
 * @param {Object}  props                    Component props.
 * @param {Object}  props.section            Collected configuration section.
 * @param {boolean} props.initiallyCollapsed Whether cards start collapsed.
 * @param {string}  props.emptyText          Text shown when the section is empty.
 * @return {JSX.Element} Card markup.
 */
function ConfigSectionView( {
	section,
	initiallyCollapsed,
	emptyText,
}: {
	section: ConfigSection;
	initiallyCollapsed: boolean;
	emptyText: string;
} ) {
	return (
		<details
			className="gll-config-card"
			data-card={ section.key }
			open={ ! initiallyCollapsed }
		>
			<summary className="gll-config-summary">
				<span className="gll-config-summary-title">
					{ section.title }
				</span>
				<span className="gll-config-count">{ section.count }</span>
			</summary>

			{ section.isEmpty ? (
				<div className="gll-config-empty">{ emptyText }</div>
			) : (
				<div className="gll-config-body">
					{ section.entries.map( ( entry ) => (
						<ConfigEntryView key={ entry.id } entry={ entry } />
					) ) }
				</div>
			) }
		</details>
	);
}

/**
 * Placeholder text for a section that is switched on but holds no entries.
 *
 * Wrapped in functions rather than stored as plain strings so `__()` runs at
 * render time, once the locale data is in place.
 */
const EMPTY_TEXT = {
	'box-types': () => __( 'No box types defined.', 'gll-info' ),
	frames: () => __( 'No frames defined.', 'gll-info' ),
	'filter-groups': () => __( 'No filter groups defined.', 'gll-info' ),
	limits: () => __( 'No rigging limits defined.', 'gll-info' ),
	warnings: () => __( 'No rigging warnings defined.', 'gll-info' ),
};

/**
 * Edit component for the Configuration block.
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.attributes    Block attributes.
 * @param {Function} props.setAttributes Function to update attributes.
 * @return {JSX.Element} Edit component.
 */
export default function Edit( { attributes, setAttributes } ) {
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

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const { data, isLoading, error, load, clear } = useGLLLoader();

	// This block is one of the two served from the cache on the frontend, so
	// keeping it warm here is what stops visitors downloading the parser.
	const rebuildCache = useCachePublisher( fileId, data );

	const [ loadAttempted, setLoadAttempted ] = useState( false );

	// Load file when URL is set
	useEffect( () => {
		if ( fileUrl && ! loadAttempted ) {
			setLoadAttempted( true );
			load( fileUrl, true );
		}
	}, [ fileUrl, load, loadAttempted ] );

	// Handle file selection from media library
	const onSelectFile = ( media ) => {
		setAttributes( {
			fileId: media.id,
			fileUrl: media.url,
			fileName: media.filename,
		} );
		setLoadAttempted( false );
	};

	// Handle file removal
	const onRemoveFile = () => {
		setAttributes( {
			fileId: 0,
			fileUrl: '',
			fileName: '',
		} );
		clear();
		setLoadAttempted( false );
	};

	const config = useMemo(
		() =>
			collectConfig( data, {
				showBoxTypes,
				showFrames,
				showFilterGroups,
				showLimits,
				showWarnings,
				showGeometrySummary,
				showFilterDetails,
				showPinPoints,
			} ),
		[
			data,
			showBoxTypes,
			showFrames,
			showFilterGroups,
			showLimits,
			showWarnings,
			showGeometrySummary,
			showFilterDetails,
			showPinPoints,
		]
	);

	// What the file holds, regardless of the toggles. Read from the normalized
	// data rather than from `config`, which omits a switched-off section
	// entirely — the inspector has to tell "switched off" from "not there".
	const boxTypeCount = data?.Database?.BoxTypes?.length || 0;
	const frameCount = data?.Database?.Frames?.length || 0;
	const filterGroupCount = data?.Database?.FilterGroups?.length || 0;
	const limitCount = data?.Database?.Limits?.length || 0;
	const warningCount = data?.Database?.Warnings?.length || 0;

	// Render file selection placeholder if no file is selected
	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="admin-settings"
					label={ __( 'GLL Configuration', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to show its box types, frames, filter groups, limits and warnings.',
						'gll-info'
					) }
				>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
							allowedTypes={ [ 'application/x-gll' ] }
							render={ ( { open } ) => (
								<Button variant="primary" onClick={ open }>
									{ __( 'Select GLL File', 'gll-info' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
				</Placeholder>
			</div>
		);
	}

	return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __( 'File Settings', 'gll-info' ) }
					initialOpen={ true }
				>
					<div className="gll-file-info">
						<strong>{ __( 'Selected File:', 'gll-info' ) }</strong>
						<br />
						{ fileName }
					</div>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
							allowedTypes={ [ 'application/x-gll' ] }
							value={ fileId }
							render={ ( { open } ) => (
								<Button
									variant="secondary"
									onClick={ open }
									style={ {
										marginTop: '10px',
										marginRight: '10px',
									} }
								>
									{ __( 'Replace File', 'gll-info' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
					<Button
						variant="tertiary"
						isDestructive
						onClick={ onRemoveFile }
						style={ { marginTop: '10px' } }
					>
						{ __( 'Remove File', 'gll-info' ) }
					</Button>
					<CacheRebuildControl
						rebuild={ rebuildCache }
						enabled={ Boolean( data ) }
					/>
				</PanelBody>

				{ data && (
					<PanelBody
						title={ __( 'Display Settings', 'gll-info' ) }
						initialOpen={ true }
					>
						<ToggleControl
							label={ __( 'Show Box Types', 'gll-info' ) }
							help={
								boxTypeCount === 0
									? __(
											'This file contains no box types.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showBoxTypes }
							onChange={ ( value ) =>
								setAttributes( { showBoxTypes: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Frames', 'gll-info' ) }
							help={
								frameCount === 0
									? __(
											'This file contains no frames.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showFrames }
							onChange={ ( value ) =>
								setAttributes( { showFrames: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Filter Groups', 'gll-info' ) }
							help={
								filterGroupCount === 0
									? __(
											'This file contains no filter groups.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showFilterGroups }
							onChange={ ( value ) =>
								setAttributes( { showFilterGroups: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Rigging Limits', 'gll-info' ) }
							help={
								limitCount === 0
									? __(
											'This file contains no rigging limits.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showLimits }
							onChange={ ( value ) =>
								setAttributes( { showLimits: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Rigging Warnings', 'gll-info' ) }
							help={
								warningCount === 0
									? __(
											'This file contains no rigging warnings.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showWarnings }
							onChange={ ( value ) =>
								setAttributes( { showWarnings: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Geometry Summary', 'gll-info' ) }
							help={ __(
								'Add vertex and face counts to box types and frames.',
								'gll-info'
							) }
							checked={ showGeometrySummary }
							onChange={ ( value ) =>
								setAttributes( { showGeometrySummary: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Filter Details', 'gll-info' ) }
							help={ __(
								'List the individual filters inside each filter group.',
								'gll-info'
							) }
							checked={ showFilterDetails }
							onChange={ ( value ) =>
								setAttributes( { showFilterDetails: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Pin Points', 'gll-info' ) }
							help={ __(
								'List the rigging pin points of each frame. Off by default — a frame can carry dozens.',
								'gll-info'
							) }
							checked={ showPinPoints }
							onChange={ ( value ) =>
								setAttributes( { showPinPoints: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Start Collapsed', 'gll-info' ) }
							help={ __(
								'Every card summary carries its entry count, so a collapsed card still tells the reader what is inside.',
								'gll-info'
							) }
							checked={ initiallyCollapsed }
							onChange={ ( value ) =>
								setAttributes( { initiallyCollapsed: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Remember Open Cards', 'gll-info' ) }
							help={ __(
								'Store which cards a site visitor opened and restore them on the next visit. Affects the front end only — the editor preview always follows the setting above.',
								'gll-info'
							) }
							checked={ rememberCollapsed }
							onChange={ ( value ) =>
								setAttributes( { rememberCollapsed: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Hide When Empty', 'gll-info' ) }
							help={ __(
								'Hide the block on the front end when the file has no configuration to show.',
								'gll-info'
							) }
							checked={ hideWhenEmpty }
							onChange={ ( value ) =>
								setAttributes( { hideWhenEmpty: value } )
							}
						/>
					</PanelBody>
				) }

				<AppearanceControl
					appearance={ appearance }
					onChange={ ( value ) =>
						setAttributes( { appearance: value } )
					}
				/>
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-config-block">
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
							{ data?.GenSystem?.Label && (
								<p>{ data.GenSystem.Label }</p>
							) }
						</div>
					</div>

					{ isLoading && (
						<div className="gll-config-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data…', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-error">
							<strong>
								{ __( 'Error loading GLL file:', 'gll-info' ) }
							</strong>
							{ error.message }
						</div>
					) }

					{ data && ! isLoading && (
						<div className="gll-config-content">
							{ config.sections.map( ( section ) => (
								<ConfigSectionView
									key={ section.key }
									section={ section }
									initiallyCollapsed={ initiallyCollapsed }
									emptyText={
										EMPTY_TEXT[ section.key ]?.() ||
										__( 'Nothing defined.', 'gll-info' )
									}
								/>
							) ) }

							{ config.isEmpty && hideWhenEmpty && (
								// Never actually hidden in the editor: a block
								// that vanishes cannot be selected or fixed.
								<div className="gll-config-hidden-notice">
									{ __(
										'Empty — this block will be hidden on the front end.',
										'gll-info'
									) }
								</div>
							) }
						</div>
					) }
				</div>
			</div>
		</>
	);
}
