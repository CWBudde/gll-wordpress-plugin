/**
 * Polar Plot Block - Editor Component
 *
 * @package
 */

import { __, _x, sprintf } from '@wordpress/i18n';
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
import { useEffect, useState, useMemo } from '@wordpress/element';

import {
	useGLLLoader,
	ChartWrapper,
	AppearanceControl,
	appearanceClass,
} from '../shared';
import { computePolarSlices, computeLevelRange } from '../shared/polar-utils';
import { formatFrequency } from '../shared/charting-utils';
import polarCompassPlugin from '../shared/polar-compass-plugin';
import './editor.scss';

/**
 * Build Chart.js radar configuration from polar slice data.
 *
 * @param {Object}  slices         Computed polar slices.
 * @param {number}  frequency      Current frequency value.
 * @param {boolean} showHorizontal Show horizontal slice.
 * @param {boolean} showVertical   Show vertical slice.
 * @param {boolean} normalized     Normalize levels.
 * @return {Object} Chart.js configuration object.
 */
function buildPolarChartConfig(
	slices,
	frequency,
	showHorizontal,
	showVertical,
	normalized
) {
	let horizontalLevels = slices.horizontal.levels;
	let verticalLevels = slices.vertical.levels;

	if ( normalized ) {
		const hMax = Math.max(
			...horizontalLevels.filter( ( v ) => v !== null && ! isNaN( v ) )
		);
		const vMax = Math.max(
			...verticalLevels.filter( ( v ) => v !== null && ! isNaN( v ) )
		);
		horizontalLevels = horizontalLevels.map( ( v ) =>
			v !== null && ! isNaN( v ) ? v - hMax : v
		);
		verticalLevels = verticalLevels.map( ( v ) =>
			v !== null && ! isNaN( v ) ? v - vMax : v
		);
	}

	const allLevels = [
		...( showHorizontal ? horizontalLevels : [] ),
		...( showVertical ? verticalLevels : [] ),
	];
	const levelRange = computeLevelRange( allLevels );
	const suggestedMax =
		levelRange.max !== null ? levelRange.max + 3 : undefined;
	const suggestedMin =
		levelRange.max !== null ? levelRange.max - 40 : undefined;

	const freqLabel = formatFrequency( frequency );
	const datasets = [];

	// The normalized variant is a whole sentence rather than a translated
	// suffix glued on, so translators can place the qualifier where their
	// language needs it.
	if ( showHorizontal ) {
		datasets.push( {
			label: normalized
				? sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Horizontal @ %s (normalized)', 'gll-info' ),
						freqLabel
				  )
				: sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Horizontal @ %s', 'gll-info' ),
						freqLabel
				  ),
			data: horizontalLevels,
			borderColor: '#2563eb',
			backgroundColor: 'rgba(37, 99, 235, 0.12)',
			pointRadius: 0,
			borderWidth: 2,
			fill: true,
			tension: 0.2,
		} );
	}

	if ( showVertical ) {
		datasets.push( {
			label: normalized
				? sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Vertical @ %s (normalized)', 'gll-info' ),
						freqLabel
				  )
				: sprintf(
						/* translators: %s: frequency label, for example "1 kHz". */
						__( 'Vertical @ %s', 'gll-info' ),
						freqLabel
				  ),
			data: verticalLevels,
			borderColor: '#dc2626',
			backgroundColor: 'rgba(220, 38, 38, 0.12)',
			pointRadius: 0,
			borderWidth: 2,
			fill: true,
			tension: 0.2,
		} );
	}

	return {
		type: 'radar' as const,
		plugins: [ polarCompassPlugin ],
		data: {
			labels: slices.labels,
			datasets,
		},
		options: {
			responsive: true,
			maintainAspectRatio: false,
			layout: {
				padding: { top: 30, bottom: 30, left: 30, right: 30 },
			},
			plugins: {
				legend: {
					position: 'top',
				},
				tooltip: {
					callbacks: {
						title: ( items ) => {
							const label = items?.[ 0 ]?.label;
							return label
								? sprintf(
										/* translators: %s: angle label of the hovered point, for example "45°". */
										__( 'Angle %s', 'gll-info' ),
										label
								  )
								: '';
						},
						label: ( item ) => {
							const seriesLabel =
								item.dataset?.label ||
								_x( 'Level', 'chart series', 'gll-info' );
							if (
								item?.raw === null ||
								item?.raw === undefined
							) {
								return sprintf(
									/* translators: %s: chart series name. */
									__( '%s: -', 'gll-info' ),
									seriesLabel
								);
							}
							return sprintf(
								/* translators: 1: chart series name, 2: level in dB. */
								__( '%1$s: %2$s dB', 'gll-info' ),
								seriesLabel,
								item.raw.toFixed( 1 )
							);
						},
					},
				},
			},
			scales: {
				r: {
					suggestedMin,
					suggestedMax,
					startAngle: 90,
					// Chrome colors are intentionally omitted: the shared
					// chart theme fills them from the block's resolved
					// tokens, and `applyChartTheme` never overwrites a color
					// that is already set.
					ticks: {
						backdropColor: 'transparent',
					},
					grid: {},
					angleLines: {},
					pointLabels: {
						font: { size: 10 },
					},
				},
			},
		},
	};
}

