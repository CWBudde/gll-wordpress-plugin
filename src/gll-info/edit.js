/**
 * GLL Info Block - Editor Component
 *
 * @package GllInfo
 */

import { __ } from '@wordpress/i18n';
import {
	useBlockProps,
	InspectorControls,
	MediaUpload,
	MediaUploadCheck,
} from '@wordpress/block-editor';
import {
	PanelBody,
	Button,
	Spinner,
	ToggleControl,
	SelectControl,
	Placeholder,
} from '@wordpress/components';
import { useState, useEffect } from '@wordpress/element';
import { useGLLLoader } from '../shared';
import './editor.scss';

/**
 * GLL File placeholder icon.
 *
 * @return {JSX.Element} SVG icon.
 */
function GLLIcon() {
	return (
		<svg
			viewBox="0 0 24 24"
			width="48"
			height="48"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
		>
			<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
			<circle cx="12" cy="12" r="3" />
			<path d="M12 9V6M12 18v-3M9 12H6M18 12h-3" />
		</svg>
	);
}

/**
 * Overview display component.
 *
 * @param {Object} props      Component props.
 * @param {Object} props.data Parsed GLL data.
 * @return {JSX.Element} Overview component.
 */
function GLLOverview( { data } ) {
	if ( ! data ) {
		return null;
	}

	const { GenSystem, Metadata, Header } = data;

	return (
		<div className="gll-overview">
			{ GenSystem && (
				<div className="gll-section">
					<h4>{ __( 'System Information', 'gll-info' ) }</h4>
					<table className="gll-info-table">
						<tbody>
							{ GenSystem.Label && (
								<tr>
									<th>{ __( 'Label', 'gll-info' ) }</th>
									<td>{ GenSystem.Label }</td>
								</tr>
							) }
							{ GenSystem.Version && (
								<tr>
									<th>{ __( 'Version', 'gll-info' ) }</th>
									<td>{ GenSystem.Version }</td>
								</tr>
							) }
							{ GenSystem.SystemType !== undefined && (
								<tr>
									<th>{ __( 'Type', 'gll-info' ) }</th>
									<td>
										{ [
											'Line Array',
											'Cluster',
											'Loudspeaker',
										][ GenSystem.SystemType ] || 'Unknown' }
									</td>
								</tr>
							) }
							{ GenSystem.Manufacturer && (
								<tr>
									<th>
										{ __( 'Manufacturer', 'gll-info' ) }
									</th>
									<td>{ GenSystem.Manufacturer }</td>
								</tr>
							) }
						</tbody>
					</table>
				</div>
			) }

			{ Metadata && Metadata.Description && (
				<div className="gll-section">
					<h4>{ __( 'Description', 'gll-info' ) }</h4>
					<p>{ Metadata.Description }</p>
				</div>
			) }

			{ Header && (
				<div className="gll-section gll-section-muted">
					<small>
						{ __( 'Format Version:', 'gll-info' ) }{ ' ' }
						{ Header.FormatVersion } |{ __( 'Valid:', 'gll-info' ) }{ ' ' }
						{ Header.ChecksumValid ? 'Yes' : 'No' }
					</small>
				</div>
			) }
		</div>
	);
}

/**
 * Format frequency in Hz or kHz.
 *
 * @param {number} hz Frequency in Hz.
 * @return {string} Formatted frequency string.
 */
function formatFrequency( hz ) {
	if ( ! hz ) {
		return '-';
	}
	if ( hz >= 1000 ) {
		return `${ ( hz / 1000 ).toFixed( 1 ) } kHz`;
	}
	return `${ Math.round( hz ) } Hz`;
}

/**
 * Format data type enum to readable string.
 *
 * @param {number} dataType Data type enum value.
 * @return {string} Formatted data type.
 */
function formatDataType( dataType ) {
	const types = {
		0: 'Unknown',
		1: 'Pressure',
		2: 'Velocity',
		3: 'Intensity',
	};
	return types[ dataType ] || 'Unknown';
}

