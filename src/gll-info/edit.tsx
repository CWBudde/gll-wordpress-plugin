/**
 * GLL Info Block - Editor Component
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';
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
import {
	useState,
	useEffect,
	useMemo,
	useRef,
	useCallback,
} from '@wordpress/element';
import {
	useGLLLoader,
	computeResponseAngles,
	buildSourceResponseChartConfig,
	ChartWrapper,
	AppearanceControl,
	appearanceClass,
} from '../shared';
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
 * Format the system type enum to a readable label.
 *
 * The table lives inside the function rather than at module scope so `__()`
 * runs after WordPress has loaded the locale, not at import time.
 *
 * @param {number} systemType System type enum value.
 * @return {string} Translated system type label.
 */
function formatSystemType( systemType ) {
	const types = [
		__( 'Line Array', 'gll-info' ),
		__( 'Cluster', 'gll-info' ),
		__( 'Loudspeaker', 'gll-info' ),
	];
	return types[ systemType ] || __( 'Unknown', 'gll-info' );
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
										{ formatSystemType(
											GenSystem.SystemType
										) }
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
						{ sprintf(
							/* translators: 1: GLL format version, 2: checksum validity, "Yes" or "No". */
							__(
								'Format Version: %1$s | Valid: %2$s',
								'gll-info'
							),
							Header.FormatVersion,
							Header.ChecksumValid
								? __( 'Yes', 'gll-info' )
								: __( 'No', 'gll-info' )
						) }
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
	// Built per call rather than as a module constant so `__()` runs after the
	// locale is loaded.
	const types = {
		0: __( 'Unknown', 'gll-info' ),
		1: __( 'Pressure', 'gll-info' ),
		2: __( 'Velocity', 'gll-info' ),
		3: __( 'Intensity', 'gll-info' ),
	};
	return types[ dataType ] || __( 'Unknown', 'gll-info' );
}

/**
 * Format a number with up to one decimal place.
 *
 * @param {number} value Numeric value.
 * @return {string|null} Formatted number or null if invalid.
 */
function formatNumber( value ) {
	if ( typeof value !== 'number' || Number.isNaN( value ) ) {
		return null;
	}
	const rounded = Math.round( value * 10 ) / 10;
	return Number.isInteger( rounded ) ? `${ rounded }` : rounded.toFixed( 1 );
}

/**
 * Format angle in degrees.
 *
 * @param {number} angle Angle in degrees.
 * @return {string} Formatted angle string.
 */
function formatAngleDegrees( angle ) {
	const formatted = formatNumber( angle );
	return formatted === null ? '-' : `${ formatted }°`;
}

/**
 * Format position coordinates in mm.
 *
 * @param {Object|Array} position Position data.
 * @return {string} Formatted position string.
 */
function formatPosition( position ) {
	if ( ! position ) {
		return '-';
	}

	const x = position.x ?? position.X ?? position[ 0 ];
	const y = position.y ?? position.Y ?? position[ 1 ];
	const z = position.z ?? position.Z ?? position[ 2 ];

	const formattedX = formatNumber( x );
	const formattedY = formatNumber( y );
	const formattedZ = formatNumber( z );

	if ( formattedX === null && formattedY === null && formattedZ === null ) {
		return '-';
	}

	return [
		`X: ${ formattedX === null ? '-' : `${ formattedX } mm` }`,
		`Y: ${ formattedY === null ? '-' : `${ formattedY } mm` }`,
		`Z: ${ formattedZ === null ? '-' : `${ formattedZ } mm` }`,
	].join( ', ' );
}

/**
 * Normalize value to array.
 *
 * @param {Array|Object} value Value to normalize.
 * @return {Array} Array of items.
 */
function toArray( value ) {
	if ( ! value ) {
		return [];
	}
	if ( Array.isArray( value ) ) {
		return value;
	}
	if ( typeof value === 'object' ) {
		return Object.values( value );
	}
	return [];
}

/**
 * Build a map of source definition keys to placement instances.
 *
 * @param {Object} data Parsed GLL data.
 * @return {Map<string, Array>} Map of source key to placements.
 */
