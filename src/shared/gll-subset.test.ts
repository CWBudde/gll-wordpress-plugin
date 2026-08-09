/**
 * Tests for the display-subset builder.
 *
 * The subset is what gets stored on the attachment and served to the frontend,
 * so two properties matter more than the field-by-field mapping: it must carry
 * everything `gll-info` and `config` render, and it must NOT carry the payloads
 * that made a full parse expensive in the first place. Both are asserted here.
 *
 * @package
 */

import {
	SUBSET_VERSION,
	buildDisplaySubset,
	geometryCounts,
	hydrateSubsetLabels,
	sourceResponseCount,
} from './gll-subset';

/**
 * A normalized parse, in the shape `normalizeGllData()` emits.
 *
 * Deliberately carries every payload the subset is supposed to drop — response
 * arrays, vertex/edge/face arrays and embedded files — so that a builder which
 * quietly stopped dropping one of them would fail rather than pass.
 *
 * @return {Object} Normalized GLL data.
 */
function normalizedFixture() {
	return {
		Header: { Magic: 'GLL', FormatId: 1, FormatVersion: 2, SubVersion: 1 },
		GenSystem: {
			Label: 'Test Speaker',
			Key: 'sys-1',
			Version: '1.0',
			SystemType: 2,
			Manufacturer: 'ACME',
			InfoText: 'info',
			CopyrightText: 'c',
			WebsiteText: 'w',
			EmailText: 'e',
		},
		Metadata: {
			ProductName: 'P',
			DisplayName: 'D',
			Manufacturer: 'ACME',
			Description: 'A test system',
			Copyright: 'c',
			Website: 'w',
			Email: 'e',
		},
		Description: 'A test system',
		Database: {
			SourceDefinitions: [
				{
					Key: 'src-1',
					Label: 'LF',
					Definition: {
						Label: 'LF',
						CompanyLabel: 'ACME',
						DataType: 0,
						NominalBandwidthFrom: 50,
						NominalBandwidthTo: 2000,
						OnAxisLevel: 96,
						RatedHorizontalAngle: 90,
						RatedVerticalAngle: 60,
						OnAxisSpectrum: {
							Definition: { bands_per_octave: 3 },
							Level: [ 1, 2, 3 ],
							Phase: [ 0, 0, 0 ],
							Delay: 0,
						},
						BalloonData: {
							ResponseCount: 2,
							AngularResolution: {
								MeridianStep: 10,
								ParallelStep: 5,
								Symmetry: 0,
								FrontHalfOnly: false,
							},
						},
					},
					Responses: [
						{ Frequencies: [ 100, 200 ], Level: [ 1, 2 ] },
						{ Frequencies: [ 100, 200 ], Level: [ 3, 4 ] },
					],
				},
				{
					Key: 'src-2',
					Label: 'HF',
					Definition: { Label: 'HF', BalloonData: null },
					Responses: [],
				},
			],
			BoxTypes: [
				{
					Label: 'Box A',
					Key: 'box-a',
					Weight: 12.5,
					Sources: [ { Label: 'LF', Key: 'src-1' } ],
					SourcePlacements: [
						{
							Label: 'P1',
							Key: 'p1',
							SourceDefinitionKey: 'src-1',
							Position: { x: 0, y: 0, z: 0 },
							Rotation: { Heading: 0, Vertical: 0, Roll: 0 },
						},
					],
				},
			],
			Frames: [
				{
					Label: 'Frame A',
					Key: 'frame-a',
					IsFlown: true,
					Weight: 3,
					PinPoints: [ { Label: 'Pin', Vector: null } ],
					CaseGeometryIndex: 1,
				},
			],
			CaseGeometries: [
				{
					Vertices: [ {}, {}, {} ],
					Edges: [ {}, {} ],
					Faces: [],
					IsSymmetric: true,
					SymmetryAxis: 0.5,
					OwnerKind: 'box',
					OwnerIndex: 0,
					OwnerKey: 'box-a',
					OwnerLabel: 'Box A',
					BoxIndex: 0,
					BoxKey: 'box-a',
					BoxLabel: 'Box A',
				},
				{
					Vertices: [ {} ],
					Edges: [],
					Faces: [ {} ],
					OwnerKind: 'frame',
					OwnerIndex: 0,
					OwnerKey: 'frame-a',
					OwnerLabel: 'Frame A',
				},
			],
			Limits: [
				{
					Frame: 0,
					BoxType: 0,
					Type: 2,
					TypeLabel: 'Max Weight',
					Value: 100,
				},
			],
			Warnings: [
				{
					Frame: 0,
					Type: 1,
					TypeLabel: 'Min Count Warning',
					Text: 'careful',
					Value: 2,
				},
			],
			FilterGroups: [
				{
					Label: 'G1',
					Key: 'g1',
					IsOverridable: false,
					Filters: [
						{
							Label: 'F1',
							Key: 'f1',
							Bank: {
								Gain: 0,
								Filters: [
									{
										Kind: 2,
										KindLabel: 'FIR',
										FIR: { CoefficientCount: 8193 },
									},
								],
							},
						},
					],
				},
			],
			IncludeFiles: [
				{ Name: 'datasheet.pdf', Size: 2170000, DataUri: 'data:...' },
			],
			DataFiles: [ { Name: 'logo.png', Size: 337, DataUri: 'data:...' } ],
		},
	};
}

