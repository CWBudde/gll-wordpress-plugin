/**
 * Derive the configuration rows from normalized GLL data.
 *
 * This lives next to the block rather than in `src/shared/`, following the
 * precedent set by `src/resources/resource-model.ts` and
 * `src/geometry/scene-builder.ts`: the only consumers are this block's two
 * entry points, and `src/shared/` is for things more than one block reaches
 * for.
 *
 * The module is deliberately pure — no DOM, no React, no WordPress imports — so
 * every derivation (section order, badges, the unit attached to a limit value)
 * is decided once and tested once, leaving `edit.tsx` and `config-render.ts` as
 * dumb templates over identical data. That is what keeps the editor preview and
 * the front end from drifting apart, since they cannot share markup.
 *
 * @package
 */

import { formatFrequency } from '../shared/charting-utils';

export type ConfigSectionKey =
	| 'box-types'
	| 'frames'
	| 'filter-groups'
	| 'limits'
	| 'warnings';

export interface ConfigEntry {
	/** Stable key for React and for DOM ids. */
	id: string;
	/** Primary line. */
	title: string;
	/** Secondary line, present only when it adds something to the title. */
	subtitle?: string;
	/** Short state flags, e.g. 'Flown' or 'Bypassed'. */
	badges?: string[];
	/** Pre-formatted lines, each already joined with ' • '. */
	details: string[];
	/** Filter definitions inside a filter group. */
	children?: ConfigEntry[];
}

export interface ConfigSection {
	key: ConfigSectionKey;
	title: string;
	entries: ConfigEntry[];
	count: number;
	isEmpty: boolean;
}

export interface CollectOptions {
	showBoxTypes?: boolean;
	showFrames?: boolean;
	showFilterGroups?: boolean;
	showLimits?: boolean;
	showWarnings?: boolean;
	showGeometrySummary?: boolean;
	showFilterDetails?: boolean;
	showPinPoints?: boolean;
}

export interface CollectedConfig {
	/** Only the toggled-on sections, always in the fixed order. */
	sections: ConfigSection[];
	/** True when every included section is empty. */
	isEmpty: boolean;
}

/**
 * The marker every formatter falls back to, so that a missing field reads as
 * deliberately absent rather than as an empty string or a stray zero.
 */
const NONE = '-';

/** Delay below one millisecond reads better in microseconds. */
const MILLISECOND = 0.001;

/** GLL label fields are fixed-width; a runaway one must not blow out a row. */
const MAX_TEXT_LENGTH = 120;

// eslint-disable-next-line no-control-regex -- fixed-width GLL strings carry
// NUL padding and stray control bytes that must never reach the DOM.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

/**
 * Coerce a candidate to a finite number, or to NaN.
 *
 * `Number()` alone will not do: it maps null, '' and [] to 0, and a field the
 * parser never filled in would then print as a deliberate zero. Only an actual
 * number or a numeric string counts.
 *
 * @param {*} value Candidate number.
 * @return {number} The number, or NaN when there is no usable value.
 */
function toFinite( value: any ): number {
	if ( typeof value === 'number' ) {
		return Number.isFinite( value ) ? value : NaN;
	}

	if ( typeof value === 'string' && value.trim() !== '' ) {
		const parsed = Number( value );
		return Number.isFinite( parsed ) ? parsed : NaN;
	}

	return NaN;
}

/**
 * Format a finite number, or the "no value" marker.
 *
 * Every other formatter funnels through this one so that no code path can emit
 * `NaN` or `undefined` into a detail line.
 *
 * @param {*}      value  Candidate number.
 * @param {number} digits Fraction digits.
 * @return {string} Formatted number, or '-' when there is no usable value.
 */
export function formatNumber( value: any, digits: number = 2 ): string {
	const numeric = toFinite( value );

	if ( Number.isNaN( numeric ) ) {
		return NONE;
	}

	return numeric.toFixed( digits );
}