function buildSourcePlacementsMap( data ) {
	const map = new Map();
	if ( ! data?.Database ) {
		return map;
	}

	const sourceDefinitions = Array.isArray( data.Database.SourceDefinitions )
		? data.Database.SourceDefinitions
		: [];
	const boxTypes = toArray(
		data.Database.BoxTypes ||
			data.Database.box_types ||
			data.Database.Box_Types
	);

	boxTypes.forEach( ( boxType ) => {
		const placements = toArray(
			boxType?.SourcePlacements ||
				boxType?.source_placements ||
				boxType?.Sources ||
				boxType?.SourceDefinitions ||
				boxType?.SourcePlacement
		);

		if ( placements.length === 0 ) {
			return;
		}

		const boxLabel =
			boxType?.Label ||
			boxType?.Name ||
			boxType?.Key ||
			__( 'Unknown', 'gll-info' );
		const boxKey = boxType?.Key || boxType?.Id || boxType?.Name || '-';

		placements.forEach( ( placement ) => {
			const sourceKey =
				placement?.SourceDefinitionKey ||
				placement?.SourceDefinition?.Key ||
				placement?.SourceDefinition?.KeyRef ||
				placement?.SourceKey ||
				placement?.Source?.Key ||
				( typeof placement?.SourceIndex === 'number'
					? sourceDefinitions[ placement.SourceIndex ]?.Key
					: null ) ||
				placement?.Key;

			if ( ! sourceKey ) {
				return;
			}

			const entry = {
				boxLabel,
				boxKey,
				sourceLabel:
					placement?.Label ||
					placement?.SourceLabel ||
					placement?.Source?.Label ||
					placement?.SourceName,
				sourceKey,
				position:
					placement?.Position ||
					placement?.PositionMM ||
					placement?.PositionMm ||
					placement?.Offset ||
					placement?.Location ||
					placement?.Coordinates,
				rotation:
					placement?.Rotation ||
					placement?.RotationAngles ||
					placement?.Orientation ||
					placement?.Angles ||
					placement?.Euler,
			};

			const existing = map.get( sourceKey ) || [];
			existing.push( entry );
			map.set( sourceKey, existing );
		} );
	} );

	return map;
}

/**
 * Wrap an angle in degrees to the [-180, 180) range.
 *
 * @param {number} angle Angle in degrees.
 * @return {number} Wrapped angle.
 */
function wrapAzimuth180( angle ) {
	if ( ! Number.isFinite( angle ) ) {
		return 0;
	}
	const wrapped = ( ( ( angle + 180 ) % 360 ) + 360 ) % 360;
	return Math.round( wrapped - 180 );
}

/**
 * Convert a parallel angle (0–180°, 0=front pole) to elevation (-90 to 90°).
 *
 * @param {number} parallelDeg Parallel angle in degrees.
 * @return {number} Elevation in degrees.
 */
function parallelToElevation( parallelDeg ) {
	if ( ! Number.isFinite( parallelDeg ) ) {
		return 0;
	}
	return Math.round( 90 - parallelDeg );
}

/**
 * useRafState — useState variant that coalesces rapid updates into a single
 * commit per animation frame. Used to debounce slider input handlers so that
 * a fast-firing pointer device cannot trigger more than one React render per
 * frame.
 *
 * @param {number} initial Initial numeric value.
 * @return {[number, (value: number) => void]} State value and setter.
 */
function useRafState( initial: number ): [ number, ( value: number ) => void ] {
	const [ value, setValue ] = useState( initial );
	const frameRef = useRef< number | null >( null );
	const pendingRef = useRef< number >( initial );

	const set = useCallback( ( next: number ) => {
		pendingRef.current = next;
		if ( frameRef.current !== null ) {
			return;
		}
		frameRef.current = requestAnimationFrame( () => {
			frameRef.current = null;
			setValue( pendingRef.current );
		} );
	}, [] );

	useEffect(
		() => () => {
			if ( frameRef.current !== null ) {
				cancelAnimationFrame( frameRef.current );
				frameRef.current = null;
			}
		},
		[]
	);

	return [ value, set ];
}

