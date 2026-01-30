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
	SelectControl,
	ToggleControl,
	RangeControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import { useEffect, useState } from '@wordpress/element';

/**
 * Internal dependencies
 */
import { useGLLLoader, ChartWrapper } from '../shared';
import './editor.scss';

/**
 * Edit component for the Frequency Response block.
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

	const blockProps = useBlockProps();
	const { data, isLoading, error, load, clear } = useGLLLoader();
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

	// Build source options from parsed data
	const sourceOptions = data?.Database?.SourceDefinitions?.map(
		( source, index ) => ( {
			label: source.Label || `Source ${ index + 1 }`,
			value: index,
		} )
	) || [];

	// Build phase mode options
	const phaseModeOptions = [
		{ label: __( 'Unwrapped', 'gll-info' ), value: 'unwrapped' },
		{ label: __( 'Wrapped', 'gll-info' ), value: 'wrapped' },
		{ label: __( 'Group Delay', 'gll-info' ), value: 'group-delay' },
	];

	// Get current source data
	const currentSource = data?.Database?.SourceDefinitions?.[ sourceIndex ];

	// Build chart configuration (simplified for editor preview)
	const chartConfig = data ? {
		type: 'line',
		data: {
			datasets: [
				showMagnitude && {
					label: __( 'Magnitude (dB)', 'gll-info' ),
					data: [],
					borderColor: 'rgb(75, 192, 192)',
					backgroundColor: 'rgba(75, 192, 192, 0.2)',
					yAxisID: 'y',
				},
				showPhase && {
					label: phaseMode === 'group-delay'
						? __( 'Group Delay (ms)', 'gll-info' )
						: __( 'Phase (rad)', 'gll-info' ),
					data: [],
					borderColor: 'rgb(255, 99, 132)',
					backgroundColor: 'rgba(255, 99, 132, 0.2)',
					yAxisID: 'y1',
				},
			].filter( Boolean ),
		},
		options: {
			responsive: true,
			plugins: {
				title: {
					display: true,
					text: fileName || __( 'Frequency Response', 'gll-info' ),
				},
				legend: {
					display: true,
				},
			},
			scales: {
				x: {
					type: 'logarithmic',
					display: true,
					title: {
						display: true,
						text: __( 'Frequency (Hz)', 'gll-info' ),
					},
				},
				y: showMagnitude && {
					type: 'linear',
					display: true,
					position: 'left',
					title: {
						display: true,
						text: __( 'Magnitude (dB)', 'gll-info' ),
					},
				},
				y1: showPhase && {
					type: 'linear',
					display: true,
					position: 'right',
					title: {
						display: true,
						text: phaseMode === 'group-delay'
							? __( 'Group Delay (ms)', 'gll-info' )
							: __( 'Phase (rad)', 'gll-info' ),
					},
					grid: {
						drawOnChartArea: false,
					},
				},
			},
		},
	} : null;

	// Render file selection placeholder if no file is selected
	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="chart-line"
					label={ __( 'GLL Frequency Response', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to display frequency response chart.',
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
									style={ { marginTop: '10px', marginRight: '10px' } }
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
					<>
						<PanelBody
							title={ __( 'Source Settings', 'gll-info' ) }
							initialOpen={ true }
						>
							{ sourceOptions.length > 0 && (
								<SelectControl
									label={ __( 'Acoustic Source', 'gll-info' ) }
									value={ sourceIndex }
									options={ sourceOptions }
									onChange={ ( value ) =>
										setAttributes( { sourceIndex: parseInt( value, 10 ) } )
									}
								/>
							) }
							<RangeControl
								label={ __( 'Response Index', 'gll-info' ) }
								value={ responseIndex }
								onChange={ ( value ) =>
									setAttributes( { responseIndex: value } )
								}
								min={ 0 }
								max={ 10 }
							/>
						</PanelBody>

						<PanelBody
							title={ __( 'Chart Settings', 'gll-info' ) }
							initialOpen={ false }
						>
							<ToggleControl
								label={ __( 'Show Magnitude', 'gll-info' ) }
								checked={ showMagnitude }
								onChange={ ( value ) =>
									setAttributes( { showMagnitude: value } )
								}
							/>
							<ToggleControl
								label={ __( 'Show Phase', 'gll-info' ) }
								checked={ showPhase }
								onChange={ ( value ) =>
									setAttributes( { showPhase: value } )
								}
							/>
							{ showPhase && (
								<SelectControl
									label={ __( 'Phase Mode', 'gll-info' ) }
									value={ phaseMode }
									options={ phaseModeOptions }
									onChange={ ( value ) =>
										setAttributes( { phaseMode: value } )
									}
								/>
							) }
							<ToggleControl
								label={ __( 'Normalize (On-Axis)', 'gll-info' ) }
								checked={ normalized }
								onChange={ ( value ) =>
									setAttributes( { normalized: value } )
								}
							/>
							<RangeControl
								label={ __( 'Chart Height (px)', 'gll-info' ) }
								value={ chartHeight }
								onChange={ ( value ) =>
									setAttributes( { chartHeight: value } )
								}
								min={ 200 }
								max={ 800 }
								step={ 50 }
							/>
						</PanelBody>

						<PanelBody
							title={ __( 'Angular Position', 'gll-info' ) }
							initialOpen={ false }
						>
							<RangeControl
								label={ __( 'Azimuth (degrees)', 'gll-info' ) }
								value={ azimuth }
								onChange={ ( value ) =>
									setAttributes( { azimuth: value } )
								}
								min={ -180 }
								max={ 180 }
								step={ 5 }
							/>
							<RangeControl
								label={ __( 'Elevation (degrees)', 'gll-info' ) }
								value={ elevation }
								onChange={ ( value ) =>
									setAttributes( { elevation: value } )
								}
								min={ -90 }
								max={ 90 }
								step={ 5 }
							/>
						</PanelBody>
					</>
				) }
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-frequency-response-block">
					<div className="gll-frequency-response-header">
						<h3>{ fileName }</h3>
						{ currentSource && (
							<p className="gll-source-label">
								{ __( 'Source:', 'gll-info' ) } { currentSource.Label }
							</p>
						) }
					</div>

					{ isLoading && (
						<div className="gll-frequency-response-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data...', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-frequency-response-error">
							<p>
								{ __( 'Error loading GLL file:', 'gll-info' ) } { error.message }
							</p>
						</div>
					) }

					{ data && chartConfig && (
						<div className="gll-frequency-response-chart">
							<ChartWrapper
								config={ chartConfig }
								height={ chartHeight }
								className="gll-chart"
							/>
						</div>
					) }

					{ data && ! chartConfig && (
						<div className="gll-frequency-response-empty">
							<p>
								{ __(
									'No frequency response data available for this source.',
									'gll-info'
								) }
							</p>
						</div>
					) }
				</div>
			</div>
		</>
	);
}