/**
 * Format a mass in kilograms.
 *
 * @param {*} kg Mass in kilograms.
 * @return {string} Formatted mass, or '-'.
 */
export function formatWeight( kg: any ): string {
	const text = formatNumber( kg, 2 );

	return text === NONE ? NONE : `${ text } kg`;
}

/**
 * Format an angle in degrees.
 *
 * @param {*} deg Angle in degrees.
 * @return {string} Formatted angle, or '-'.
 */
export function formatAngle( deg: any ): string {
	const text = formatNumber( deg, 1 );

	return text === NONE ? NONE : `${ text }°`;
}

/**
 * Format a gain in decibels.
 *
 * Unity gain is by far the most common value in the corpus, and '+0.0 dB'
 * reads as a deliberate setting rather than "untouched", so zero is spelled
 * exactly '0 dB'. Everything else is signed, because the sign is the whole
 * point of a gain.
 *
 * @param {*} db Gain in decibels.
 * @return {string} Formatted gain, or '-'.
 */
export function formatGain( db: any ): string {
	const numeric = toFinite( db );

	if ( Number.isNaN( numeric ) ) {
		return NONE;
	}

	if ( numeric === 0 ) {
		return '0 dB';
	}

	const sign = numeric > 0 ? '+' : '';

	return `${ sign }${ numeric.toFixed( 1 ) } dB`;
}

/**
 * Format a delay held in seconds.
 *
 * The parser stores delays in seconds, but filter delays are a millisecond or
 * less, so seconds would print as a wall of zeroes. Zero delay is not a
 * setting worth a row, so it collapses to the "no value" marker and the
 * callers drop it.
 *
 * @param {*} seconds Delay in seconds.
 * @return {string} Formatted delay, or '-'.
 */
export function formatDelay( seconds: any ): string {
	const numeric = toFinite( seconds );

	if ( Number.isNaN( numeric ) || numeric === 0 ) {
		return NONE;
	}

	if ( Math.abs( numeric ) >= MILLISECOND ) {
		return `${ ( numeric * 1000 ).toFixed( 2 ) } ms`;
	}

	return `${ ( numeric * 1000000 ).toFixed( 1 ) } µs`;
}

/**
 * Format a sample rate held in hertz.
 *
 * Whole multiples of a kilohertz lose the pointless '.0' — 48 kHz is what the
 * engineer wrote — while 44.1 kHz keeps the decimal that identifies it.
 *
 * @param {*} hz Sample rate in hertz.
 * @return {string} Formatted sample rate, or '-'.
 */
export function formatSampleRate( hz: any ): string {
	const numeric = toFinite( hz );

	if ( Number.isNaN( numeric ) || numeric <= 0 ) {
		return NONE;
	}

	const digits = numeric % 1000 === 0 ? 0 : 1;

	return `${ ( numeric / 1000 ).toFixed( digits ) } kHz`;
}

/**
 * Attach the unit a rigging limit's type implies.
 *
 * The reference demo prints the raw number here, so a maximum weight and a
 * maximum box count are shown identically and the reader has to know the enum
 * to tell them apart. The type is right there in the record, so the unit is
 * derivable and this fixes that.
 *
 * Deliberately NOT shared with `formatWarningValue`: the two enums number
 * differently, and merging them would silently mislabel every tilt limit. See
 * the note on `LIMIT_TYPE_LABELS` in `src/shared/gll-normalize.ts`.
 *
 * @param {*} type  Raw limit type integer.
 * @param {*} value Raw limit value.
 * @return {string} Formatted value with its unit, or '-'.
 */
export function formatLimitValue( type: any, value: any ): string {
	switch ( toFinite( type ) ) {
		case 2:
			return formatWeight( value );
		case 4:
		case 5:
			return formatAngle( value );
		case 0:
		case 1:
		case 6:
			return formatNumber( value, 0 );
		default:
			return formatNumber( value );
	}
}

