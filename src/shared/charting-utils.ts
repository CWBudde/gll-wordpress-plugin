/**
 * Charting utilities for frequency response visualization.
 *
 * Ported from gll-tools web demo charting module.
 *
 * @package
 */

import { buildLogFrequencies, frequenciesMatch } from './polar-utils';

/**
 * Build frequency data points for Chart.js.
 *
 * @param {Array} frequencies Array of frequency values.
 * @param {Array} values      Array of corresponding values.
 * @return {Object|null} Object with points array, minFrequency, maxFrequency.
 */
export function buildFrequencyPoints( frequencies, values ) {
	if ( ! Array.isArray( frequencies ) || ! Array.isArray( values ) ) {
		return null;
	}
	if ( frequencies.length === 0 || values.length === 0 ) {
		return null;
	}
	if ( frequencies.length !== values.length ) {
		return null;
	}

	const minFrequency = Math.min( ...frequencies );
	const maxFrequency = Math.max( ...frequencies );

	if (
		! Number.isFinite( minFrequency ) ||
		! Number.isFinite( maxFrequency )
	) {
		return null;
	}

	const points = frequencies.map( ( freq, i ) => ( {
		x: freq,
		y: values[ i ],
	} ) );

	return { points, minFrequency, maxFrequency };
}

/**
 * Build logarithmic frequency scale for Chart.js X-axis.
 *
 * @param {number} minFrequency Minimum frequency value.
 * @param {number} maxFrequency Maximum frequency value.
 * @param {string} label        Axis label text.
 * @return {Object} Chart.js scale configuration.
 */
export function buildLogFrequencyScale( minFrequency, maxFrequency, label ) {
	return {
		type: 'logarithmic',
		title: {
			display: true,
			text: label,
		},
		ticks: {
			autoSkip: false,
			callback: ( value ) => {
				const numericValue = Number( value );
				return isPowerOfTen( numericValue )
					? formatFrequencyShort( numericValue )
					: '';
			},
		},
		min: minFrequency,
		max: maxFrequency,
		afterBuildTicks: ( scale ) => {
			scale.ticks = buildLogTicks( scale.min, scale.max );
		},
	};
}

/**
 * Get phase series data based on mode.
 *
 * @param {string} mode        Phase mode: 'wrapped', 'unwrapped', 'group-delay'.
 * @param {Array}  frequencies Frequency array.
 * @param {Array}  phase       Raw phase values.
 * @param {Array}  unwrapped   Unwrapped phase values.
 * @return {Object} Phase series with values, label, axisTitle, format function.
 */
export function getPhaseSeries( mode, frequencies, phase, unwrapped ) {
	switch ( mode ) {
		case 'wrapped': {
			const wrapped = phase.map( ( value ) => wrapPhase( value ) );
			return {
				values: wrapped,
				label: 'Phase (rad)',
				axisTitle: 'Phase (rad)',
				format: ( value ) => formatNumber( value, 4 ),
			};
		}
		case 'group-delay': {
			const delayMs = computeGroupDelayMs( frequencies, unwrapped );
			return {
				values: delayMs,
				label: 'Group Delay (ms)',
				axisTitle: 'Group Delay (ms)',
				format: ( value ) => formatNumber( value, 3 ),
			};
		}
		case 'unwrapped':
		default:
			return {
				values: unwrapped,
				label: 'Phase (rad)',
				axisTitle: 'Phase (rad)',
				format: ( value ) => formatNumber( value, 4 ),
			};
	}
}

/**
 * Unwrap phase array to continuous values.
 *
 * @param {Array} phase Raw phase values.
 * @return {Array} Unwrapped phase values.
 */
export function unwrapPhase( phase ) {
	if ( ! Array.isArray( phase ) || phase.length === 0 ) {
		return [];
	}

	const unwrapped = [ phase[ 0 ] ];
	let offset = 0;

	for ( let i = 1; i < phase.length; i++ ) {
		const delta = phase[ i ] - phase[ i - 1 ];
		if ( delta > Math.PI ) {
			offset -= 2 * Math.PI;
		} else if ( delta < -Math.PI ) {
			offset += 2 * Math.PI;
		}
		unwrapped.push( phase[ i ] + offset );
	}

	return unwrapped;
}

