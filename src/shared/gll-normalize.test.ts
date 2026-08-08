/**
 * Unit tests for normalizeGllData.
 *
 * The regression these guard is the misalignment between
 * `Database.CaseGeometries` and `Database.BoxTypes`: geometries are filtered,
 * box types are not, so a flat geometry index cannot be used to look up the
 * owning box. Geometries now carry their own box identity and placements.
 */

import { normalizeGllData } from './gll-normalize';

/**
 * Build a raw box type as the Go parser emits it.
 *
 * @param {Object} overrides Fields to merge into the default box.
 * @return {Object} Raw `box_types[]` entry.
 */
function makeRawBox( overrides = {} ) {
	return {
		label: 'Box',
		key: 'bx',
		weight: 12,
		sources: [ 'srcMain' ],
		reference_point: { x: 0, y: 0, z: 0 },
		center_of_mass: { x: 0, y: 0, z: 1 },
		next_pivot: { x: 0, y: 1, z: 0 },
		source_placements: [],
		...overrides,
	};
}

/**
 * Build a raw source placement.
 *
 * @param {string} key Placement key.
 * @return {Object} Raw `source_placements[]` entry.
 */
function makeRawPlacement( key ) {
	return {
		label: `Placement ${ key }`,
		key,
		source_def_key: 'srcMain',
		position: { x: 1, y: 2, z: 3 },
		angles: { x: 10, y: 20, z: 30 },
	};
}

/**
 * Build a minimal raw case geometry.
 *
 * @return {Object} Raw `case_geometry` block.
 */
function makeRawGeometry(): any {
	return {
		is_symmetric: false,
		sub_version: 1,
		vertices: [
			{ x: 0, y: 0, z: 0 },
			{ x: 1, y: 0, z: 0 },
			{ x: 1, y: 1, z: 0 },
		],
		edges: [ { v1: 1, v2: 2, label: 'e1' } ],
		faces: [
			{ vertices: [ 1, 2, 3 ], color: 255, label: 'f1', has_twin: false },
		],
	};
}