/**
 * Attach the unit a rigging warning's type implies.
 *
 * The warning enum is NOT the limit enum: weight is 2 in both, but tilt is
 * 3/4 here against 4/5 there. Reusing `formatLimitValue` would print a tilt
 * warning in kilograms.
 *
 * @param {*} type  Raw warning type integer.
 * @param {*} value Raw warning value.
 * @return {string} Formatted value with its unit, or '-'.
 */
export function formatWarningValue( type: any, value: any ): string {
	switch ( toFinite( type ) ) {
		case 2:
			return formatWeight( value );
		case 3:
		case 4:
			return formatAngle( value );
		case 0:
		case 1:
			return formatNumber( value, 0 );
		default:
			return formatNumber( value );
	}
}

/**
 * Summarize a case geometry in one line.
 *
 * The counts are read off the normalized `Vertices`/`Edges`/`Faces` arrays,
 * which have already had unrenderable entries filtered out, so this block and
 * the 3D geometry block can never disagree about the same mesh.
 *
 * @param {Object} geometry Normalized case geometry.
 * @return {string} Summary line, or an empty string when there is no geometry.
 */
export function formatGeometrySummary( geometry: any ): string {
	if ( ! geometry ) {
		return '';
	}

	const parts = [
		`${ ( geometry.Vertices || [] ).length } vertices`,
		`${ ( geometry.Edges || [] ).length } edges`,
		`${ ( geometry.Faces || [] ).length } faces`,
	];

	if ( geometry.IsSymmetric ) {
		const axis = formatNumber( geometry.SymmetryAxis, 3 );
		parts.push( axis === NONE ? 'Symmetric' : `Symmetric @ X=${ axis }` );
	} else {
		parts.push( 'Asymmetric' );
	}

	return parts.join( ' • ' );
}

/**
 * Reduce a file-derived string to something safe to render.
 *
 * GLL label and key fields are fixed-width records, so they arrive padded with
 * NUL bytes and the occasional stray control byte. Truncation happens here
 * rather than in the normalizer because it is a presentation decision: the
 * full string still belongs to anything that wants to match on it.
 *
 * @param {*} value Candidate string.
 * @return {string} Display-safe text, possibly empty.
 */
export function sanitizeDisplayText( value: any ): string {
	if ( value === null || value === undefined ) {
		return '';
	}

	const stripped = String( value ).replace( CONTROL_CHARACTERS, '' ).trim();

	if ( stripped.length <= MAX_TEXT_LENGTH ) {
		return stripped;
	}

	return `${ stripped.slice( 0, MAX_TEXT_LENGTH - 1 ) }…`;
}

/**
 * Format a point as a bare coordinate triple.
 *
 * @param {Object} point Normalized point, or null.
 * @return {string} 'x, y, z', or '-' when any component is missing.
 */
export function formatPoint( point: any ): string {
	if ( ! point ) {
		return NONE;
	}

	const parts = [ point.x, point.y, point.z ].map( ( value ) =>
		formatNumber( value, 3 )
	);

	if ( parts.some( ( part ) => part === NONE ) ) {
		return NONE;
	}

	return parts.join( ', ' );
}

/**
 * Join detail parts, dropping the ones that carry no value.
 *
 * @param {Array} parts Candidate parts.
 * @return {string} Joined line, possibly empty.
 */
function joinParts( parts: Array< string | false | null | undefined > ) {
	return parts.filter( Boolean ).join( ' • ' );
}

/**
 * Append a line to a detail list unless it is empty.
 *
 * @param {Array}  details Detail list, mutated in place.
 * @param {string} line    Candidate line.
 */
function pushLine( details: string[], line: string ) {
	if ( line ) {
		details.push( line );
	}
}

/**
 * Build a stable entry id.
 *
 * Keys are unique within a GLL section in practice, but nothing in the format
 * guarantees it and an unkeyed record is legal, so the index is the fallback.
 *
 * @param {string} scope Section or parent scope.
 * @param {string} key   Sanitized record key.
 * @param {string} label Sanitized record label.
 * @param {number} index Position in the source list.
 * @return {string} Entry id.
 */