/**
 * Wrap phase value to [-π, π] range.
 *
 * @param {number} value Phase value.
 * @return {number|null} Wrapped phase value.
 */
export function wrapPhase( value ) {
	if ( value === null || value === undefined ) {
		return null;
	}
	const twoPi = 2 * Math.PI;
	const wrapped =
		( ( ( ( value + Math.PI ) % twoPi ) + twoPi ) % twoPi ) - Math.PI;
	return wrapped;
}

/**
 * Compute group delay in milliseconds from phase data.
 *
 * @param {Array} frequencies    Frequency array.
 * @param {Array} phaseUnwrapped Unwrapped phase array.
 * @return {Array} Group delay values in milliseconds.
 */
export function computeGroupDelayMs( frequencies, phaseUnwrapped ) {
	if ( ! Array.isArray( frequencies ) || frequencies.length === 0 ) {
		return [];
	}

	const count = Math.min( frequencies.length, phaseUnwrapped.length );
	const delays = new Array( count );
	const scale = -1 / ( 2 * Math.PI );

	for ( let i = 0; i < count; i++ ) {
		let dPhi;
		let dF;

		if ( i === 0 ) {
			dPhi = phaseUnwrapped[ i + 1 ] - phaseUnwrapped[ i ];
			dF = frequencies[ i + 1 ] - frequencies[ i ];
		} else if ( i === count - 1 ) {
			dPhi = phaseUnwrapped[ i ] - phaseUnwrapped[ i - 1 ];
			dF = frequencies[ i ] - frequencies[ i - 1 ];
		} else {
			dPhi = phaseUnwrapped[ i + 1 ] - phaseUnwrapped[ i - 1 ];
			dF = frequencies[ i + 1 ] - frequencies[ i - 1 ];
		}

		if ( ! dF || dF === 0 || Number.isNaN( dF ) || Number.isNaN( dPhi ) ) {
			delays[ i ] = null;
			continue;
		}

		const delaySeconds = scale * ( dPhi / dF );
		delays[ i ] = delaySeconds * 1000; // Convert to milliseconds
	}

	return delays;
}

/**
 * Shift phase values by a fixed delay (seconds) at each frequency.
 *
 * @param {Array}  phaseValues  Phase values in radians.
 * @param {Array}  frequencies  Matching frequency array.
 * @param {number} delaySeconds Delay in seconds.
 * @return {Array} Delay-adjusted phase values.
 */
export function applyDelayToPhase( phaseValues, frequencies, delaySeconds ) {
	if ( ! delaySeconds ) {
		return phaseValues;
	}
	if ( ! Array.isArray( phaseValues ) || ! Array.isArray( frequencies ) ) {
		return phaseValues;
	}
	if ( phaseValues.length !== frequencies.length ) {
		return phaseValues;
	}
	const factor = 2 * Math.PI * delaySeconds;
	return phaseValues.map( ( value, i ) => value - frequencies[ i ] * factor );
}

/**
 * Build logarithmic tick marks for frequency axis.
 *
 * @param {number} min Minimum frequency.
 * @param {number} max Maximum frequency.
 * @return {Array} Array of tick objects.
 */
export function buildLogTicks( min, max ) {
	if ( ! min || ! max || min <= 0 || max <= 0 ) {
		return [];
	}

	const ticks = [];
	const startPower = Math.max( 1, Math.floor( Math.log10( min ) ) );
	const endPower = Math.ceil( Math.log10( max ) );

	for ( let power = startPower; power <= endPower; power++ ) {
		const decade = Math.pow( 10, power );
		for ( let multiplier = 1; multiplier <= 9; multiplier++ ) {
			const value = multiplier * decade;
			if ( value < min || value > max ) {
				continue;
			}
			ticks.push( { value } );
		}
	}

	return ticks;
}

/**
 * Format frequency value for display (short form).
 *
 * @param {number} hz Frequency in Hz.
 * @return {string} Formatted frequency string.
 */
