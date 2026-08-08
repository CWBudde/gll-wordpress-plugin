/**
 * Unit tests for the configuration view model.
 *
 * The module is imported directly rather than through the `../shared` barrel;
 * the barrel pulls in three.js' untransformed ESM OrbitControls and breaks
 * under Jest. `config-model` itself only reaches into `../shared/charting-utils`
 * for `formatFrequency`, which is pure.
 */

import {
	formatNumber,
	formatWeight,
	formatAngle,
	formatGain,
	formatDelay,
	formatSampleRate,
	formatLimitValue,
	formatWarningValue,
	formatGeometrySummary,
	sanitizeDisplayText,
	formatPoint,
	collectConfig,
} from './config-model';
import type { ConfigEntry } from './config-model';

describe( 'formatNumber', () => {
	it( 'formats finite numbers at the requested precision', () => {
		expect( formatNumber( 9.9 ) ).toBe( '9.90' );
		expect( formatNumber( 12, 0 ) ).toBe( '12' );
		expect( formatNumber( -3.14159, 3 ) ).toBe( '-3.142' );
	} );

	it( 'returns the no-value marker rather than NaN', () => {
		expect( formatNumber( undefined ) ).toBe( '-' );
		expect( formatNumber( NaN ) ).toBe( '-' );
		expect( formatNumber( Infinity ) ).toBe( '-' );
		expect( formatNumber( 'abc' ) ).toBe( '-' );
	} );

	it( 'does not let an absent field masquerade as zero', () => {
		// `Number()` maps all three of these to 0, which would print as a
		// deliberate setting the file never made.
		expect( formatNumber( null ) ).toBe( '-' );
		expect( formatNumber( '' ) ).toBe( '-' );
		expect( formatGain( null ) ).toBe( '-' );
	} );
} );

describe( 'formatWeight', () => {
	it( 'appends kilograms to a finite mass', () => {
		expect( formatWeight( 9.9 ) ).toBe( '9.90 kg' );
		expect( formatWeight( 0 ) ).toBe( '0.00 kg' );
	} );

	it( 'returns the no-value marker for unusable input', () => {
		expect( formatWeight( undefined ) ).toBe( '-' );
		expect( formatWeight( NaN ) ).toBe( '-' );
	} );
} );

describe( 'formatAngle', () => {
	it( 'appends the degree sign at one decimal', () => {
		expect( formatAngle( 10 ) ).toBe( '10.0°' );
		expect( formatAngle( -7.25 ) ).toBe( '-7.3°' );
	} );

	it( 'returns the no-value marker for unusable input', () => {
		expect( formatAngle( undefined ) ).toBe( '-' );
	} );
} );

describe( 'formatGain', () => {
	it( 'spells unity gain as a bare zero', () => {
		// '+0.0 dB' would read as a deliberate boost.
		expect( formatGain( 0 ) ).toBe( '0 dB' );
	} );

	it( 'signs every non-zero gain', () => {
		expect( formatGain( 3.5 ) ).toBe( '+3.5 dB' );
		expect( formatGain( -6 ) ).toBe( '-6.0 dB' );
	} );

	it( 'returns the no-value marker for unusable input', () => {
		expect( formatGain( undefined ) ).toBe( '-' );
		expect( formatGain( NaN ) ).toBe( '-' );
	} );
} );

describe( 'formatDelay', () => {
	it( 'switches unit exactly at one millisecond', () => {
		expect( formatDelay( 0.001 ) ).toBe( '1.00 ms' );
		expect( formatDelay( 0.0009999 ) ).toBe( '999.9 µs' );
	} );

	it( 'uses milliseconds above the boundary', () => {
		expect( formatDelay( 0.0125 ) ).toBe( '12.50 ms' );
	} );

	it( 'uses microseconds below the boundary', () => {
		expect( formatDelay( 0.0005 ) ).toBe( '500.0 µs' );
	} );

	it( 'treats zero and unusable input as no value', () => {
		expect( formatDelay( 0 ) ).toBe( '-' );
		expect( formatDelay( undefined ) ).toBe( '-' );
		expect( formatDelay( NaN ) ).toBe( '-' );
	} );
} );