/**
 * Per-source response controls (selector, phase, normalize, sliders).
 *
 * @param {Object} props        Component props.
 * @param {Object} props.source Source data.
 * @param {number} props.index  Source index (for unique IDs).
 * @return {JSX.Element|null} Controls component or null if no responses.
 */
function SourceResponseControls( { source, index } ) {
	const responseCount = source?.Responses?.length || 0;
	const [ responseIndex, setResponseIndex ] = useState( 0 );
	const [ phaseMode, setPhaseMode ] = useState( 'unwrapped' );
	const [ normalized, setNormalized ] = useState( false );
	const [ azimuth, setAzimuth ] = useRafState( 0 );
	const [ elevation, setElevation ] = useRafState( 90 );
	const [ chartReady, setChartReady ] = useState( false );

	const responseOptions = useMemo( () => {
		if ( ! responseCount ) {
			return [];
		}
		return Array.from( { length: responseCount }, ( _, i ) => {
			const angle = computeResponseAngles( source, i );
			const label = angle
				? sprintf(
						/* translators: 1: response number, 2: azimuth angle, 3: elevation angle. */
						__( 'Response %1$d • Az %2$s / El %3$s', 'gll-info' ),
						i + 1,
						formatAngleDegrees(
							wrapAzimuth180( angle.meridianDeg )
						),
						formatAngleDegrees(
							parallelToElevation( angle.parallelDeg )
						)
				  )
				: sprintf(
						/* translators: %d: response number. */
						__( 'Response %d', 'gll-info' ),
						i + 1
				  );
			return { value: String( i ), label };
		} );
	}, [ source, responseCount ] );

	// Sync sliders to selected response index.
	useEffect( () => {
		const angle = computeResponseAngles( source, responseIndex );
		if ( angle ) {
			setAzimuth( wrapAzimuth180( angle.meridianDeg ) );
			setElevation( parallelToElevation( angle.parallelDeg ) );
		}
	}, [ source, responseIndex ] );

	const chartConfig = useMemo( () => {
		if ( ! responseCount ) {
			return null;
		}
		return buildSourceResponseChartConfig(
			source,
			responseIndex,
			phaseMode,
			normalized
		);
	}, [ source, responseCount, responseIndex, phaseMode, normalized ] );

	if ( ! responseCount ) {
		return (
			<div className="gll-empty-state gll-source-response-empty">
				{ __( 'No frequency response data available', 'gll-info' ) }
			</div>
		);
	}

	const currentAngle = computeResponseAngles( source, responseIndex );
	const responseSelectId = `gll-source-response-index-${ index }`;
	const phaseSelectId = `gll-source-response-phase-${ index }`;
	const normalizeId = `gll-source-response-normalize-${ index }`;
	const azimuthId = `gll-source-response-azimuth-${ index }`;
	const elevationId = `gll-source-response-elevation-${ index }`;

	return (
		<div className="gll-source-response-controls">
			<div className="gll-response-controls-row">
				<div className="gll-response-control">
					<label htmlFor={ responseSelectId }>
						{ __( 'Response:', 'gll-info' ) }
					</label>
					<select
						id={ responseSelectId }
						value={ String( responseIndex ) }
						onChange={ ( event ) =>
							setResponseIndex(
								parseInt( event.target.value, 10 )
							)
						}
					>
						{ responseOptions.map( ( opt ) => (
							<option key={ opt.value } value={ opt.value }>
								{ opt.label }
							</option>
						) ) }
					</select>
				</div>
				<div className="gll-response-control">
					<label htmlFor={ phaseSelectId }>
						{ __( 'Phase:', 'gll-info' ) }
					</label>
					<select
						id={ phaseSelectId }
						value={ phaseMode }
						onChange={ ( event ) =>
							setPhaseMode( event.target.value )
						}
					>
						<option value="unwrapped">
							{ __( 'Unwrapped', 'gll-info' ) }
						</option>
						<option value="wrapped">
							{ __( 'Wrapped', 'gll-info' ) }
						</option>
						<option value="group-delay">
							{ __( 'Group delay', 'gll-info' ) }
						</option>
					</select>
				</div>
				<div className="gll-response-control gll-response-toggle">
					<input
						id={ normalizeId }
						type="checkbox"
						checked={ normalized }
						onChange={ ( event ) =>
							setNormalized( event.target.checked )
						}
					/>
					<label htmlFor={ normalizeId }>
						{ __( 'Normalized', 'gll-info' ) }
					</label>
				</div>
			</div>
			<div className="gll-response-controls-row gll-response-sliders">
				<div className="gll-response-slider">
					<label htmlFor={ azimuthId }>
						{ __( 'Azimuth:', 'gll-info' ) }
					</label>
					<input
						id={ azimuthId }
						type="range"
						min={ -180 }
						max={ 180 }
						step={ 1 }
						value={ azimuth }
						onChange={ ( event ) =>
							setAzimuth(
								parseInt( event.target.value, 10 ) || 0
							)
						}
					/>
					<span className="gll-response-angle-value">
						{ azimuth }°
					</span>
				</div>
				<div className="gll-response-slider">
					<label htmlFor={ elevationId }>
						{ __( 'Elevation:', 'gll-info' ) }
					</label>
					<input
						id={ elevationId }
						type="range"
						min={ -90 }
						max={ 90 }
						step={ 1 }
						value={ elevation }
						onChange={ ( event ) =>
							setElevation(
								parseInt( event.target.value, 10 ) || 0
							)
						}
					/>
					<span className="gll-response-angle-value">
						{ elevation }°
					</span>
				</div>
			</div>
			{ chartConfig ? (
				<>
					<div className="gll-source-response-chart">
						{ ! chartReady && (
							<div
								className="gll-chart-skeleton"
								aria-hidden="true"
							>
								<div className="gll-chart-skeleton-bar" />
								<div className="gll-chart-skeleton-bar" />
								<div className="gll-chart-skeleton-bar" />
							</div>
						) }
						<ChartWrapper
							config={ chartConfig }
							height={ 280 }
							className="gll-chart"
							onChartReady={ () => setChartReady( true ) }
						/>
					</div>
					<div className="gll-source-response-meta">
						<span className="gll-meta-badge">
							{ sprintf(
								/* translators: 1: current response number, 2: total number of responses. */
								__( 'Response %1$d of %2$d', 'gll-info' ),
								responseIndex + 1,
								responseCount
							) }
						</span>
						{ currentAngle && (
							<>
								<span className="gll-meta-badge">
									{ __( 'Azimuth', 'gll-info' ) }{ ' ' }
									{ formatAngleDegrees(
										wrapAzimuth180(
											currentAngle.meridianDeg
										)
									) }
								</span>
								<span className="gll-meta-badge">
									{ __( 'Off-axis', 'gll-info' ) }{ ' ' }
									{ formatAngleDegrees(
										currentAngle.parallelDeg
									) }
								</span>
							</>
						) }
						{ normalized && (
							<span className="gll-meta-badge gll-meta-badge-highlight">
								{ __( 'Normalized', 'gll-info' ) }
							</span>
						) }
					</div>
				</>
			) : (
				<div className="gll-empty-state gll-source-response-empty">
					{ __(
						'Unable to render response chart for this selection.',
						'gll-info'
					) }
				</div>
			) }
		</div>
	);
}