function formatFrequencyShort( hz ) {
	if ( ! hz || hz === 0 ) {
		return '-';
	}
	if ( hz >= 1000 ) {
		return ( hz / 1000 ).toFixed( 1 ) + 'k';
	}
	return hz.toFixed( 0 );
}

/**
 * Check if value is a power of ten.
 *
 * @param {number} value Numeric value.
 * @return {boolean} True if value is a power of ten.
 */
function isPowerOfTen( value ) {
	if ( ! value || value <= 0 ) {
		return false;
	}
	const exponent = Math.log10( value );
	return Number.isInteger( exponent );
}

/**
 * Format number with specified decimal places.
 *
 * @param {number} value  Numeric value.
 * @param {number} digits Number of decimal places.
 * @return {string} Formatted number string.
 */
function formatNumber( value, digits ) {
	if ( value === null || value === undefined || Number.isNaN( value ) ) {
		return '-';
	}
	return Number( value ).toFixed( digits );
}

/**
 * Pick first defined value from an object using a list of candidate keys.
 *
 * @param {Object} obj  Source object.
 * @param {Array}  keys Candidate property names.
 * @return {*} First defined value or undefined.
 */
function pick( obj, keys ) {
	if ( ! obj ) {
		return undefined;
	}
	for ( const key of keys ) {
		const value = obj[ key ];
		if ( value !== undefined && value !== null ) {
			return value;
		}
	}
	return undefined;
}

/**
 * Build chart-ready series for a single response of a source.
 *
 * Mirrors gll-tools' renderSourceResponseChart logic: optionally combines
 * directivity with on-axis spectrum, applies response/on-axis delay to phase,
 * and produces the requested phase representation (wrapped/unwrapped/group-delay).
 *
 * @param {Object}  source        Source definition with Responses + Definition.
 * @param {number}  responseIndex Response index to extract.
 * @param {string}  phaseMode     'unwrapped' | 'wrapped' | 'group-delay'.
 * @param {boolean} normalized    If true, do not combine on-axis (directivity only).
 * @return {Object|null} Series data with frequencies, level, phase, label flags.
 */
export function buildSourceResponseSeries(
	source,
	responseIndex,
	phaseMode = 'unwrapped',
	normalized = false
) {
	const responses = source?.Responses || source?.responses;
	const response = Array.isArray( responses )
		? responses[ responseIndex ]
		: null;
	if ( ! response ) {
		return null;
	}

	const frequencies =
		pick( response, [ 'Frequencies', 'frequencies' ] ) || [];
	const level = pick( response, [ 'Level', 'level', 'Levels' ] ) || [];
	const rawPhase = pick( response, [ 'Phase', 'phase' ] ) || [];

	if ( ! frequencies.length || ! level.length ) {
		return null;
	}

	const def = source?.Definition || source?.definition;
	const onAxis = pick( def, [ 'OnAxisSpectrum', 'on_axis_spectrum' ] );
	const onAxisDef = pick( onAxis, [ 'Definition', 'definition' ] );
	const onAxisLevel = pick( onAxis, [ 'Level', 'level' ] );
	const onAxisPhase = pick( onAxis, [ 'Phase', 'phase' ] );
	const onAxisFreqs = onAxisDef
		? buildLogFrequencies( onAxisDef, onAxisLevel?.length )
		: null;

	const canCombineOnAxis =
		! normalized &&
		Array.isArray( onAxisLevel ) &&
		Array.isArray( onAxisFreqs ) &&
		frequencies.length === onAxisFreqs.length &&
		level.length === onAxisLevel.length &&
		frequenciesMatch( frequencies, onAxisFreqs );

	const levelSeries = canCombineOnAxis
		? level.map( ( value, i ) => value + onAxisLevel[ i ] )
		: level.slice();

	const canCombinePhase =
		canCombineOnAxis &&
		Array.isArray( onAxisPhase ) &&
		rawPhase.length > 0 &&
		rawPhase.length === onAxisPhase.length;

	const combinedPhase = canCombinePhase
		? rawPhase.map( ( value, i ) => value + onAxisPhase[ i ] )
		: rawPhase.slice();

	const responseDelay = Number.isFinite( response.Delay || response.delay )
		? response.Delay ?? response.delay
		: 0;
	const onAxisDelay =
		canCombinePhase && Number.isFinite( onAxis?.Delay || onAxis?.delay )
			? onAxis.Delay ?? onAxis.delay
			: 0;
	const combinedDelay = responseDelay + onAxisDelay;

	const delayAdjustedPhase = applyDelayToPhase(
		combinedPhase,
		frequencies,
		combinedDelay
	);
	const unwrappedPhase = unwrapPhase( delayAdjustedPhase );
	const phaseSeries = getPhaseSeries(
		phaseMode,
		frequencies,
		delayAdjustedPhase,
		unwrappedPhase
	);

	return {
		frequencies,
		level: levelSeries,
		phase: phaseSeries.values,
		phaseLabel: phaseSeries.label,
		phaseAxisTitle: phaseSeries.axisTitle,
		canCombineOnAxis: !! canCombineOnAxis,
		canCombinePhase: !! canCombinePhase,
	};
}