describe( 'formatSampleRate', () => {
	it( 'drops the decimal for whole kilohertz', () => {
		expect( formatSampleRate( 48000 ) ).toBe( '48 kHz' );
		expect( formatSampleRate( 96000 ) ).toBe( '96 kHz' );
	} );

	it( 'keeps the decimal that identifies 44.1 kHz', () => {
		expect( formatSampleRate( 44100 ) ).toBe( '44.1 kHz' );
	} );

	it( 'returns the no-value marker for zero and unusable input', () => {
		expect( formatSampleRate( 0 ) ).toBe( '-' );
		expect( formatSampleRate( undefined ) ).toBe( '-' );
		expect( formatSampleRate( NaN ) ).toBe( '-' );
	} );
} );

describe( 'formatLimitValue', () => {
	it( 'attaches the unit the limit type implies', () => {
		// The reference demo prints the bare number for all of these.
		expect( formatLimitValue( 2, 250 ) ).toBe( '250.00 kg' );
		expect( formatLimitValue( 4, 10 ) ).toBe( '10.0°' );
		expect( formatLimitValue( 5, -6 ) ).toBe( '-6.0°' );
		expect( formatLimitValue( 0, 24 ) ).toBe( '24' );
		expect( formatLimitValue( 1, 4 ) ).toBe( '4' );
		expect( formatLimitValue( 6, 2 ) ).toBe( '2' );
	} );

	it( 'falls back to a plain number for an unknown type', () => {
		expect( formatLimitValue( 99, 1.5 ) ).toBe( '1.50' );
		expect( formatLimitValue( undefined, undefined ) ).toBe( '-' );
	} );
} );

describe( 'formatWarningValue', () => {
	it( 'attaches the unit the warning type implies', () => {
		expect( formatWarningValue( 2, 250 ) ).toBe( '250.00 kg' );
		expect( formatWarningValue( 3, 10 ) ).toBe( '10.0°' );
		expect( formatWarningValue( 4, -6 ) ).toBe( '-6.0°' );
		expect( formatWarningValue( 0, 24 ) ).toBe( '24' );
		expect( formatWarningValue( 1, 2 ) ).toBe( '2' );
	} );

	it( 'falls back to a plain number for an unknown type', () => {
		expect( formatWarningValue( 99, 1.5 ) ).toBe( '1.50' );
	} );
} );

describe( 'the warning enum numbers differently from the limit enum', () => {
	it( 'agrees only on weight at type 2', () => {
		expect( formatWarningValue( 2, 250 ) ).toBe(
			formatLimitValue( 2, 250 )
		);
	} );

	it( 'diverges at type 3 and type 4, so the tables must not be shared', () => {
		// Limit 3 is unused and falls through to a plain number, while
		// warning 3 is Max Tilt.
		expect( formatLimitValue( 3, 10 ) ).toBe( '10.00' );
		expect( formatWarningValue( 3, 10 ) ).toBe( '10.0°' );

		// Limit 4 is Max Tilt Angle, warning 4 is Min Tilt Warning — both
		// degrees by luck, but 5 shows the shift.
		expect( formatLimitValue( 5, 3 ) ).toBe( '3.0°' );
		expect( formatWarningValue( 5, 3 ) ).toBe( '3.00' );

		// The count arms differ too: limit 6 is Min Count, warning 6 is not
		// defined at all.
		expect( formatLimitValue( 6, 3 ) ).toBe( '3' );
		expect( formatWarningValue( 6, 3 ) ).toBe( '3.00' );
	} );
} );

describe( 'formatGeometrySummary', () => {
	it( 'reports counts and the symmetry plane', () => {
		expect(
			formatGeometrySummary( {
				Vertices: new Array( 600 ).fill( 0 ),
				Edges: new Array( 300 ).fill( 0 ),
				Faces: [],
				IsSymmetric: true,
				SymmetryAxis: 0,
			} )
		).toBe( '600 vertices • 300 edges • 0 faces • Symmetric @ X=0.000' );
	} );

	it( 'reports asymmetry without an axis', () => {
		expect(
			formatGeometrySummary( {
				Vertices: [ 1, 2 ],
				Edges: [ 1 ],
				Faces: [ 1, 2, 3 ],
				IsSymmetric: false,
				SymmetryAxis: 0.5,
			} )
		).toBe( '2 vertices • 1 edges • 3 faces • Asymmetric' );
	} );

	it( 'returns an empty string when there is no geometry', () => {
		expect( formatGeometrySummary( null ) ).toBe( '' );
		expect( formatGeometrySummary( undefined ) ).toBe( '' );
	} );

	it( 'survives a geometry with no arrays at all', () => {
		expect( formatGeometrySummary( {} ) ).toBe(
			'0 vertices • 0 edges • 0 faces • Asymmetric'
		);
	} );
} );