describe( 'buildDisplaySubset', () => {
	it( 'stamps the subset version so a stored cache can be invalidated', () => {
		expect( buildDisplaySubset( normalizedFixture() ).Version ).toBe(
			SUBSET_VERSION
		);
	} );

	it( 'carries the descriptive blocks verbatim', () => {
		const source = normalizedFixture();
		const subset = buildDisplaySubset( source );

		expect( subset.Header ).toEqual( source.Header );
		expect( subset.GenSystem ).toEqual( source.GenSystem );
		expect( subset.Metadata ).toEqual( source.Metadata );
		expect( subset.Description ).toBe( 'A test system' );
	} );

	it( 'carries the box and frame tables unchanged', () => {
		const source = normalizedFixture();
		const subset = buildDisplaySubset( source );

		expect( subset.Database.BoxTypes ).toEqual( source.Database.BoxTypes );
		expect( subset.Database.Frames ).toEqual( source.Database.Frames );
	} );

	it( 'keeps the enums of limits, warnings and filters', () => {
		const subset = buildDisplaySubset( normalizedFixture() );

		expect( subset.Database.Limits[ 0 ] ).toMatchObject( {
			Type: 2,
			Value: 100,
			BoxType: 0,
		} );
		expect( subset.Database.Warnings[ 0 ] ).toMatchObject( {
			Type: 1,
			Text: 'careful',
		} );
		expect(
			subset.Database.FilterGroups[ 0 ].Filters[ 0 ].Bank.Filters[ 0 ]
				.Kind
		).toBe( 2 );
	} );

	it( 'caches no translated label text', () => {
		// A cached payload outlives the locale it was built in — a subset
		// generated on upload, or by an English-speaking author, must not pin
		// English labels for every later visitor.
		const subset = buildDisplaySubset( normalizedFixture() );

		expect( subset.Database.Limits[ 0 ].TypeLabel ).toBeUndefined();
		expect( subset.Database.Warnings[ 0 ].TypeLabel ).toBeUndefined();
		expect(
			subset.Database.FilterGroups[ 0 ].Filters[ 0 ].Bank.Filters[ 0 ]
				.KindLabel
		).toBeUndefined();
	} );

	it( 'replaces each source’s responses with a count', () => {
		const [ first, second ] = buildDisplaySubset( normalizedFixture() )
			.Database.SourceDefinitions;

		expect( first.ResponseCount ).toBe( 2 );
		expect( first.Responses ).toBeUndefined();
		expect( second.ResponseCount ).toBe( 0 );
	} );

	it( 'keeps the source fields the overview renders', () => {
		const [ first ] = buildDisplaySubset( normalizedFixture() ).Database
			.SourceDefinitions;

		expect( first.Label ).toBe( 'LF' );
		expect( first.Definition.NominalBandwidthFrom ).toBe( 50 );
		expect( first.Definition.NominalBandwidthTo ).toBe( 2000 );
		expect( first.Definition.BalloonData.AngularResolution ).toEqual( {
			MeridianStep: 10,
			ParallelStep: 5,
			Symmetry: 0,
			FrontHalfOnly: false,
		} );
	} );

	it( 'preserves a null balloon rather than inventing an empty one', () => {
		// The normalizer distinguishes "no balloon" from "a balloon whose
		// fields are all undefined" on purpose; flattening that here would make
		// every balloon-less source render as 0 responses at 0° × 0°.
		const [ , second ] = buildDisplaySubset( normalizedFixture() ).Database
			.SourceDefinitions;

		expect( second.Definition.BalloonData ).toBeNull();
	} );

	it( 'drops the on-axis spectrum, which no cached block renders', () => {
		const [ first ] = buildDisplaySubset( normalizedFixture() ).Database
			.SourceDefinitions;

		expect( first.Definition.OnAxisSpectrum ).toBeUndefined();
	} );

	it( 'reduces case geometries to identity plus counts', () => {
		const [ box, frame ] = buildDisplaySubset( normalizedFixture() )
			.Database.CaseGeometries;

		expect( box.VertexCount ).toBe( 3 );
		expect( box.EdgeCount ).toBe( 2 );
		expect( box.FaceCount ).toBe( 0 );
		expect( box.Vertices ).toBeUndefined();
		expect( box.Edges ).toBeUndefined();
		expect( box.Faces ).toBeUndefined();

		// `findBoxGeometry()` in config-model matches on these two, so losing
		// either would silently blank every box's geometry summary.
		expect( box.OwnerKind ).toBe( 'box' );
		expect( box.BoxIndex ).toBe( 0 );

		expect( frame.OwnerKind ).toBe( 'frame' );
		expect( frame.FaceCount ).toBe( 1 );
	} );

	it( 'keeps the symmetry fields the geometry summary appends', () => {
		const [ box ] = buildDisplaySubset( normalizedFixture() ).Database
			.CaseGeometries;

		expect( box.IsSymmetric ).toBe( true );
		expect( box.SymmetryAxis ).toBe( 0.5 );
	} );

	it( 'drops the embedded files, which are base64 and megabytes wide', () => {
		// Cast because the builder's inferred return type has no such keys —
		// which is the compile-time half of this guarantee. The assertion below
		// is the runtime half, and survives the shape being widened later.
		const database = buildDisplaySubset( normalizedFixture() )
			.Database as any;

		expect( database.IncludeFiles ).toBeUndefined();
		expect( database.DataFiles ).toBeUndefined();
	} );

	it( 'holds no reference to any large array from the source parse', () => {
		// The point of the subset is that the full parse can be collected once
		// it has been built. A single retained reference defeats that, and is
		// invisible in a field-by-field assertion.
		const serialized = JSON.stringify(
			buildDisplaySubset( normalizedFixture() )
		);

		expect( serialized ).not.toContain( 'data:' );
		expect( serialized ).not.toContain( 'Responses' );
		expect( serialized ).not.toContain( 'Vertices' );
	} );

	it( 'tolerates an empty or malformed parse', () => {
		expect( buildDisplaySubset( null ) ).toBeNull();
		expect( buildDisplaySubset( undefined ) ).toBeNull();
		expect( buildDisplaySubset( 'nonsense' ) ).toBeNull();

		const empty = buildDisplaySubset( {} );
		expect( empty.Database.SourceDefinitions ).toEqual( [] );
		expect( empty.Database.CaseGeometries ).toEqual( [] );
	} );
} );