function entryId(
	scope: string,
	key: string,
	label: string,
	index: number
): string {
	return key || label || `${ scope }-${ index }`;
}

/**
 * Find the case geometry belonging to a box type.
 *
 * Positions in `CaseGeometries` do NOT line up with `BoxTypes` — a box without
 * a geometry drops out of the flat list, and frame geometries are appended to
 * the same list. That is exactly why the normalizer makes every geometry carry
 * its owner, so this looks the owner up instead of indexing.
 *
 * @param {Array}  geometries Flat normalized geometry list.
 * @param {number} boxIndex   Index of the box in `Database.BoxTypes`.
 * @return {Object|null} The geometry, or null.
 */
function findBoxGeometry( geometries: any[], boxIndex: number ): any {
	return (
		geometries.find(
			( geometry ) =>
				geometry &&
				geometry.OwnerKind === 'box' &&
				geometry.BoxIndex === boxIndex
		) || null
	);
}

/**
 * Build the box type entries.
 *
 * @param {Array}   boxTypes   Normalized box types.
 * @param {Array}   geometries Flat normalized geometry list.
 * @param {boolean} showGeom   Include the geometry summary line.
 * @return {Object[]} Entries in source order.
 */
function buildBoxTypeEntries(
	boxTypes: any[],
	geometries: any[],
	showGeom: boolean
): ConfigEntry[] {
	return boxTypes.map( ( box, index ) => {
		const label = sanitizeDisplayText( box?.Label );
		const key = sanitizeDisplayText( box?.Key );
		const title = label || key || `Box Type ${ index + 1 }`;
		const weight = formatWeight( box?.Weight );
		const vertical = formatAngle( box?.VerticalOpeningAngle );
		const horizontal = formatAngle( box?.HorizontalOpeningAngle );

		const details: string[] = [];

		pushLine(
			details,
			joinParts( [
				key && `Key: ${ key }`,
				weight !== NONE && `Weight: ${ weight }`,
				vertical !== NONE && `Vertical Opening Angle: ${ vertical }`,
				horizontal !== NONE &&
					`Horizontal Opening Angle: ${ horizontal }`,
			] )
		);

		const sources = ( box?.Sources || [] )
			.map( ( source: any ) => sanitizeDisplayText( source ) )
			.filter( Boolean );

		const placements = ( box?.SourcePlacements || [] )
			.map( ( placement: any ) => {
				const placementLabel =
					sanitizeDisplayText( placement?.Label ) ||
					sanitizeDisplayText( placement?.Key );
				const definition = sanitizeDisplayText(
					placement?.SourceDefinitionKey
				);

				if ( placementLabel && definition ) {
					return `${ placementLabel } (${ definition })`;
				}

				return placementLabel || definition;
			} )
			.filter( Boolean );

		pushLine(
			details,
			joinParts( [
				sources.length > 0 && `Sources: ${ sources.join( ', ' ) }`,
				placements.length > 0 &&
					`Source Placements: ${ placements.join( ', ' ) }`,
			] )
		);

		if ( showGeom ) {
			pushLine(
				details,
				formatGeometrySummary( findBoxGeometry( geometries, index ) )
			);
		}

		return {
			id: entryId( 'box-types', key, label, index ),
			title,
			subtitle: key && key !== title ? `Key: ${ key }` : undefined,
			details,
		};
	} );
}

/**
 * Build the frame entries.
 *
 * @param {Array}   frames        Normalized frames.
 * @param {Array}   geometries    Flat normalized geometry list.
 * @param {boolean} showGeom      Include the geometry summary line.
 * @param {boolean} showPinPoints Include the pin point line.
 * @return {Object[]} Entries in source order.
 */