/**
 * Edit component for the Polar Plot block.
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.attributes    Block attributes.
 * @param {Function} props.setAttributes Function to update attributes.
 * @return {JSX.Element} Edit component.
 */
export default function Edit( { attributes, setAttributes } ) {
	const {
		fileUrl,
		fileId,
		fileName,
		sourceIndex,
		frequencyIndex,
		showHorizontal,
		showVertical,
		normalized,
		chartHeight,
		appearance,
	} = attributes;

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );

	useEffect( () => {
		if ( fileUrl && ! loadAttempted ) {
			setLoadAttempted( true );
			load( fileUrl, true );
		}
	}, [ fileUrl, load, loadAttempted ] );

	const onSelectFile = ( media ) => {
		setAttributes( {
			fileId: media.id,
			fileUrl: media.url,
			fileName: media.filename,
		} );
		setLoadAttempted( false );
	};

	const onRemoveFile = () => {
		setAttributes( { fileId: 0, fileUrl: '', fileName: '' } );
		clear();
		setLoadAttempted( false );
	};

	// Build source options
	const sourceOptions = useMemo(
		() =>
			( data?.Database?.SourceDefinitions || [] )
				.filter( ( s ) => ( s.Responses || [] ).length > 0 )
				.map( ( source, index ) => ( {
					label:
						source.Definition?.Label ||
						source.Label ||
						sprintf(
							/* translators: %d: source number. */
							__( 'Source %d', 'gll-info' ),
							index + 1
						),
					value: index,
				} ) ),
		[ data ]
	);

	// Get current source (only sources with responses)
	const sourcesWithResponses = useMemo(
		() =>
			( data?.Database?.SourceDefinitions || [] ).filter(
				( s ) => ( s.Responses || [] ).length > 0
			),
		[ data ]
	);
	const currentSource = sourcesWithResponses[ sourceIndex ];

	// Get frequencies from sample response
	const frequencies = useMemo( () => {
		const resp = currentSource?.Responses?.[ 0 ];
		return resp?.Frequencies || [];
	}, [ currentSource ] );

	// Build frequency options
	const frequencyOptions = useMemo(
		() =>
			frequencies.map( ( freq, index ) => ( {
				label: formatFrequency( freq ),
				value: index,
			} ) ),
		[ frequencies ]
	);

	// Compute polar slices
	const slices = useMemo( () => {
		if ( ! currentSource || frequencies.length === 0 ) {
			return null;
		}
		const idx = Math.min( frequencyIndex, frequencies.length - 1 );
		return computePolarSlices( currentSource, idx );
	}, [ currentSource, frequencyIndex, frequencies ] );

	// Build chart config
	const chartConfig = useMemo( () => {
		if ( ! slices ) {
			return null;
		}
		const idx = Math.min( frequencyIndex, frequencies.length - 1 );
		return buildPolarChartConfig(
			slices,
			frequencies[ idx ],
			showHorizontal,
			showVertical,
			normalized
		);
	}, [
		slices,
		frequencyIndex,
		frequencies,
		showHorizontal,
		showVertical,
		normalized,
	] );

	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="chart-pie"
					label={ __( 'GLL Polar Plot', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to display polar directivity plot.',
						'gll-info'
					) }
				>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
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
				<PanelBody title={ __( 'File Settings', 'gll-info' ) }>
					<div className="gll-file-info">
						<strong>{ __( 'Selected File:', 'gll-info' ) }</strong>
						<br />
						{ fileName }
					</div>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
							allowedTypes={ [
								'application/x-gll',
								'application/octet-stream',
							] }
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
					<>
						<PanelBody
							title={ __( 'Source & Frequency', 'gll-info' ) }
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
							{ frequencyOptions.length > 0 && (
								<>
									<SelectControl
										label={ __( 'Frequency', 'gll-info' ) }
										value={ frequencyIndex }
										options={ frequencyOptions }
										onChange={ ( value ) =>
											setAttributes( {
												frequencyIndex: parseInt(
													value,
													10
												),
											} )
										}
									/>
									<RangeControl
										label={ __(
											'Frequency Slider',
											'gll-info'
										) }
										help={ formatFrequency(
											frequencies[
												Math.min(
													frequencyIndex,
													frequencies.length - 1
												)
											]
										) }
										value={ frequencyIndex }
										onChange={ ( value ) =>
											setAttributes( {
												frequencyIndex: value,
											} )
										}
										min={ 0 }
										max={ Math.max(
											0,
											frequencies.length - 1
										) }
									/>
								</>
							) }
						</PanelBody>

						<PanelBody
							title={ __( 'Display Options', 'gll-info' ) }
							initialOpen={ false }
						>
							<ToggleControl
								label={ __(
									'Show Horizontal Slice',
									'gll-info'
								) }
								checked={ showHorizontal }
								onChange={ ( value ) =>
									setAttributes( { showHorizontal: value } )
								}
								help={ __(
									'Front-Right-Back-Left plane (blue)',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __(
									'Show Vertical Slice',
									'gll-info'
								) }
								checked={ showVertical }
								onChange={ ( value ) =>
									setAttributes( { showVertical: value } )
								}
								help={ __(
									'Front-Top-Back-Bottom plane (red)',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __( 'Normalize', 'gll-info' ) }
								checked={ normalized }
								onChange={ ( value ) =>
									setAttributes( { normalized: value } )
								}
								help={ __(
									'Normalize each slice to its maximum level',
									'gll-info'
								) }
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
				<div className="gll-polar-plot-block">
					<div className="gll-polar-plot-header">
						<h3>{ fileName }</h3>
						{ currentSource && (
							<p className="gll-source-label">
								{ __( 'Source:', 'gll-info' ) }{ ' ' }
								{ currentSource.Definition?.Label ||
									currentSource.Label }
							</p>
						) }
					</div>

					{ isLoading && (
						<div className="gll-polar-plot-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data…', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-polar-plot-error">
							<p>
								{ __( 'Error loading GLL file:', 'gll-info' ) }{ ' ' }
								{ error.message }
							</p>
						</div>
					) }

					{ data && chartConfig && (
						<>
							<div className="gll-polar-plot-metadata">
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Frequency:', 'gll-info' ) }
									</strong>{ ' ' }
									{ formatFrequency(
										frequencies[
											Math.min(
												frequencyIndex,
												frequencies.length - 1
											)
										]
									) }
								</span>
								{ slices?.meta && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Symmetry:', 'gll-info' ) }
										</strong>{ ' ' }
										{ slices.meta.symmetryName }
									</span>
								) }
								{ slices?.meta && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Resolution:', 'gll-info' ) }
										</strong>{ ' ' }
										{ slices.meta.meridianStep }&deg;
										&times; { slices.meta.parallelStep }
										&deg;
									</span>
								) }
								{ currentSource && (
									<span className="gll-meta-badge">
										<strong>
											{ __( 'Source:', 'gll-info' ) }
										</strong>{ ' ' }
										{ currentSource.Definition?.Label ||
											currentSource.Label }
									</span>
								) }
								{ normalized && (
									<span className="gll-meta-badge gll-meta-badge-highlight">
										<strong>
											{ __( 'Normalized', 'gll-info' ) }
										</strong>
									</span>
								) }
								{ slices?.meta?.usesOnAxis && (
									<span className="gll-meta-badge">
										{ __( 'Uses on-axis', 'gll-info' ) }
									</span>
								) }
								{ slices?.meta?.frontHalfOnly && (
									<span className="gll-meta-badge">
										{ __( 'Front-half only', 'gll-info' ) }
									</span>
								) }
							</div>
							<div className="gll-polar-plot-chart">
								<ChartWrapper
									config={ chartConfig }
									height={ chartHeight }
									className="gll-chart"
								/>
							</div>
						</>
					) }

					{ data && ! chartConfig && (
						<div className="gll-polar-plot-empty">
							<p>
								{ __(
									'No directivity data available for this source.',
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