/**
 * Single source card component with collapsible details.
 *
 * @param {Object}   props                Component props.
 * @param {Object}   props.source         Source data.
 * @param {number}   props.index          Source index.
 * @param {string}   props.displayMode    Display mode (compact, detailed, expandable).
 * @param {boolean}  props.showCharts     Whether to show response charts.
 * @param {boolean}  props.isExpanded     Whether card is expanded.
 * @param {Function} props.onToggle       Toggle callback.
 * @return {JSX.Element} Source card component.
 */
function SourceCard( {
	source,
	index,
	displayMode,
	showCharts,
	isExpanded,
	onToggle,
} ) {
	const def = source.Definition || {};
	const balloon = def.BalloonData;
	const responseCount = source.Responses?.length || 0;

	// Compact mode: single line
	if ( displayMode === 'compact' ) {
		return (
			<div className="gll-source-card gll-source-compact">
				<div className="gll-source-header">
					<span className="gll-source-label">
						{ def.Label || source.Key }
					</span>
					<span className="gll-source-key">{ source.Key }</span>
					{ def.NominalBandwidthFrom && def.NominalBandwidthTo && (
						<span className="gll-source-bandwidth">
							{ formatFrequency( def.NominalBandwidthFrom ) } -{ ' ' }
							{ formatFrequency( def.NominalBandwidthTo ) }
						</span>
					) }
				</div>
			</div>
		);
	}

	// Detailed mode: always expanded
	if ( displayMode === 'detailed' ) {
		return (
			<div className="gll-source-card gll-source-detailed">
				<div className="gll-source-header">
					<div className="gll-source-title">
						<span className="gll-source-label">
							{ def.Label || 'Unknown' }
						</span>
					</div>
					<span className="gll-source-key">{ source.Key }</span>
				</div>
				<div className="gll-source-content">
					<div className="gll-source-details">
						<div className="gll-source-detail">
							<strong>{ __( 'Bandwidth:', 'gll-info' ) }</strong>{ ' ' }
							{ formatFrequency( def.NominalBandwidthFrom ) } -{ ' ' }
							{ formatFrequency( def.NominalBandwidthTo ) }
						</div>
						<div className="gll-source-detail">
							<strong>{ __( 'Data Type:', 'gll-info' ) }</strong>{ ' ' }
							{ formatDataType( def.DataType ) }
						</div>
						{ balloon && (
							<>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Responses:', 'gll-info' ) }
									</strong>{ ' ' }
									{ responseCount }
								</div>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Resolution:', 'gll-info' ) }
									</strong>{ ' ' }
									{ balloon.AngularResolution?.MeridianStep ||
										0 }
									° ×{ ' ' }
									{ balloon.AngularResolution?.ParallelStep ||
										0 }
									°
								</div>
							</>
						) }
					</div>
				</div>
			</div>
		);
	}

	// Expandable mode: collapsible cards
	return (
		<div
			className={ `gll-source-card gll-source-collapsible ${
				isExpanded ? 'is-expanded' : ''
			}` }
		>
			<button
				className="gll-source-header gll-source-header-toggle"
				onClick={ onToggle }
				aria-expanded={ isExpanded }
				type="button"
			>
				<div className="gll-source-title">
					<span className="gll-source-toggle">
						{ isExpanded ? '▼' : '▶' }
					</span>
					<span className="gll-source-label">
						{ def.Label || 'Unknown' }
					</span>
				</div>
				<span className="gll-source-key">{ source.Key }</span>
			</button>
			{ isExpanded && (
				<div className="gll-source-content">
					<div className="gll-source-details">
						<div className="gll-source-detail">
							<strong>{ __( 'Bandwidth:', 'gll-info' ) }</strong>{ ' ' }
							{ formatFrequency( def.NominalBandwidthFrom ) } -{ ' ' }
							{ formatFrequency( def.NominalBandwidthTo ) }
						</div>
						<div className="gll-source-detail">
							<strong>{ __( 'Data Type:', 'gll-info' ) }</strong>{ ' ' }
							{ formatDataType( def.DataType ) }
						</div>
						{ balloon && (
							<>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Responses:', 'gll-info' ) }
									</strong>{ ' ' }
									{ responseCount }
								</div>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Resolution:', 'gll-info' ) }
									</strong>{ ' ' }
									{ balloon.AngularResolution?.MeridianStep ||
										0 }
									° ×{ ' ' }
									{ balloon.AngularResolution?.ParallelStep ||
										0 }
									°
								</div>
							</>
						) }
					</div>
					{ showCharts && responseCount > 0 && (
						<div className="gll-source-response">
							<p className="gll-info-message">
								{ __(
									'Response charts will be available in a future update.',
									'gll-info'
								) }
							</p>
						</div>
					) }
					{ ! responseCount && (
						<div className="gll-empty-state">
							{ __(
								'No frequency response data available',
								'gll-info'
							) }
						</div>
					) }
				</div>
			) }
		</div>
	);
}