function buildFrameEntries(
	frames: any[],
	geometries: any[],
	showGeom: boolean,
	showPinPoints: boolean
): ConfigEntry[] {
	return frames.map( ( frame, index ) => {
		const label = sanitizeDisplayText( frame?.Label );
		const key = sanitizeDisplayText( frame?.Key );
		const title = label || key || `Frame ${ index + 1 }`;
		const weight = formatWeight( frame?.Weight );

		const details: string[] = [];

		pushLine(
			details,
			joinParts( [
				key && `Key: ${ key }`,
				weight !== NONE && `Weight: ${ weight }`,
			] )
		);

		if ( showGeom ) {
			const geometryIndex = frame?.CaseGeometryIndex;
			if ( Number.isFinite( geometryIndex ) && geometryIndex >= 0 ) {
				pushLine(
					details,
					formatGeometrySummary( geometries[ geometryIndex ] )
				);
			}
		}

		if ( showPinPoints ) {
			const pins = ( frame?.PinPoints || [] )
				.map( ( pin: any ) => {
					const pinLabel = sanitizeDisplayText( pin?.Label );
					const vector = formatPoint( pin?.Vector );

					if ( pinLabel && vector !== NONE ) {
						return `${ pinLabel } (${ vector })`;
					}

					return pinLabel || ( vector !== NONE ? vector : '' );
				} )
				.filter( Boolean );

			if ( pins.length > 0 ) {
				details.push( `Pin Points: ${ pins.join( ', ' ) }` );
			}
		}

		return {
			id: entryId( 'frames', key, label, index ),
			title,
			subtitle: key && key !== title ? `Key: ${ key }` : undefined,
			badges: [ frame?.IsFlown ? 'Flown' : 'Ground-stacked' ],
			details,
		};
	} );
}

/**
 * Describe one base filter inside a bank.
 *
 * `formatFrequency` is imported from the charting utils rather than
 * reimplemented so a crossover frequency reads the same here as it does on the
 * frequency response chart.
 *
 * @param {Object} filter Normalized generic filter.
 * @return {string} One detail line.
 */
function describeBaseFilter( filter: any ): string {
	const kind = sanitizeDisplayText( filter?.KindLabel );
	const parts: Array< string | false > = [];

	const iir = filter?.IIR;
	if ( iir ) {
		const shape = sanitizeDisplayText( iir.FilterShapeLabel );
		const frequency = formatFrequency( iir.FreqCritHz );
		const alignment = sanitizeDisplayText( iir.AlignmentLabel );
		const quality = formatNumber( iir.QFactor, 2 );

		parts.push(
			shape,
			Number.isFinite( iir.Order ) && `Order: ${ iir.Order }`,
			frequency !== NONE && `Freq: ${ frequency }`,
			// Q only means something for a Sallen-Key section; the field is
			// populated but ignored for the other shapes.
			iir.FilterShape === 3 && quality !== NONE && `Q: ${ quality }`,
			alignment && `Align: ${ alignment }`
		);
	}

	const fir = filter?.FIR;
	if ( fir ) {
		const sampleRate = formatSampleRate( fir.SampleRate );

		parts.push(
			fir.IsTimeResponse ? 'Time Domain' : 'Freq Domain',
			Boolean( fir.IsComplex ) && 'Complex',
			sampleRate !== NONE && `SR: ${ sampleRate }`,
			Number.isFinite( fir.CoefficientCount ) &&
				fir.CoefficientCount > 0 &&
				`${ fir.CoefficientCount } coefficients`
		);
	}

	const spectrum = filter?.LogSpectrum;
	if ( spectrum ) {
		const delay = formatDelay( spectrum.Delay );

		parts.push(
			Number.isFinite( spectrum.NumberOfBands ) &&
				`${ spectrum.NumberOfBands } bands`,
			Number.isFinite( spectrum.BandsPerOctave ) &&
				`${ spectrum.BandsPerOctave }/oct`,
			delay !== NONE && `Delay: ${ delay }`
		);
	}

	return joinParts( [ kind, ...parts ] );
}