/**
 * Build a Chart.js configuration object for a per-source frequency response chart.
 *
 * @param {Object}  source        Source definition.
 * @param {number}  responseIndex Response index.
 * @param {string}  phaseMode     'unwrapped' | 'wrapped' | 'group-delay'.
 * @param {boolean} normalized    If true, do not combine on-axis.
 * @return {Object|null} Chart.js config or null.
 */
export function buildSourceResponseChartConfig(
	source,
	responseIndex,
	phaseMode = 'unwrapped',
	normalized = false
) {
	const series = buildSourceResponseSeries(
		source,
		responseIndex,
		phaseMode,
		normalized
	);
	if ( ! series ) {
		return null;
	}

	const levelData = buildFrequencyPoints( series.frequencies, series.level );
	if ( ! levelData ) {
		return null;
	}

	const phaseData = buildFrequencyPoints( series.frequencies, series.phase );

	const xScale = buildLogFrequencyScale(
		levelData.minFrequency,
		levelData.maxFrequency,
		'Frequency'
	);

	const phaseLabel = series.canCombinePhase
		? `${ series.phaseLabel } (on-axis + directivity)`
		: series.phaseLabel;

	const levelLabel = series.canCombineOnAxis
		? 'Level (dB, on-axis + directivity)'
		: 'Level (dB)';

	return {
		type: 'line',
		data: {
			datasets: [
				{
					label: levelLabel,
					data: levelData.points,
					borderColor: '#2563eb',
					backgroundColor: 'rgba(37, 99, 235, 0.1)',
					fill: true,
					tension: 0.3,
					pointRadius: 0,
					yAxisID: 'y',
				},
				{
					label: phaseLabel,
					data: phaseData ? phaseData.points : [],
					borderColor: '#dc2626',
					backgroundColor: 'transparent',
					tension: 0.3,
					pointRadius: 0,
					yAxisID: 'y1',
				},
			],
		},
		options: {
			interaction: {
				mode: 'index',
				intersect: false,
			},
			scales: {
				x: xScale,
				y: {
					type: 'linear',
					display: true,
					position: 'left',
					title: {
						display: true,
						text: 'Level (dB)',
					},
				},
				y1: {
					type: 'linear',
					display: true,
					position: 'right',
					title: {
						display: true,
						text: series.phaseAxisTitle,
					},
					grid: {
						drawOnChartArea: false,
					},
				},
			},
			plugins: {
				legend: {
					position: 'top',
				},
				tooltip: {
					callbacks: {
						title: ( items ) => {
							const value = items?.[ 0 ]?.parsed?.x;
							return value ? formatFrequency( value ) : '';
						},
					},
				},
			},
		},
	};
}

/**
 * Format frequency value for tooltip display.
 *
 * @param {number} hz Frequency in Hz.
 * @return {string} Formatted frequency string.
 */
export function formatFrequency( hz ) {
	if ( ! hz || hz === 0 ) {
		return '-';
	}
	if ( hz >= 1000 ) {
		return ( hz / 1000 ).toFixed( 2 ) + ' kHz';
	}
	return hz.toFixed( 1 ) + ' Hz';
}
