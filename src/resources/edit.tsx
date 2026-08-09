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
	RangeControl,
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
	AppearanceControl,
	appearanceClass,
} from '../shared';
import { collectResources } from './resource-model';
import type { ResourceViewItem } from './resource-model';
import './editor.scss';

/**
 * Icon for a resource row, chosen from the classified kind.
 *
 * Inline SVG rather than the reference viewer's emoji: emoji render
 * inconsistently across platforms, and a screen reader announces them
 * ("page facing up") in the middle of a file name.
 *
 * @param {Object} props      Component props.
 * @param {string} props.kind Resource kind.
 * @return {JSX.Element} Decorative icon.
 */
function ResourceIcon( { kind } ) {
	const paths = {
		pdf: (
			<>
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
				<path d="M14 2v6h6" />
			</>
		),
		image: (
			<>
				<rect x="3" y="3" width="18" height="18" rx="2" />
				<circle cx="8.5" cy="8.5" r="1.5" />
				<path d="M21 15l-5-5L5 21" />
			</>
		),
		archive: (
			<>
				<path d="M21 8v13H3V8" />
				<path d="M1 3h22v5H1z" />
				<path d="M10 12h4" />
			</>
		),
		file: (
			<>
				<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
				<path d="M13 2v7h7" />
			</>
		),
	};

	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			aria-hidden="true"
		>
			{ paths[ kind ] || paths.file }
		</svg>
	);
}

/**
 * One resource row.
 *
 * @param {Object} props                  Component props.
 * @param {Object} props.item             Resource view item.
 * @param {number} props.previewMaxHeight Maximum preview height in pixels.
 * @return {JSX.Element} Row markup.
 */
function ResourceRow( {
	item,
	previewMaxHeight,
}: {
	item: ResourceViewItem;
	previewMaxHeight: number;
} ) {
	return (
		<li className={ `gll-resource-item gll-resource-item--${ item.kind }` }>
			<div className="gll-resource-meta">
				<ResourceIcon kind={ item.kind } />
				<div className="gll-resource-details">
					<span className="gll-resource-title">{ item.title }</span>
					{ item.subtitle && (
						<span className="gll-resource-subtitle">
							{ item.subtitle }
						</span>
					) }
				</div>
			</div>

			{ item.previewUri && (
				<div
					className="gll-resource-preview"
					style={
						{
							'--gll-resource-preview-max': `${ previewMaxHeight }px`,
						} as React.CSSProperties
					}
				>
					<img
						src={ item.previewUri }
						alt={ item.name }
						loading="lazy"
						decoding="async"
					/>
				</div>
			) }

			<div className="gll-resource-actions">
				<span className="gll-resource-size">{ item.sizeText }</span>
				{ item.downloadUri && (
					<a
						className="gll-resource-download"
						href={ item.downloadUri }
						download={ item.name }
						aria-label={ item.downloadLabel }
						// Gutenberg treats clicks inside the canvas as block
						// selection; without this the anchor never fires.
						onClick={ ( event ) => event.stopPropagation() }
					>
						{ __( 'Download', 'gll-info' ) }
					</a>
				) }
			</div>
		</li>
	);
}

/**
 * One titled section of resources.
 *
 * Unlike the frontend, an empty section still renders here — an author who
 * flips a toggle and sees nothing change needs to be told why.
 *
 * @param {Object} props                  Component props.
 * @param {string} props.title            Section heading.
 * @param {string} props.hint             Short explanation under the heading.
 * @param {Array}  props.items            Resource view items.
 * @param {string} props.emptyText        Text shown when there are no items.
 * @param {number} props.previewMaxHeight Maximum preview height in pixels.
 * @return {JSX.Element} Section markup.
 */
function ResourceSection( {
	title,
	hint,
	items,
	emptyText,
	previewMaxHeight,
} ) {
	return (
		<div className="gll-resources-section">
			<h4 className="gll-resources-section-title">{ title }</h4>
			<p className="gll-resources-section-hint">{ hint }</p>
			{ items.length === 0 ? (
				<div className="gll-resources-empty">{ emptyText }</div>
			) : (
				<ul className="gll-resource-list">
					{ items.map( ( item ) => (
						<ResourceRow
							key={ item.id }
							item={ item }
							previewMaxHeight={ previewMaxHeight }
						/>
					) ) }
				</ul>
			) }
		</div>
	);
}

