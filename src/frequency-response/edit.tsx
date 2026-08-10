/**
 * WordPress dependencies
 */
import { __, sprintf } from '@wordpress/i18n';
import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import {
	PanelBody,
	SelectControl,
	ToggleControl,
	RangeControl,
	Spinner,
} from '@wordpress/components';
import { useMemo } from '@wordpress/element';

/**
 * Internal dependencies
 */
import {
	useFileSource,
	useCachePublisher,
	FileSourceControl,
	ChartWrapper,
	buildSourceResponseChartConfig,
	AppearanceControl,
	appearanceClass,
} from '../shared';
import { formatFrequency } from '../shared/charting-utils';
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
		showPhase,
		showMagnitude,
		chartHeight,
		appearance,
	} = attributes;

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const {
		data,
		parsedFrom,
		isLoading,
		error,
		source: fileSource,
		setSource,
		clearSource,
		reload,
	} = useFileSource( {
		attributes: { fileId, fileUrl, fileName },
		setAttributes,
	} );

	// This block renders from a full parse and never from the cache, but the
	// file it just parsed is very likely the one a `gll-info` or `config` block
	// elsewhere on the site uses — so warm it while the data is free.
	useCachePublisher( { fileId, fileUrl, data, parsedFrom } );

	// Build source options from parsed data
	const sourceOptions =
		data?.Database?.SourceDefinitions?.map( ( source, index ) => ( {
			label:
				source.Label ||
				sprintf(
					/* translators: %d: source number. */
					__( 'Source %d', 'gll-info' ),
					index + 1
				),
			value: index,
		} ) ) || [];

	// Build phase mode options
	const phaseModeOptions = [
		{ label: __( 'Unwrapped', 'gll-info' ), value: 'unwrapped' },
		{ label: __( 'Wrapped', 'gll-info' ), value: 'wrapped' },
		{ label: __( 'Group Delay', 'gll-info' ), value: 'group-delay' },
	];

	// Get current source data
	const currentSource = data?.Database?.SourceDefinitions?.[ sourceIndex ];

	// Build the chart from the shared series builder — the same code path the
	// frontend view uses, so editor and published page agree.
	const chartConfig = useMemo( () => {
		if ( ! currentSource ) {
			return null;
		}

		const config = buildSourceResponseChartConfig(
			currentSource,
			responseIndex,
			phaseMode,
			normalized
		);

		if ( ! config ) {
			return null;
		}

		// The shared builder always emits both series; the saved block honours
		// the visibility toggles, so the preview has to as well or the editor
		// shows something the published page will not.
		const datasets = config.data.datasets.filter( ( dataset ) =>
			dataset.yAxisID === 'y1' ? showPhase : showMagnitude
		);

		if ( datasets.length === 0 ) {
			return null;
		}

		const scales = { ...config.options.scales };
		if ( ! showMagnitude ) {
			delete scales.y;
		}
		if ( ! showPhase ) {
			delete scales.y1;
		}

		return {
			...config,
			data: { ...config.data, datasets },
			options: { ...config.options, scales },
		};
	}, [
		currentSource,
		responseIndex,
		phaseMode,
		normalized,
		showMagnitude,
		showPhase,
	] );

	// The badge used to advertise a hardcoded "20 Hz - 20 kHz" regardless of the
	// file, which is a claim the data does not support. Derive it from the
	// frequency axis of the selected response instead, and drop the badge when
	// the response carries no frequencies at all.
	const rangeLabel = useMemo( () => {
		const frequencies = currentSource?.Responses?.[ responseIndex ]
			?.Frequencies as number[] | undefined;
		if ( ! Array.isArray( frequencies ) || frequencies.length === 0 ) {
			return null;
		}
		return sprintf(
			/* translators: 1: lowest frequency in the response, 2: highest frequency. */
			__( '%1$s - %2$s', 'gll-info' ),
			formatFrequency( frequencies[ 0 ] ),
			formatFrequency( frequencies[ frequencies.length - 1 ] )
		);
	}, [ currentSource, responseIndex ] );

	// Render file selection placeholder if no file is selected
	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<FileSourceControl
					variant="placeholder"
					icon="chart-line"
					label={ __( 'GLL Frequency Response', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file from your media library, or paste the address of one hosted elsewhere, to display a frequency response chart.',
						'gll-info'
					) }
					value={ fileSource }
					onChange={ setSource }
					onRemove={ clearSource }
				/>
			</div>
		);
	}

	return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __( 'File', 'gll-info' ) }
					initialOpen={ true }
				>
					<FileSourceControl
						variant="inspector"
						value={ fileSource }
						onChange={ setSource }
						onRemove={ clearSource }
						onRetry={ reload }
						status={ { isLoading, error, via: parsedFrom?.via } }
					/>
				</PanelBody>

				{ data && (
					<>
						<PanelBody
							title={ __( 'Source Settings', 'gll-info' ) }
							initialOpen={ true }
						>
							{ sourceOptions.length > 0 && (
								<SelectControl
									label={ __(
										'Acoustic Source',
										'gll-info'
									) }
									value={ sourceIndex }
									options={ sourceOptions }
									onChange={ ( value ) =>
										setAttributes( {
											sourceIndex: parseInt( value, 10 ),
										} )
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
								label={ __(
									'Normalize (On-Axis)',
									'gll-info'
								) }
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
					</>
				) }

				<AppearanceControl
					appearance={ appearance }
					onChange={ ( value ) =>
						setAttributes( { appearance: value } )
					}
				/>
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-frequency-response-block">
					<div className="gll-frequency-response-header">
						<h3>{ fileName }</h3>
						{ currentSource && (
							<p className="gll-source-label">
								{ __( 'Source:', 'gll-info' ) }{ ' ' }
								{ currentSource.Label }
							</p>
						) }
					</div>

					{ isLoading && (
						<div className="gll-frequency-response-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data…', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-frequency-response-error">
							<p>
								{ __( 'Error loading GLL file:', 'gll-info' ) }{ ' ' }
								{ error.message }
							</p>
						</div>
					) }

					{ data && chartConfig && (
						<>
							<div className="gll-frequency-response-metadata">
								{ rangeLabel && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Range:', 'gll-info' ) }
										</strong>{ ' ' }
										{ rangeLabel }
									</span>
								) }
								{ showPhase && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Phase:', 'gll-info' ) }
										</strong>{ ' ' }
										{ phaseMode === 'group-delay' &&
											__( 'Group Delay', 'gll-info' ) }
										{ phaseMode === 'wrapped' &&
											__( 'Wrapped Phase', 'gll-info' ) }
										{ phaseMode === 'unwrapped' &&
											__(
												'Unwrapped Phase',
												'gll-info'
											) }
									</span>
								) }
								{ normalized && (
									<span className="gll-meta-badge gll-meta-badge-highlight">
										<strong>
											{ __( 'Normalized', 'gll-info' ) }
										</strong>
									</span>
								) }
								{ currentSource?.Label && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Source:', 'gll-info' ) }
										</strong>{ ' ' }
										{ currentSource.Label }
									</span>
								) }
							</div>
							<div className="gll-frequency-response-chart">
								<ChartWrapper
									config={ chartConfig }
									height={ chartHeight }
									className="gll-chart"
								/>
							</div>
						</>
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