/**
 * Single source card component with collapsible details.
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.source        Source data.
 * @param {Array}    props.placements    Placement data for this source.
 * @param {number}   props.index         Source index.
 * @param {string}   props.displayMode   Display mode (compact, detailed, expandable).
 * @param {boolean}  props.showCharts    Whether to show response charts.
 * @param {boolean}  props.showResponses Whether to show the response summary.
 * @param {boolean}  props.isExpanded    Whether card is expanded.
 * @param {Function} props.onToggle      Toggle callback.
 * @return {JSX.Element} Source card component.
 */
function SourceCard( {
	source,
	placements = [],
	index,
	displayMode,
	showCharts,
	showResponses = true,
	isExpanded,
	onToggle,
} ) {
	const def = source.Definition || {};
	const balloon = def.BalloonData;
	const responseCount = source.Responses?.length || 0;
	const placementCount = placements.length;

	// Cache the formatted bandwidth string so the formatFrequency calls are
	// only re-run when the underlying nominal bandwidth values change.
	const bandwidthLabel = useMemo( () => {
		const from = def.NominalBandwidthFrom;
		const to = def.NominalBandwidthTo;
		if ( ! from || ! to ) {
			return null;
		}
		return `${ formatFrequency( from ) } - ${ formatFrequency( to ) }`;
	}, [ def.NominalBandwidthFrom, def.NominalBandwidthTo ] );

	// Cache the formatted angular resolution per balloon definition.
	const resolutionLabel = useMemo( () => {
		if ( ! balloon ) {
			return null;
		}
		const meridian = balloon.AngularResolution?.MeridianStep || 0;
		const parallel = balloon.AngularResolution?.ParallelStep || 0;
		return `${ meridian }° × ${ parallel }°`;
	}, [ balloon ] );

	// Pre-format placement rotation/position strings once per render rather
	// than re-computing inside the JSX map.
	const formattedPlacements = useMemo(
		() =>
			placements.map( ( placement ) => {
				const rotation = placement.rotation || {};
				const heading =
					rotation.Heading ??
					rotation.H ??
					rotation.Yaw ??
					rotation.Azimuth;
				const vertical =
					rotation.Vertical ??
					rotation.V ??
					rotation.Pitch ??
					rotation.Elevation;
				const roll = rotation.Roll ?? rotation.R;
				return {
					...placement,
					positionLabel: formatPosition( placement.position ),
					headingLabel: formatAngleDegrees( heading ),
					verticalLabel: formatAngleDegrees( vertical ),
					rollLabel: formatAngleDegrees( roll ),
				};
			} ),
		[ placements ]
	);

	const placementsList = (
		<div className="gll-source-placements">
			<details>
				<summary>
					{ sprintf(
						/* translators: %d: number of placements. */
						__( 'Placements (%d)', 'gll-info' ),
						placementCount
					) }
				</summary>
				<div className="gll-source-placements-list">
					{ placementCount === 0 && (
						<div className="gll-empty-state gll-source-placements-empty">
							{ __( 'No placements found', 'gll-info' ) }
						</div>
					) }
					{ formattedPlacements.map(
						( placement, placementIndex ) => (
							<div
								className="gll-source-placement"
								key={ placementIndex }
							>
								<div className="gll-source-placement-detail">
									<strong>
										{ __( 'Box:', 'gll-info' ) }
									</strong>
									{ placement.boxLabel }{ ' ' }
									{ placement.boxKey
										? `(${ placement.boxKey })`
										: '' }
								</div>
								<div className="gll-source-placement-detail">
									<strong>
										{ __( 'Source:', 'gll-info' ) }
									</strong>
									{ placement.sourceLabel ||
										placement.sourceKey }{ ' ' }
									({ placement.sourceKey })
								</div>
								<div className="gll-source-placement-detail">
									<strong>
										{ __( 'Position:', 'gll-info' ) }
									</strong>
									{ placement.positionLabel }
								</div>
								<div className="gll-source-placement-detail">
									<strong>
										{ __( 'Rotation:', 'gll-info' ) }
									</strong>{ ' ' }
									{ sprintf(
										/* translators: 1: heading angle, 2: vertical angle, 3: roll angle. */
										__(
											'H: %1$s, V: %2$s, R: %3$s',
											'gll-info'
										),
										placement.headingLabel,
										placement.verticalLabel,
										placement.rollLabel
									) }
								</div>
							</div>
						)
					) }
				</div>
			</details>
		</div>
	);

	// Compact mode: single line
	if ( displayMode === 'compact' ) {
		return (
			<div className="gll-source-card gll-source-compact">
				<div className="gll-source-header">
					<span className="gll-source-label">
						{ def.Label || source.Key }
					</span>
					<span className="gll-source-key">{ source.Key }</span>
					{ bandwidthLabel && (
						<span className="gll-source-bandwidth">
							{ bandwidthLabel }
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
							{ def.Label || __( 'Unknown', 'gll-info' ) }
						</span>
					</div>
					<span className="gll-source-key">{ source.Key }</span>
				</div>
				<div className="gll-source-content">
					<div className="gll-source-details">
						{ bandwidthLabel && (
							<div className="gll-source-detail">
								<strong>
									{ __( 'Bandwidth:', 'gll-info' ) }
								</strong>{ ' ' }
								{ bandwidthLabel }
							</div>
						) }
						<div className="gll-source-detail">
							<strong>{ __( 'Data Type:', 'gll-info' ) }</strong>{ ' ' }
							{ formatDataType( def.DataType ) }
						</div>
						{ showResponses && balloon && (
							<>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Responses:', 'gll-info' ) }
									</strong>{ ' ' }
									{ responseCount }
								</div>
								{ resolutionLabel && (
									<div className="gll-source-detail">
										<strong>
											{ __( 'Resolution:', 'gll-info' ) }
										</strong>{ ' ' }
										{ resolutionLabel }
									</div>
								) }
							</>
						) }
					</div>
					{ placementsList }
					{ showCharts && (
						<div className="gll-source-response">
							<SourceResponseControls
								source={ source }
								index={ index }
							/>
						</div>
					) }
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
						{ def.Label || __( 'Unknown', 'gll-info' ) }
					</span>
				</div>
				<span className="gll-source-key">{ source.Key }</span>
			</button>
			{ isExpanded && (
				<div className="gll-source-content">
					<div className="gll-source-details">
						{ bandwidthLabel && (
							<div className="gll-source-detail">
								<strong>
									{ __( 'Bandwidth:', 'gll-info' ) }
								</strong>{ ' ' }
								{ bandwidthLabel }
							</div>
						) }
						<div className="gll-source-detail">
							<strong>{ __( 'Data Type:', 'gll-info' ) }</strong>{ ' ' }
							{ formatDataType( def.DataType ) }
						</div>
						{ showResponses && balloon && (
							<>
								<div className="gll-source-detail">
									<strong>
										{ __( 'Responses:', 'gll-info' ) }
									</strong>{ ' ' }
									{ responseCount }
								</div>
								{ resolutionLabel && (
									<div className="gll-source-detail">
										<strong>
											{ __( 'Resolution:', 'gll-info' ) }
										</strong>{ ' ' }
										{ resolutionLabel }
									</div>
								) }
							</>
						) }
					</div>
					{ placementsList }
					{ showCharts && (
						<div className="gll-source-response">
							<SourceResponseControls
								source={ source }
								index={ index }
							/>
						</div>
					) }
					{ ! showCharts && ! responseCount && (
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
 * @param {Object}  props               Component props.
 * @param {Object}  props.data          Parsed GLL data.
 * @param {string}  props.displayMode   Display mode (compact, detailed, expandable).
 * @param {boolean} props.showCharts    Whether to show response charts.
 * @param {boolean} props.showResponses Whether to show the response summary.
 * @return {JSX.Element} Sources list component.
 */
const VIRTUALIZATION_THRESHOLD = 20;
const VIRTUALIZATION_CHUNK_SIZE = 20;

function GLLSources( {
	data,
	displayMode = 'expandable',
	showCharts = false,
	showResponses = true,
} ) {
	const [ expandedSources, setExpandedSources ] = useState( {} );
	const placementsMap = useMemo(
		() => buildSourcePlacementsMap( data ),
		[ data ]
	);

	const sources = data?.Database?.SourceDefinitions;
	const totalSources = Array.isArray( sources ) ? sources.length : 0;
	const isVirtualized = totalSources > VIRTUALIZATION_THRESHOLD;
	const [ visibleCount, setVisibleCount ] = useState( () =>
		isVirtualized ? VIRTUALIZATION_CHUNK_SIZE : totalSources
	);
	const sentinelRef = useRef< HTMLDivElement | null >( null );

	// Reset visibleCount whenever the underlying source list changes.
	useEffect( () => {
		setVisibleCount(
			totalSources > VIRTUALIZATION_THRESHOLD
				? VIRTUALIZATION_CHUNK_SIZE
				: totalSources
		);
	}, [ totalSources ] );

	// Reveal additional chunks as the sentinel scrolls into view.
	useEffect( () => {
		if ( ! isVirtualized || visibleCount >= totalSources ) {
			return undefined;
		}
		const sentinel = sentinelRef.current;
		if ( ! sentinel || typeof IntersectionObserver === 'undefined' ) {
			return undefined;
		}

		const observer = new IntersectionObserver(
			( entries ) => {
				if ( entries[ 0 ]?.isIntersecting ) {
					setVisibleCount( ( current ) =>
						Math.min(
							current + VIRTUALIZATION_CHUNK_SIZE,
							totalSources
						)
					);
				}
			},
			{ rootMargin: '200px 0px' }
		);
		observer.observe( sentinel );
		return () => observer.disconnect();
	}, [ isVirtualized, visibleCount, totalSources ] );

	if ( ! totalSources ) {
		return (
			<div className="gll-sources">
				<div className="gll-empty-state">
					{ __( 'No source definitions found', 'gll-info' ) }
				</div>
			</div>
		);
	}

	const handleToggle = ( index ) => {
		setExpandedSources( ( prev ) => ( {
			...prev,
			[ index ]: ! prev[ index ],
		} ) );
	};

	const visibleSources = isVirtualized
		? sources.slice( 0, visibleCount )
		: sources;
	const hasMore = isVirtualized && visibleCount < totalSources;

	return (
		<div className="gll-sources">
			<h4>
				{ sprintf(
					/* translators: %d: number of acoustic sources. */
					__( 'Acoustic Sources (%d)', 'gll-info' ),
					totalSources
				) }
			</h4>
			<div className="gll-sources-list">
				{ visibleSources.map( ( source, index ) => (
					<SourceCard
						key={ index }
						source={ source }
						index={ index }
						displayMode={ displayMode }
						showCharts={ showCharts }
						showResponses={ showResponses }
						placements={ placementsMap.get( source.Key ) || [] }
						isExpanded={ expandedSources[ index ] || false }
						onToggle={ () => handleToggle( index ) }
					/>
				) ) }
				{ hasMore && (
					<div
						ref={ sentinelRef }
						className="gll-sources-sentinel"
						role="status"
					>
						{ __( 'Loading more sources…', 'gll-info' ) }{ ' ' }
						<span className="gll-sources-sentinel-progress">
							{ sprintf(
								/* translators: 1: number of sources rendered so far, 2: total number of sources. */
								__( '(%1$d / %2$d)', 'gll-info' ),
								visibleCount,
								totalSources
							) }
						</span>
					</div>
				) }
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
		fileUrl,
		fileName,
		showOverview,
		showSources,
		sourcesDisplayMode,
		showSourceResponseCharts,
		showResponses,
		appearance,
	} = attributes;
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );

	const blockProps = useBlockProps( {
		className: `gll-info-block ${ appearanceClass( appearance ) }`,
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
								label={ __( 'Show Responses', 'gll-info' ) }
								checked={ showResponses }
								onChange={ ( value ) =>
									setAttributes( { showResponses: value } )
								}
								help={ __(
									'Display the response count and angular resolution for each source. Applies to the editor and the published page.',
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
									'Display frequency response controls and chart for each source. Editor preview only.',
									'gll-info'
								) }
							/>
						</>
					) }
				</PanelBody>

				<AppearanceControl
					appearance={ appearance }
					onChange={ ( value ) =>
						setAttributes( { appearance: value } )
					}
				/>
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
						<span>{ __( 'Parsing GLL file…', 'gll-info' ) }</span>
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
								showResponses={ showResponses }
							/>
						) }
					</div>
				) }
			</div>
		</>
	);
}