/**
 * Sources list component.
 *
 * @param {Object}  props             Component props.
 * @param {Object}  props.data        Parsed GLL data.
 * @param {string}  props.displayMode Display mode (compact, detailed, expandable).
 * @param {boolean} props.showCharts  Whether to show response charts.
 * @return {JSX.Element} Sources list component.
 */
function GLLSources( {
	data,
	displayMode = 'expandable',
	showCharts = false,
} ) {
	const [ expandedSources, setExpandedSources ] = useState( {} );

	if ( ! data?.Database?.SourceDefinitions?.length ) {
		return (
			<div className="gll-sources">
				<div className="gll-empty-state">
					{ __( 'No source definitions found', 'gll-info' ) }
				</div>
			</div>
		);
	}

	const sources = data.Database.SourceDefinitions;

	const handleToggle = ( index ) => {
		setExpandedSources( ( prev ) => ( {
			...prev,
			[ index ]: ! prev[ index ],
		} ) );
	};

	return (
		<div className="gll-sources">
			<h4>
				{ __( 'Acoustic Sources', 'gll-info' ) } ({ sources.length })
			</h4>
			<div className="gll-sources-list">
				{ sources.map( ( source, index ) => (
					<SourceCard
						key={ index }
						source={ source }
						index={ index }
						displayMode={ displayMode }
						showCharts={ showCharts }
						isExpanded={ expandedSources[ index ] || false }
						onToggle={ () => handleToggle( index ) }
					/>
				) ) }
			</div>
		</div>
	);
}

/**
 * Edit component for GLL Info block.
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.attributes    Block attributes.
 * @param {Function} props.setAttributes Function to set attributes.
 * @return {JSX.Element} Editor component.
 */