/**
 * Build the child entries of one filter group.
 *
 * @param {Object}  group       Normalized filter group.
 * @param {string}  scope       Parent scope, used for fallback ids.
 * @param {boolean} showDetails Include one line per base filter.
 * @return {Object[]} Child entries in source order.
 */
function buildFilterEntries(
	group: any,
	scope: string,
	showDetails: boolean
): ConfigEntry[] {
	return ( group?.Filters || [] ).map( ( definition: any, index: number ) => {
		const label = sanitizeDisplayText( definition?.Label );
		const key = sanitizeDisplayText( definition?.Key );
		const title = label || key || `Filter ${ index + 1 }`;
		const bank = definition?.Bank;

		const badges = [
			bank?.Bypass && 'Bypassed',
			bank?.InvertPolarity && 'Inverted',
			bank?.MuteInput && 'Muted',
		].filter( Boolean ) as string[];

		const details: string[] = [];
		const gain = formatGain( bank?.Gain );
		const delay = formatDelay( bank?.Delay );

		pushLine(
			details,
			joinParts( [
				gain !== NONE && `Gain: ${ gain }`,
				delay !== NONE && `Delay: ${ delay }`,
			] )
		);

		if ( showDetails ) {
			( bank?.Filters || [] ).forEach( ( filter: any ) => {
				pushLine( details, describeBaseFilter( filter ) );
			} );
		}

		return {
			id: entryId( scope, key, label, index ),
			title,
			subtitle: key && key !== title ? `Key: ${ key }` : undefined,
			badges,
			details,
		};
	} );
}

/**
 * Build the filter group entries.
 *
 * @param {Array}   groups      Normalized filter groups.
 * @param {boolean} showDetails Include one line per base filter.
 * @return {Object[]} Entries in source order.
 */
function buildFilterGroupEntries(
	groups: any[],
	showDetails: boolean
): ConfigEntry[] {
	return groups.map( ( group, index ) => {
		const label = sanitizeDisplayText( group?.Label );
		const key = sanitizeDisplayText( group?.Key );
		const title = label || key || `Filter Group ${ index + 1 }`;
		const id = entryId( 'filter-groups', key, label, index );
		const children = buildFilterEntries( group, id, showDetails );

		return {
			id,
			title,
			subtitle: key && key !== title ? `Key: ${ key }` : undefined,
			badges: group?.IsOverridable ? [ 'Overridable' ] : [],
			details: [ `${ children.length } filters` ],
			children,
		};
	} );
}

/**
 * Build the rigging limit entries.
 *
 * @param {Array} limits Normalized limits.
 * @return {Object[]} Entries in source order.
 */
function buildLimitEntries( limits: any[] ): ConfigEntry[] {
	return limits.map( ( limit, index ) => {
		const title =
			sanitizeDisplayText( limit?.TypeLabel ) || `Limit ${ index + 1 }`;
		const value = formatLimitValue( limit?.Type, limit?.Value );
		const boxType = sanitizeDisplayText( limit?.BoxType );
		const frame = sanitizeDisplayText( limit?.Frame );

		const details: string[] = [];

		pushLine(
			details,
			joinParts( [
				value !== NONE && `Value: ${ value }`,
				boxType && `Box: ${ boxType }`,
				frame && `Frame: ${ frame }`,
			] )
		);

		return {
			id: `limits-${ index }`,
			title,
			details,
		};
	} );
}

/**
 * Build the rigging warning entries.
 *
 * @param {Array} warnings Normalized warnings.
 * @return {Object[]} Entries in source order.
 */