describe( 'sanitizeDisplayText', () => {
	it( 'strips the NUL padding of fixed-width label fields', () => {
		expect( sanitizeDisplayText( 'TiRAY\u0000\u0000\u0000' ) ).toBe(
			'TiRAY'
		);
		expect( sanitizeDisplayText( 'A\u0007B\u001fC\u007f' ) ).toBe( 'ABC' );
		expect( sanitizeDisplayText( '  spaced  ' ) ).toBe( 'spaced' );
	} );

	it( 'truncates to 120 characters with an ellipsis', () => {
		const long = 'x'.repeat( 400 );
		const result = sanitizeDisplayText( long );

		expect( result ).toHaveLength( 120 );
		expect( result.endsWith( '…' ) ).toBe( true );

		// A string exactly at the limit is left alone.
		expect( sanitizeDisplayText( 'y'.repeat( 120 ) ) ).toHaveLength( 120 );
		expect( sanitizeDisplayText( 'y'.repeat( 120 ) ) ).not.toContain( '…' );
	} );

	it( 'returns an empty string for absent input', () => {
		expect( sanitizeDisplayText( null ) ).toBe( '' );
		expect( sanitizeDisplayText( undefined ) ).toBe( '' );
	} );
} );

describe( 'formatPoint', () => {
	it( 'formats a full triple', () => {
		expect( formatPoint( { x: 0, y: -0.125, z: 1 } ) ).toBe(
			'0.000, -0.125, 1.000'
		);
	} );

	it( 'returns the no-value marker for a missing or partial point', () => {
		expect( formatPoint( null ) ).toBe( '-' );
		expect( formatPoint( {} ) ).toBe( '-' );
		expect( formatPoint( { x: 1, y: 2 } ) ).toBe( '-' );
	} );
} );

const SAMPLE = {
	Database: {
		BoxTypes: [
			{
				Label: 'TiRAY',
				Key: 'TiRAY',
				Weight: 9.9,
				Sources: [ 'LF', 'HF' ],
				SourcePlacements: [
					{
						Label: 'Woofer',
						Key: 'P1',
						SourceDefinitionKey: 'SRC_LF',
					},
				],
				HorizontalOpeningAngle: 100,
				VerticalOpeningAngle: 10,
			},
			// A box with no geometry, so the flat geometry list no longer
			// lines up with the box list.
			{ Label: 'Spacer', Key: 'SPC', Weight: 2 },
			{ Label: 'TiRAY Sub', Key: 'SUB', Weight: 21 },
		],
		CaseGeometries: [
			{
				Vertices: new Array( 600 ).fill( 0 ),
				Edges: new Array( 300 ).fill( 0 ),
				Faces: [],
				IsSymmetric: true,
				SymmetryAxis: 0,
				OwnerKind: 'box',
				OwnerIndex: 0,
				BoxIndex: 0,
				BoxKey: 'TiRAY',
			},
			{
				Vertices: new Array( 8 ).fill( 0 ),
				Edges: new Array( 12 ).fill( 0 ),
				Faces: [],
				IsSymmetric: false,
				OwnerKind: 'box',
				OwnerIndex: 2,
				BoxIndex: 2,
				BoxKey: 'SUB',
			},
			{
				Vertices: new Array( 4 ).fill( 0 ),
				Edges: new Array( 4 ).fill( 0 ),
				Faces: [],
				IsSymmetric: false,
				OwnerKind: 'frame',
				OwnerIndex: 0,
				OwnerKey: 'FR1',
			},
		],
		Frames: [
			{
				Label: 'Flybar',
				Key: 'FR1',
				IsFlown: true,
				Weight: 12.5,
				PinPoints: [ { Label: 'P1', Vector: { x: 0, y: 0, z: 0.1 } } ],
				CaseGeometryIndex: 2,
			},
			{
				Label: 'Dolly',
				Key: 'FR2',
				IsFlown: false,
				Weight: 30,
				PinPoints: [],
				CaseGeometryIndex: -1,
			},
		],
		FilterGroups: [
			{
				Label: 'Presets',
				Key: 'PRE',
				IsOverridable: true,
				Filters: [
					{
						Label: 'Flat',
						Key: 'FLAT',
						Bank: {
							Bypass: true,
							InvertPolarity: true,
							MuteInput: true,
							Gain: 0,
							Delay: 0.0005,
							Filters: [
								{
									Kind: 1,
									KindLabel: 'IIR',
									IIR: {
										FilterShape: 3,
										FilterShapeLabel: 'Sallen-Key',
										Order: 2,
										FreqCritHz: 1200,
										AlignmentLabel: 'Highpass',
										QFactor: 0.707,
									},
								},
								{
									Kind: 2,
									KindLabel: 'FIR',
									FIR: {
										IsTimeResponse: true,
										IsComplex: false,
										SampleRate: 48000,
										CoefficientCount: 8193,
									},
								},
								{
									Kind: 0,
									KindLabel: 'LogSpectrum',
									LogSpectrum: {
										BandsPerOctave: 12,
										NumberOfBands: 120,
										Delay: 0.002,
									},
								},
							],
						},
					},
				],
			},
		],
		Limits: [
			{
				Frame: 'FR1',
				BoxType: 'TiRAY',
				Type: 2,
				TypeLabel: 'Max Weight',
				Value: 250,
			},
		],
		Warnings: [
			{
				Frame: 'FR1',
				Type: 3,
				TypeLabel: 'Max Tilt Warning',
				Text: 'Tilt exceeded\u0000',
				Value: 10,
			},
			{
				Frame: 'FR1',
				Type: 0,
				TypeLabel: 'Max Count Warning',
				Text: 'Too many boxes',
				Value: 0,
			},
		],
	},
};