/**
 * Edit component for the Resources block.
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
		showDocumentation,
		showDataFiles,
		showPreviews,
		previewMaxHeight,
		hideWhenEmpty,
		appearance,
	} = attributes;

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const { data, parsedFrom, isLoading, error, load, clear } = useGLLLoader();

	// This block renders from a full parse and never from the cache, but the
	// file it just parsed is very likely the one a `gll-info` or `config` block
	// elsewhere on the site uses — so warm it while the data is free.
	useCachePublisher( { fileId, fileUrl, data, parsedFrom } );
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

	const resources = useMemo(
		() =>
			collectResources( data, {
				showDocumentation,
				showDataFiles,
				showPreviews,
			} ),
		[ data, showDocumentation, showDataFiles, showPreviews ]
	);

	// What the file holds, regardless of the toggles — this is what the
	// inspector reports, so an author can tell "switched off" from "not there".
	const availableDocs = data?.Database?.IncludeFiles?.length || 0;
	const availableDataFiles = data?.Database?.DataFiles?.length || 0;

	// Render file selection placeholder if no file is selected
	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="media-document"
					label={ __( 'GLL Resources', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to list its embedded documents and data files.',
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
				</PanelBody>

				{ data && (
					<PanelBody
						title={ __( 'Display Settings', 'gll-info' ) }
						initialOpen={ true }
					>
						<ToggleControl
							label={ __( 'Show Documentation', 'gll-info' ) }
							help={
								availableDocs === 0
									? __(
											'This file contains no documentation.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showDocumentation }
							onChange={ ( value ) =>
								setAttributes( { showDocumentation: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Data Files', 'gll-info' ) }
							help={
								availableDataFiles === 0
									? __(
											'This file contains no data files.',
											'gll-info'
									  )
									: undefined
							}
							checked={ showDataFiles }
							onChange={ ( value ) =>
								setAttributes( { showDataFiles: value } )
							}
						/>
						<ToggleControl
							label={ __( 'Show Image Previews', 'gll-info' ) }
							checked={ showPreviews }
							onChange={ ( value ) =>
								setAttributes( { showPreviews: value } )
							}
						/>
						{ showPreviews && (
							<RangeControl
								label={ __(
									'Preview Height (px)',
									'gll-info'
								) }
								value={ previewMaxHeight }
								onChange={ ( value ) =>
									setAttributes( {
										previewMaxHeight: value,
									} )
								}
								min={ 80 }
								max={ 600 }
								step={ 20 }
							/>
						) }
						<ToggleControl
							label={ __( 'Hide When Empty', 'gll-info' ) }
							help={ __(
								'Hide the block on the front end when the file has no resources.',
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
				<div className="gll-resources-block">
					<div className="gll-resources-header">
						<div className="gll-resources-header-text">
							<h3>{ fileName }</h3>
						</div>
					</div>

					{ isLoading && (
						<div className="gll-resources-loading">
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
						<>
							{ showDocumentation && (
								<ResourceSection
									title={ __( 'Documentation', 'gll-info' ) }
									hint={ __(
										'Technical drawings, spec sheets, and manuals embedded in the GLL file.',
										'gll-info'
									) }
									items={ resources.documentation }
									emptyText={ __(
										'No documentation files in this GLL.',
										'gll-info'
									) }
									previewMaxHeight={ previewMaxHeight }
								/>
							) }

							{ showDataFiles && (
								<ResourceSection
									title={ __( 'Data Files', 'gll-info' ) }
									hint={ __(
										'Embedded images, geometry, and configuration files.',
										'gll-info'
									) }
									items={ resources.dataFiles }
									emptyText={ __(
										'No data files in this GLL.',
										'gll-info'
									) }
									previewMaxHeight={ previewMaxHeight }
								/>
							) }

							{ resources.isEmpty && hideWhenEmpty && (
								// Never actually hidden in the editor: a block
								// that vanishes cannot be selected or fixed.
								<div className="gll-resources-hidden-notice">
									{ __(
										'Empty — this block will be hidden on the front end.',
										'gll-info'
									) }
								</div>
							) }
						</>
					) }
				</div>
			</div>
		</>
	);
}