describe( 'hydrateSubsetLabels', () => {
	it( 'restores every label the builder stripped', () => {
		const source = normalizedFixture();
		const hydrated = hydrateSubsetLabels( buildDisplaySubset( source ) );

		expect( hydrated.Database.Limits[ 0 ].TypeLabel ).toBe(
			source.Database.Limits[ 0 ].TypeLabel
		);
		expect( hydrated.Database.Warnings[ 0 ].TypeLabel ).toBe(
			source.Database.Warnings[ 0 ].TypeLabel
		);
		expect(
			hydrated.Database.FilterGroups[ 0 ].Filters[ 0 ].Bank.Filters[ 0 ]
				.KindLabel
		).toBe( 'FIR' );
	} );

	it( 'derives the IIR shape and alignment labels', () => {
		const subset = buildDisplaySubset( {
			Database: {
				FilterGroups: [
					{
						Filters: [
							{
								Bank: {
									Filters: [
										{
											Kind: 1,
											IIR: {
												FilterShape: 1,
												Alignment: 2,
											},
										},
									],
								},
							},
						],
					},
				],
			},
		} );

		const filter =
			hydrateSubsetLabels( subset ).Database.FilterGroups[ 0 ]
				.Filters[ 0 ].Bank.Filters[ 0 ];

		expect( filter.IIR.FilterShapeLabel ).toBe( 'Linkwitz-Riley' );
		expect( filter.IIR.AlignmentLabel ).toBe( '-6 dB' );
	} );

	it( 'is idempotent, so a full parse survives it unchanged', () => {
		// The label tables are pure functions of the enum, so hydrating data
		// that already has its labels has to reproduce the same values.
		const once = hydrateSubsetLabels(
			buildDisplaySubset( normalizedFixture() )
		);

		expect( hydrateSubsetLabels( once ) ).toEqual( once );
	} );

	it( 'tolerates a missing or malformed subset', () => {
		expect( hydrateSubsetLabels( null ) ).toBeNull();
		expect( hydrateSubsetLabels( 'nonsense' ) ).toBeNull();
		expect( hydrateSubsetLabels( {} ).Database.Limits ).toEqual( [] );
	} );
} );