export default function Edit( { attributes, setAttributes } ) {
	const {
		fileId,
		fileUrl,
		fileName,
		showOverview,
		showSources,
		sourcesDisplayMode,
		showSourceResponseCharts,
		showResponses,
	} = attributes;
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );

	const blockProps = useBlockProps( {
		className: 'gll-info-block',
	} );

	// Load file when URL changes.
	useEffect( () => {
		if ( fileUrl && ! data && ! isLoading && ! loadAttempted ) {
			setLoadAttempted( true );
			load( fileUrl, true );
		}
	}, [ fileUrl, data, isLoading, load, loadAttempted ] );

	/**
	 * Handle file selection from media library.
	 *
	 * @param {Object} media Selected media object.
	 */
	const onSelectMedia = ( media ) => {
		setAttributes( {
			fileId: media.id,
			fileUrl: media.url,
			fileName: media.filename || media.title,
		} );
		setLoadAttempted( false );
		clear();
	};

	/**
	 * Handle file removal.
	 */
	const onRemoveMedia = () => {
		setAttributes( {
			fileId: 0,
			fileUrl: '',
			fileName: '',
		} );
		clear();
		setLoadAttempted( false );
	};

	// Render placeholder if no file selected.
	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon={ <GLLIcon /> }
					label={ __( 'GLL File Viewer', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file from your media library to display loudspeaker data.',
						'gll-info'
					) }
				>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectMedia }
							allowedTypes={ [
								'application/x-gll',
								'application/octet-stream',
							] }
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
				<PanelBody title={ __( 'File', 'gll-info' ) }>
					<p>
						<strong>{ fileName }</strong>
					</p>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectMedia }
							allowedTypes={ [
								'application/x-gll',
								'application/octet-stream',
							] }
							render={ ( { open } ) => (
								<Button
									variant="secondary"
									onClick={ open }
									style={ { marginRight: '8px' } }
								>
									{ __( 'Replace', 'gll-info' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
					<Button
						variant="link"
						isDestructive
						onClick={ onRemoveMedia }
					>
						{ __( 'Remove', 'gll-info' ) }
					</Button>
				</PanelBody>

				<PanelBody title={ __( 'Display Options', 'gll-info' ) }>
					<ToggleControl
						label={ __( 'Show Overview', 'gll-info' ) }
						checked={ showOverview }
						onChange={ ( value ) =>
							setAttributes( { showOverview: value } )
						}
					/>
					<ToggleControl
						label={ __( 'Show Sources', 'gll-info' ) }
						checked={ showSources }
						onChange={ ( value ) =>
							setAttributes( { showSources: value } )
						}
					/>
					{ showSources && (
						<>
							<SelectControl
								label={ __(
									'Sources Display Mode',
									'gll-info'
								) }
								value={ sourcesDisplayMode }
								options={ [
									{
										label: __( 'Compact', 'gll-info' ),
										value: 'compact',
									},
									{
										label: __( 'Detailed', 'gll-info' ),
										value: 'detailed',
									},
									{
										label: __( 'Expandable', 'gll-info' ),
										value: 'expandable',
									},
								] }
								onChange={ ( value ) =>
									setAttributes( {
										sourcesDisplayMode: value,
									} )
								}
								help={ __(
									'Choose how source information is displayed',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __(
									'Show Response Charts',
									'gll-info'
								) }
								checked={ showSourceResponseCharts }
								onChange={ ( value ) =>
									setAttributes( {
										showSourceResponseCharts: value,
									} )
								}
								help={ __(
									'Display frequency response charts for each source (coming soon)',
									'gll-info'
								) }
							/>
						</>
					) }
					<ToggleControl
						label={ __( 'Show Responses', 'gll-info' ) }
						checked={ showResponses }
						onChange={ ( value ) =>
							setAttributes( { showResponses: value } )
						}
						help={ __(
							'Coming soon: frequency response charts',
							'gll-info'
						) }
					/>
				</PanelBody>
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-info-header">
					<GLLIcon />
					<div className="gll-info-header-text">
						<h3>{ fileName }</h3>
						{ data?.GenSystem?.Label && (
							<p>{ data.GenSystem.Label }</p>
						) }
					</div>
				</div>

				{ isLoading && (
					<div className="gll-info-loading">
						<Spinner />
						<span>{ __( 'Parsing GLL file...', 'gll-info' ) }</span>
					</div>
				) }

				{ error && (
					<div className="gll-info-error">
						<p>{ __( 'Error loading GLL file:', 'gll-info' ) }</p>
						<code>{ error.message }</code>
					</div>
				) }

				{ data && ! isLoading && (
					<div className="gll-info-content">
						{ showOverview && <GLLOverview data={ data } /> }
						{ showSources && (
							<GLLSources
								data={ data }
								displayMode={ sourcesDisplayMode }
								showCharts={ showSourceResponseCharts }
							/>
						) }
					</div>
				) }
			</div>
		</>
	);
}