/**
 * Collect every string a result carries, entries and children alike.
 *
 * @param {Object} result Collected configuration.
 * @return {string[]} Every rendered string.
 */
function allStrings( result: ReturnType< typeof collectConfig > ): string[] {
	const out: string[] = [];

	const walk = ( entry: ConfigEntry ) => {
		out.push( entry.id, entry.title );
		if ( entry.subtitle ) {
			out.push( entry.subtitle );
		}
		out.push( ...( entry.badges || [] ) );
		out.push( ...entry.details );
		( entry.children || [] ).forEach( walk );
	};

	result.sections.forEach( ( section ) => {
		out.push( section.key, section.title );
		section.entries.forEach( walk );
	} );

	return out;
}

describe( 'collectConfig', () => {
	it( 'returns the sections in a fixed order', () => {
		expect(
			collectConfig( SAMPLE ).sections.map( ( s ) => s.key )
		).toEqual( [
			'box-types',
			'frames',
			'filter-groups',
			'limits',
			'warnings',
		] );
	} );

	it( 'titles the sections for the reader', () => {
		expect(
			collectConfig( SAMPLE ).sections.map( ( s ) => s.title )
		).toEqual( [
			'Box Types',
			'Frames',
			'Filter Groups',
			'Limits',
			'Warnings',
		] );
	} );

	it( 'counts entries alongside them', () => {
		const [ boxes ] = collectConfig( SAMPLE ).sections;

		expect( boxes.count ).toBe( boxes.entries.length );
		expect( boxes.count ).toBe( 3 );
		expect( boxes.isEmpty ).toBe( false );
	} );

	it.each( [
		[ 'showBoxTypes', 'box-types' ],
		[ 'showFrames', 'frames' ],
		[ 'showFilterGroups', 'filter-groups' ],
		[ 'showLimits', 'limits' ],
		[ 'showWarnings', 'warnings' ],
	] )( 'omits the section entirely when %s is off', ( option, key ) => {
		const result = collectConfig( SAMPLE, { [ option ]: false } );

		expect( result.sections.map( ( s ) => s.key ) ).not.toContain( key );
		expect( result.sections ).toHaveLength( 4 );
	} );

	it( 'reports emptiness only when every included section is empty', () => {
		// Warnings alone are present, so the whole result is not empty.
		expect(
			collectConfig( SAMPLE, {
				showBoxTypes: false,
				showFrames: false,
				showFilterGroups: false,
				showLimits: false,
			} ).isEmpty
		).toBe( false );

		// A file with rigging data only, viewed with rigging switched off.
		expect(
			collectConfig(
				{ Database: { Limits: SAMPLE.Database.Limits } },
				{ showLimits: false }
			).isEmpty
		).toBe( true );
	} );

	it( 'tolerates missing data entirely', () => {
		const result = collectConfig( null );

		expect( result.isEmpty ).toBe( true );
		expect( result.sections ).toHaveLength( 5 );
		expect( result.sections.every( ( s ) => s.entries.length === 0 ) ).toBe(
			true
		);
		expect( collectConfig( {} ).isEmpty ).toBe( true );
		expect( collectConfig( { Database: {} } ).isEmpty ).toBe( true );
		expect(
			collectConfig( { Database: { BoxTypes: null } } ).isEmpty
		).toBe( true );
	} );

	describe( 'box types', () => {
		const boxes = () => collectConfig( SAMPLE ).sections[ 0 ].entries;

		it( 'titles by label and drops a subtitle that repeats it', () => {
			expect( boxes()[ 0 ].title ).toBe( 'TiRAY' );
			expect( boxes()[ 0 ].subtitle ).toBeUndefined();
			expect( boxes()[ 1 ].subtitle ).toBe( 'Key: SPC' );
		} );

		it( 'formats the identity line with units', () => {
			expect( boxes()[ 0 ].details[ 0 ] ).toBe(
				'Key: TiRAY • Weight: 9.90 kg • Vertical Opening Angle: 10.0° • Horizontal Opening Angle: 100.0°'
			);
		} );

		it( 'omits parts that have no value', () => {
			expect( boxes()[ 1 ].details[ 0 ] ).toBe(
				'Key: SPC • Weight: 2.00 kg'
			);
		} );

		it( 'lists sources and placements on their own line', () => {
			expect( boxes()[ 0 ].details[ 1 ] ).toBe(
				'Sources: LF, HF • Source Placements: Woofer (SRC_LF)'
			);
		} );

		it( 'finds a geometry by its owner, not by list position', () => {
			// The second box has no geometry, so CaseGeometries[1] belongs to
			// box 2 and CaseGeometries[2] belongs to a frame. Indexing
			// positionally would give box 2 the frame's mesh.
			expect( boxes()[ 0 ].details[ 2 ] ).toContain( '600 vertices' );
			expect(
				boxes()[ 1 ].details.some( ( line ) =>
					line.includes( 'vertices' )
				)
			).toBe( false );
			expect( boxes()[ 2 ].details[ 1 ] ).toBe(
				'8 vertices • 12 edges • 0 faces • Asymmetric'
			);
		} );

		it( 'drops every geometry line when the summary is off', () => {
			const off = collectConfig( SAMPLE, {
				showGeometrySummary: false,
			} ).sections[ 0 ].entries;

			expect(
				off.some( ( entry ) =>
					entry.details.some( ( line ) =>
						line.includes( 'vertices' )
					)
				)
			).toBe( false );
		} );
	} );

	describe( 'frames', () => {
		const frames = ( options = {} ) =>
			collectConfig( SAMPLE, options ).sections[ 1 ].entries;

		it( 'badges the rigging mode', () => {
			expect( frames()[ 0 ].badges ).toEqual( [ 'Flown' ] );
			expect( frames()[ 1 ].badges ).toEqual( [ 'Ground-stacked' ] );
		} );

		it( 'resolves the geometry through CaseGeometryIndex', () => {
			expect( frames()[ 0 ].details[ 1 ] ).toBe(
				'4 vertices • 4 edges • 0 faces • Asymmetric'
			);
			// -1 means the frame has no geometry at all.
			expect( frames()[ 1 ].details ).toHaveLength( 1 );
		} );

		it( 'hides pin points unless they are asked for', () => {
			expect(
				frames().some( ( entry ) =>
					entry.details.some( ( line ) =>
						line.startsWith( 'Pin Points' )
					)
				)
			).toBe( false );

			expect( frames( { showPinPoints: true } )[ 0 ].details ).toContain(
				'Pin Points: P1 (0.000, 0.000, 0.100)'
			);
		} );
	} );

	describe( 'filter groups', () => {
		const groups = ( options = {} ) =>
			collectConfig( SAMPLE, options ).sections[ 2 ].entries;

		it( 'badges an overridable group and counts its filters', () => {
			expect( groups()[ 0 ].badges ).toEqual( [ 'Overridable' ] );
			expect( groups()[ 0 ].details ).toEqual( [ '1 filters' ] );
			expect( groups()[ 0 ].children ).toHaveLength( 1 );
		} );

		it( 'badges the bank state on the child entry', () => {
			expect( groups()[ 0 ].children[ 0 ].badges ).toEqual( [
				'Bypassed',
				'Inverted',
				'Muted',
			] );
		} );

		it( 'puts the bank gain and delay on the first child line', () => {
			expect( groups()[ 0 ].children[ 0 ].details[ 0 ] ).toBe(
				'Gain: 0 dB • Delay: 500.0 µs'
			);
		} );

		it( 'describes each base filter when details are on', () => {
			const [ , iir, fir, spectrum ] =
				groups()[ 0 ].children[ 0 ].details;

			expect( iir ).toBe(
				'IIR • Sallen-Key • Order: 2 • Freq: 1.20 kHz • Q: 0.71 • Align: Highpass'
			);
			expect( fir ).toBe(
				'FIR • Time Domain • SR: 48 kHz • 8193 coefficients'
			);
			expect( spectrum ).toBe(
				'LogSpectrum • 120 bands • 12/oct • Delay: 2.00 ms'
			);
		} );

		it( 'omits Q for shapes where it is meaningless', () => {
			const data = {
				Database: {
					FilterGroups: [
						{
							Label: 'G',
							Filters: [
								{
									Label: 'F',
									Bank: {
										Gain: 0,
										Filters: [
											{
												KindLabel: 'IIR',
												IIR: {
													FilterShape: 1,
													FilterShapeLabel:
														'Linkwitz-Riley',
													Order: 4,
													FreqCritHz: 800,
													QFactor: 0.5,
												},
											},
										],
									},
								},
							],
						},
					],
				},
			};

			expect(
				collectConfig( data ).sections[ 2 ].entries[ 0 ].children[ 0 ]
					.details[ 1 ]
			).toBe( 'IIR • Linkwitz-Riley • Order: 4 • Freq: 800.0 Hz' );
		} );

		it( 'keeps only the bank line when filter details are off', () => {
			expect(
				groups( { showFilterDetails: false } )[ 0 ].children[ 0 ]
					.details
			).toEqual( [ 'Gain: 0 dB • Delay: 500.0 µs' ] );
		} );

		it( 'tolerates a filter definition with no bank', () => {
			const data = {
				Database: {
					FilterGroups: [
						{ Label: 'G', Filters: [ { Label: 'F', Bank: null } ] },
					],
				},
			};
			const child =
				collectConfig( data ).sections[ 2 ].entries[ 0 ].children[ 0 ];

			expect( child.badges ).toEqual( [] );
			expect( child.details ).toEqual( [] );
		} );
	} );

	describe( 'limits and warnings', () => {
		it( 'labels a limit and gives its value a unit', () => {
			const [ limit ] = collectConfig( SAMPLE ).sections[ 3 ].entries;

			expect( limit.title ).toBe( 'Max Weight' );
			expect( limit.details[ 0 ] ).toBe(
				'Value: 250.00 kg • Box: TiRAY • Frame: FR1'
			);
		} );

		it( 'shows the warning text and only a non-zero value', () => {
			const [ tilt, count ] =
				collectConfig( SAMPLE ).sections[ 4 ].entries;

			expect( tilt.title ).toBe( 'Max Tilt Warning' );
			// The NUL padding of the fixed-width text field is stripped, and
			// the value is degrees because 3 is a TILT warning.
			expect( tilt.details ).toEqual( [
				'Tilt exceeded',
				'Value: 10.0°',
			] );

			expect( count.details ).toEqual( [ 'Too many boxes' ] );
		} );
	} );

	it( 'never renders NaN or undefined anywhere, even from junk input', () => {
		const junk = {
			Database: {
				BoxTypes: [ {}, { Weight: NaN, Sources: [ null ] } ],
				CaseGeometries: [ null ],
				Frames: [ { CaseGeometryIndex: 99 } ],
				FilterGroups: [
					{
						Filters: [
							{
								Bank: {
									Gain: undefined,
									Delay: NaN,
									Filters: [ { IIR: {}, FIR: {} } ],
								},
							},
						],
					},
				],
				Limits: [ {} ],
				Warnings: [ {} ],
			},
		};

		for ( const result of [
			collectConfig( SAMPLE, { showPinPoints: true } ),
			collectConfig( junk, { showPinPoints: true } ),
		] ) {
			for ( const text of allStrings( result ) ) {
				expect( text ).not.toContain( 'NaN' );
				expect( text ).not.toContain( 'undefined' );
			}
		}
	} );
} );