function buildWarningEntries( warnings: any[] ): ConfigEntry[] {
	return warnings.map( ( warning, index ) => {
		const title =
			sanitizeDisplayText( warning?.TypeLabel ) ||
			`Warning ${ index + 1 }`;
		const text = sanitizeDisplayText( warning?.Text );
		const value = formatWarningValue( warning?.Type, warning?.Value );

		const details: string[] = [];

		pushLine( details, text );

		// A warning that fires at zero is not a threshold anyone set, and the
		// corpus leaves the field at zero whenever the warning is text-only.
		if ( value !== NONE && toFinite( warning?.Value ) !== 0 ) {
			details.push( `Value: ${ value }` );
		}

		return {
			id: `warnings-${ index }`,
			title,
			details,
		};
	} );
}

/**
 * Wrap entries in a section descriptor.
 *
 * @param {string} key     Section key.
 * @param {string} title   Section heading.
 * @param {Array}  entries Section entries.
 * @return {Object} Section descriptor.
 */
function toSection(
	key: ConfigSectionKey,
	title: string,
	entries: ConfigEntry[]
): ConfigSection {
	return {
		key,
		title,
		entries,
		count: entries.length,
		isEmpty: entries.length === 0,
	};
}

/**
 * Read an array off the normalized database, tolerating anything.
 *
 * @param {*} value Candidate list.
 * @return {Array} The list, or an empty one.
 */
function toArray( value: any ): any[] {
	return Array.isArray( value ) ? value : [];
}

/**
 * Collect the configuration sections out of normalized GLL data.
 *
 * A section switched off is omitted entirely rather than returned empty, so a
 * renderer can iterate `sections` without re-checking the toggles, and
 * `isEmpty` answers the only question the empty state cares about: is there
 * anything at all to show given what the author asked for.
 *
 * @param {Object}  data                        Normalized GLL data.
 * @param {Object}  options                     Which sections to include.
 * @param {boolean} options.showBoxTypes        Include box types.
 * @param {boolean} options.showFrames          Include frames.
 * @param {boolean} options.showFilterGroups    Include filter groups.
 * @param {boolean} options.showLimits          Include rigging limits.
 * @param {boolean} options.showWarnings        Include rigging warnings.
 * @param {boolean} options.showGeometrySummary Add a geometry line to the
 *                                              box type and frame entries.
 * @param {boolean} options.showFilterDetails   Add a line per base filter.
 * @param {boolean} options.showPinPoints       Add a pin point line to frames.
 * @return {Object} Included sections, plus an emptiness flag.
 */
export function collectConfig(
	data: any,
	{
		showBoxTypes = true,
		showFrames = true,
		showFilterGroups = true,
		showLimits = true,
		showWarnings = true,
		showGeometrySummary = true,
		showFilterDetails = true,
		showPinPoints = false,
	}: CollectOptions = {}
): CollectedConfig {
	const database = data?.Database || {};
	const geometries = toArray( database.CaseGeometries );

	const sections: ConfigSection[] = [];

	if ( showBoxTypes ) {
		sections.push(
			toSection(
				'box-types',
				'Box Types',
				buildBoxTypeEntries(
					toArray( database.BoxTypes ),
					geometries,
					showGeometrySummary
				)
			)
		);
	}

	if ( showFrames ) {
		sections.push(
			toSection(
				'frames',
				'Frames',
				buildFrameEntries(
					toArray( database.Frames ),
					geometries,
					showGeometrySummary,
					showPinPoints
				)
			)
		);
	}

	if ( showFilterGroups ) {
		sections.push(
			toSection(
				'filter-groups',
				'Filter Groups',
				buildFilterGroupEntries(
					toArray( database.FilterGroups ),
					showFilterDetails
				)
			)
		);
	}

	if ( showLimits ) {
		sections.push(
			toSection(
				'limits',
				'Limits',
				buildLimitEntries( toArray( database.Limits ) )
			)
		);
	}

	if ( showWarnings ) {
		sections.push(
			toSection(
				'warnings',
				'Warnings',
				buildWarningEntries( toArray( database.Warnings ) )
			)
		);
	}

	return {
		sections,
		isEmpty: sections.every( ( section ) => section.isEmpty ),
	};
}