describe( 'sourceResponseCount', () => {
	it( 'counts the array when given a full parse', () => {
		expect( sourceResponseCount( { Responses: [ {}, {}, {} ] } ) ).toBe(
			3
		);
	} );

	it( 'reads the count when given a subset', () => {
		expect( sourceResponseCount( { ResponseCount: 7 } ) ).toBe( 7 );
	} );

	it( 'prefers the explicit count over an array, and survives neither', () => {
		expect(
			sourceResponseCount( { ResponseCount: 0, Responses: [ {} ] } )
		).toBe( 0 );
		expect( sourceResponseCount( {} ) ).toBe( 0 );
		expect( sourceResponseCount( null ) ).toBe( 0 );
	} );
} );

describe( 'geometryCounts', () => {
	it( 'counts the arrays when given a full parse', () => {
		expect(
			geometryCounts( {
				Vertices: [ {}, {} ],
				Edges: [ {} ],
				Faces: [],
			} )
		).toEqual( { Vertices: 2, Edges: 1, Faces: 0 } );
	} );

	it( 'reads the counts when given a subset', () => {
		expect(
			geometryCounts( { VertexCount: 9, EdgeCount: 4, FaceCount: 1 } )
		).toEqual( { Vertices: 9, Edges: 4, Faces: 1 } );
	} );

	it( 'reports zeroes for a missing geometry rather than throwing', () => {
		expect( geometryCounts( null ) ).toEqual( {
			Vertices: 0,
			Edges: 0,
			Faces: 0,
		} );
	} );
} );