describe( 'normalizeGllData', () => {
	it( 'returns non-objects untouched', () => {
		expect( normalizeGllData( null ) ).toBeNull();
		expect( normalizeGllData( 'nope' ) ).toBe( 'nope' );
	} );

	describe( 'case geometries', () => {
		it( 'binds each geometry to its own box when earlier boxes have none', () => {
			const raw = {
				database: {
					box_types: [
						makeRawBox( {
							key: 'bxNoGeometry',
							label: 'No Geometry',
							source_placements: [ makeRawPlacement( 'pA' ) ],
						} ),
						makeRawBox( {
							key: 'bxWithGeometry',
							label: 'With Geometry',
							source_placements: [
								makeRawPlacement( 'pB' ),
								makeRawPlacement( 'pC' ),
							],
							horizontal_opening_angle: 90,
							vertical_opening_angle: 40,
							case_geometry: makeRawGeometry(),
						} ),
					],
				},
			};

			const normalized = normalizeGllData( raw );
			const geometries = normalized.Database.CaseGeometries;

			expect( geometries ).toHaveLength( 1 );

			// The single geometry belongs to box index 1, not index 0.
			const geometry = geometries[ 0 ];
			expect( geometry.BoxIndex ).toBe( 1 );
			expect( geometry.BoxKey ).toBe( 'bxWithGeometry' );
			expect( geometry.BoxLabel ).toBe( 'With Geometry' );
			expect( geometry.HorizontalOpeningAngle ).toBe( 90 );
			expect( geometry.VerticalOpeningAngle ).toBe( 40 );

			expect(
				geometry.SourcePlacements.map( ( placement ) => placement.Key )
			).toEqual( [ 'pB', 'pC' ] );

			// Shared by reference with the normalized box type, not copied.
			expect( geometry.SourcePlacements ).toBe(
				normalized.Database.BoxTypes[ 1 ].SourcePlacements
			);
		} );

		it( 'folds 1-based edge and face indices to 0-based', () => {
			const raw = {
				database: {
					box_types: [
						makeRawBox( { case_geometry: makeRawGeometry() } ),
					],
				},
			};

			const geometry =
				normalizeGllData( raw ).Database.CaseGeometries[ 0 ];

			expect( geometry.Edges ).toEqual( [
				{ A: 0, B: 1, Color: undefined, Label: 'e1' },
			] );
			expect( geometry.Faces ).toEqual( [
				{ Indices: [ 0, 1, 2 ], Color: 255, Label: 'f1' },
			] );
		} );

		it( 'folds mirrored edge references and drops unset ends', () => {
			// buildCaseGeometryData indexes the vertex list directly and
			// rejects negatives, so a raw 1-based pair would render the wrong
			// segment and a mirrored reference would vanish entirely.
			const geometryInput = makeRawGeometry();
			geometryInput.edges = [
				{ v1: 1, v2: 3, label: 'a' },
				{ v1: -2, v2: 3, label: 'mirrored' },
				{ v1: 0, v2: 3, label: 'unset' },
			];

			const raw = {
				database: {
					box_types: [
						makeRawBox( { case_geometry: geometryInput } ),
					],
				},
			};

			const geometry =
				normalizeGllData( raw ).Database.CaseGeometries[ 0 ];

			expect(
				geometry.Edges.map( ( edge ) => [ edge.A, edge.B ] )
			).toEqual( [
				[ 0, 2 ],
				[ 1, 2 ],
			] );
		} );

		it( 'mirrors negative face indices and drops degenerate faces', () => {
			const geometryInput = makeRawGeometry();
			geometryInput.faces = [
				{ vertices: [ -1, 2, 0, 3 ] },
				{ vertices: [ 1, 2 ] },
				{ vertices: null },
			];

			const raw = {
				database: {
					box_types: [
						makeRawBox( { case_geometry: geometryInput } ),
					],
				},
			};

			const geometry =
				normalizeGllData( raw ).Database.CaseGeometries[ 0 ];

			expect( geometry.Faces ).toEqual( [
				{ Indices: [ 0, 1, 2 ], Color: undefined, Label: undefined },
			] );
		} );

		it( 'leaves Faces empty when the parser emits none', () => {
			const geometryInput = makeRawGeometry();
			delete geometryInput.faces;

			const raw = {
				database: {
					box_types: [
						makeRawBox( { case_geometry: geometryInput } ),
					],
				},
			};

			expect(
				normalizeGllData( raw ).Database.CaseGeometries[ 0 ].Faces
			).toEqual( [] );
		} );
	} );

	describe( 'box types', () => {
		it( 'passes the source key list through', () => {
			const raw = {
				database: {
					box_types: [
						makeRawBox( { sources: [ 'srcLf', 'srcHf' ] } ),
						makeRawBox( { key: 'bx2', sources: undefined } ),
					],
				},
			};

			const boxTypes = normalizeGllData( raw ).Database.BoxTypes;

			expect( boxTypes[ 0 ].Sources ).toEqual( [ 'srcLf', 'srcHf' ] );
			expect( boxTypes[ 1 ].Sources ).toEqual( [] );
		} );

		it( 'normalizes placements into position and rotation', () => {
			const raw = {
				database: {
					box_types: [
						makeRawBox( {
							source_placements: [ makeRawPlacement( 'pA' ) ],
						} ),
					],
				},
			};

			const placement =
				normalizeGllData( raw ).Database.BoxTypes[ 0 ]
					.SourcePlacements[ 0 ];

			expect( placement.Position ).toEqual( { x: 1, y: 2, z: 3 } );
			expect( placement.Rotation ).toEqual( {
				Heading: 10,
				Vertical: 20,
				Roll: 30,
			} );
			expect( placement.SourceDefinitionKey ).toBe( 'srcMain' );
		} );
	} );

	describe( 'source definitions', () => {
		it( 'surfaces the rated coverage angles', () => {
			const raw = {
				database: {
					source_definitions: [
						{
							key: 'srcMain',
							definition: {
								label: 'Full Range',
								rated_horizontal_angle: 90,
								rated_vertical_angle: 60,
							},
							responses: [],
						},
					],
				},
			};

			const definition =
				normalizeGllData( raw ).Database.SourceDefinitions[ 0 ]
					.Definition;

			expect( definition.RatedHorizontalAngle ).toBe( 90 );
			expect( definition.RatedVerticalAngle ).toBe( 60 );
		} );

		it( 'derives a shared frequency axis for balloon responses', () => {
			const raw = {
				database: {
					source_definitions: [
						{
							key: 'srcMain',
							definition: {
								label: 'Full Range',
								balloon_data: {
									response_count: 1,
									angular_resolution: {
										meridian_step: 5,
										parallel_step: 5,
									},
									responses: [
										{
											definition: {
												bands_per_octave: 3,
												start_freq: 50,
												point_count: 4,
											},
											level: [ 1, 2, 3, 4 ],
										},
									],
								},
							},
						},
					],
				},
			};

			const response =
				normalizeGllData( raw ).Database.SourceDefinitions[ 0 ]
					.Responses[ 0 ];

			expect( response.Frequencies ).toHaveLength( 4 );
			expect( response.Frequencies[ 0 ] ).toBeCloseTo( 50, 6 );
			expect( response.Frequencies[ 3 ] ).toBeCloseTo( 100, 6 );
		} );
	} );

	describe( 'embedded files', () => {
		it( 'normalizes include files and keeps their label', () => {
			const result = normalizeGllData( {
				database: {
					include_files: [
						{
							label: 'G512 Data',
							key: 'inc1',
							filename: 'CODA Data Sheet - G512-Pro.pdf',
							size: 523073,
							data_uri: 'data:application/pdf;base64,JVBERi0=',
						},
					],
				},
			} );

			expect( result.Database.IncludeFiles ).toEqual( [
				{
					Label: 'G512 Data',
					Key: 'inc1',
					Filename: 'CODA Data Sheet - G512-Pro.pdf',
					Name: 'CODA Data Sheet - G512-Pro.pdf',
					Size: 523073,
					DataUri: 'data:application/pdf;base64,JVBERi0=',
				},
			] );
		} );

		it( 'folds Windows authoring paths to a base name', () => {
			const result = normalizeGllData( {
				database: {
					data_files: [
						{
							key: 'a',
							filename: '.\\Drawings\\CODA-logoLeft.PNG',
							size: 5028,
						},
						// HOPS7-Pro is the one corpus file nesting two levels.
						{
							key: 'b',
							filename:
								'.\\Drawings\\Logo Drawings\\CODA-logoRight.PNG',
							size: 337,
						},
					],
				},
			} );

			const names = result.Database.DataFiles.map( ( f ) => f.Name );
			expect( names ).toEqual( [
				'CODA-logoLeft.PNG',
				'CODA-logoRight.PNG',
			] );

			// The raw path is information in its own right, so it survives.
			expect( result.Database.DataFiles[ 0 ].Filename ).toBe(
				'.\\Drawings\\CODA-logoLeft.PNG'
			);
		} );

		it( 'falls back to the raw value when a path ends in a separator', () => {
			const result = normalizeGllData( {
				database: {
					data_files: [ { filename: '.\\Drawings\\', size: 12 } ],
				},
			} );

			expect( result.Database.DataFiles[ 0 ].Name ).toBe(
				'.\\Drawings\\'
			);
		} );

		it( 'drops the blank slots real files leave in the table', () => {
			// 3Way-LR.gll declares two data files and fills neither; a third of
			// the corpus fills only one of the two.
			const result = normalizeGllData( {
				database: {
					data_files: [
						{ key: '', filename: '', size: 0 },
						{ key: 'b', filename: 'logo.png', size: 1059 },
						{ key: '', filename: '   ', size: 0 },
					],
				},
			} );

			expect( result.Database.DataFiles ).toHaveLength( 1 );
			expect( result.Database.DataFiles[ 0 ].Name ).toBe( 'logo.png' );
		} );

		it( 'keeps a file that has a size but no inlined bytes', () => {
			// Existence and downloadability are separate questions: such a file
			// still deserves a row, just without a download.
			const result = normalizeGllData( {
				database: {
					data_files: [ { filename: 'big.xed', size: 900 } ],
				},
			} );

			expect( result.Database.DataFiles ).toHaveLength( 1 );
			expect( result.Database.DataFiles[ 0 ].DataUri ).toBeUndefined();
		} );

		it( 'yields empty lists when the parser omits the tables', () => {
			// Both fields are `omitempty` on the Go side, so they can be absent
			// rather than empty.
			const result = normalizeGllData( { database: {} } );

			expect( result.Database.IncludeFiles ).toEqual( [] );
			expect( result.Database.DataFiles ).toEqual( [] );
		} );

		it( 'does not carry the heuristic resource scan', () => {
			// Its PNG entries duplicate data_files byte for byte and its zlib
			// entries are PDF internals; carrying it doubled the retained
			// memory of every embedded image for no consumer.
			const result = normalizeGllData( {
				database: {},
				resources: [ { type: 'PNG', name: 'logo.png', size: 10 } ],
			} );

			expect( result.Resources ).toBeUndefined();
		} );
	} );

	describe( 'idempotency', () => {
		it( 'returns already normalized data unchanged', () => {
			const raw = {
				header: { format_version: 2 },
				gen_system: { label: 'Example' },
				metadata: { description: 'Desc' },
				database: {
					source_definitions: [
						{
							key: 'srcMain',
							definition: {
								label: 'Full Range',
								rated_horizontal_angle: 90,
								rated_vertical_angle: 60,
							},
							responses: [],
						},
					],
					box_types: [
						makeRawBox( {
							source_placements: [ makeRawPlacement( 'pA' ) ],
						} ),
						makeRawBox( {
							key: 'bx2',
							case_geometry: makeRawGeometry(),
							source_placements: [ makeRawPlacement( 'pB' ) ],
						} ),
					],
				},
			};

			const once = normalizeGllData( raw );
			const twice = normalizeGllData( once );

			expect( twice ).toEqual( once );
			expect( twice ).toBe( once );
		} );
	} );
} );
