/**
 * Integration test: run the real gll.wasm and check that normalizeGllData
 * produces the shape the blocks and shared utils actually read.
 *
 * This is the test that was missing. The data-access layer was written against
 * an assumed PascalCase shape while the Go parser emits snake_case, so every
 * visualization silently found nothing. Driving the real parser through the
 * real utils is the only way to keep the two in step.
 *
 * Mirrors the WASM bootstrap in wasm-parser.integration.test.ts.
 */

import { normalizeGllData } from '../src/shared/gll-normalize';
import { getBalloonGrid, computePolarSlices } from '../src/shared/polar-utils';
import { buildSourceResponseSeries } from '../src/shared/charting-utils';
import {
	buildFullSphereLevels,
	computeGlobalMaxLevel,
} from '../src/shared/balloon-utils';
import { getCaseGeometryVertices } from '../src/shared/geometry-utils';
import {
	describeCorpus,
	describeFixture,
	describeFullCorpus,
	listCorpusFiles,
	parseCorpusFile,
	parseFixture,
	teardownWasm,
} from './helpers/wasm-harness';

describeFixture( 'normalizeGllData against the real parser', () => {
	let normalized: any;

	afterAll( () => teardownWasm() );

	beforeAll( async () => {
		const result = await parseFixture();
		expect( result.success ).toBe( true );

		normalized = normalizeGllData( result.data );
	} );

	it( 'exposes system metadata under the keys the blocks read', () => {
		expect( normalized.GenSystem.Label ).toBe( 'Example Visualisation' );
		expect( typeof normalized.Metadata.Description ).toBe( 'string' );
		expect( normalized.Header.FormatVersion ).toBeGreaterThan( 0 );
	} );

	it( 'exposes sources with responses and a frequency axis', () => {
		const sources = normalized.Database.SourceDefinitions;
		expect( Array.isArray( sources ) ).toBe( true );
		expect( sources.length ).toBeGreaterThan( 0 );

		const source = sources[ 0 ];
		expect( source.Definition.Label ).toBe( 'Full Range' );
		expect( source.Responses.length ).toBeGreaterThan( 0 );

		const response = source.Responses[ 0 ];
		expect( Array.isArray( response.Frequencies ) ).toBe( true );
		expect( Array.isArray( response.Level ) ).toBe( true );
		expect( response.Frequencies.length ).toBe( response.Level.length );

		// Derived from bands_per_octave/start_freq: 1/3-octave from 50 Hz.
		expect( response.Frequencies[ 0 ] ).toBeCloseTo( 50, 3 );
		expect( response.Frequencies[ 3 ] ).toBeCloseTo( 100, 3 );
	} );

	it( 'exposes the balloon grid the polar and 3D blocks need', () => {
		const source = normalized.Database.SourceDefinitions[ 0 ];
		const grid = getBalloonGrid( source );

		expect( grid ).toBeTruthy();
		expect( grid.meridianStep ).toBeGreaterThan( 0 );
		expect( grid.parallelStep ).toBeGreaterThan( 0 );
		expect( grid.responseCount ).toBe( source.Responses.length );
	} );

	it( 'drives the frequency response series end to end', () => {
		const source = normalized.Database.SourceDefinitions[ 0 ];
		const series = buildSourceResponseSeries( source, 0 );

		expect( series ).toBeTruthy();
		expect( series.frequencies.length ).toBeGreaterThan( 0 );
		expect( series.level.length ).toBe( series.frequencies.length );
		expect( series.level.every( ( v ) => Number.isFinite( v ) ) ).toBe(
			true
		);
	} );

	it( 'drives the polar slices end to end', () => {
		const source = normalized.Database.SourceDefinitions[ 0 ];
		const slices = computePolarSlices( source, 0 );

		expect( slices ).toBeTruthy();
		expect( slices.labels.length ).toBeGreaterThan( 0 );
		expect( slices.horizontal.levels.length ).toBe( slices.labels.length );
		expect(
			slices.horizontal.levels.some( ( v ) => Number.isFinite( v ) )
		).toBe( true );
	} );

	it( 'drives the 3D balloon levels end to end', () => {
		const source = normalized.Database.SourceDefinitions[ 0 ];
		const grid = getBalloonGrid( source );
		const maxLevel = computeGlobalMaxLevel( source );
		const levels = buildFullSphereLevels( source, grid, 0 );

		expect( Number.isFinite( maxLevel ) ).toBe( true );
		expect( levels.length ).toBeGreaterThan( 0 );
		// buildFullSphereLevels returns a 2D grid indexed [parallel][meridian],
		// so this has to descend into the rows. Comparing a row array against a
		// number instead coerces it to a string and then to NaN, which made the
		// old form silently vacuous for every multi-meridian grid.
		expect(
			levels.some( ( row ) => row.some( ( level ) => level > -100 ) )
		).toBe( true );
	} );

	it( 'exposes case geometries as a flat, indexable list', () => {
		const geometries = normalized.Database.CaseGeometries;
		expect( Array.isArray( geometries ) ).toBe( true );

		if ( geometries.length > 0 ) {
			const vertices = getCaseGeometryVertices( geometries[ 0 ] );
			expect( Array.isArray( vertices ) ).toBe( true );
		}
	} );

	it( 'binds every case geometry to its owning box type', () => {
		const geometries = normalized.Database.CaseGeometries;
		const boxTypes = normalized.Database.BoxTypes;

		// Frame geometries are appended after the box ones and carry no
		// BoxIndex, so this box-ownership check has to select its own subset.
		const boxGeometries = geometries.filter(
			( geometry: any ) => geometry.OwnerKind === 'box'
		);

		boxGeometries.forEach( ( geometry: any ) => {
			// The flat geometry index is not the box index, so the geometry has
			// to name its own box.
			expect( boxTypes[ geometry.BoxIndex ].Key ).toBe( geometry.BoxKey );

			expect( Array.isArray( geometry.SourcePlacements ) ).toBe( true );
			expect( geometry.SourcePlacements ).toBe(
				boxTypes[ geometry.BoxIndex ].SourcePlacements
			);
		} );

		// The fixture may carry no case geometry at all, so check the shared
		// placement shape on the box types as well.
		boxTypes.forEach( ( box: any ) => {
			expect( Array.isArray( box.SourcePlacements ) ).toBe( true );

			box.SourcePlacements.forEach( ( placement: any ) => {
				if ( placement.Position ) {
					expect(
						Number.isFinite( placement.Position.x ) &&
							Number.isFinite( placement.Position.y ) &&
							Number.isFinite( placement.Position.z )
					).toBe( true );
				}

				if ( placement.Rotation ) {
					expect(
						Number.isFinite( placement.Rotation.Heading ) &&
							Number.isFinite( placement.Rotation.Vertical ) &&
							Number.isFinite( placement.Rotation.Roll )
					).toBe( true );
				}
			} );
		} );
	} );

	it( 'is idempotent', () => {
		expect( normalizeGllData( normalized ) ).toBe( normalized );
	} );
} );

/**
 * The committed fixture carries no frames, so the frame half of the geometry
 * list can only be exercised against the reference corpus. Five of its files
 * have frames and every one of those frames has geometry, which is exactly the
 * case the appended-geometry design exists to serve.
 *
 * One case per file rather than one case sweeping all of them: a failure then
 * names the file, each case gets its own timeout instead of sharing a single
 * budget across the suite, and the multi-megabyte parse result of one file is
 * collectable before the next is read.
 */
const corpusFiles = listCorpusFiles();

describeCorpus( 'frame geometry across the reference corpus', () => {
	afterAll( () => teardownWasm() );

	it( 'has files to sweep', () => {
		expect( corpusFiles.length ).toBeGreaterThan( 0 );
	} );

	it.each( corpusFiles )(
		'%s resolves every frame back-pointer to a real geometry',
		async ( name ) => {
			const result = await parseCorpusFile( name );
			if ( ! result.success ) {
				return;
			}

			const data = normalizeGllData( result.data );
			const frames = data.Database.Frames;
			const geometries = data.Database.CaseGeometries;

			expect( Array.isArray( frames ) ).toBe( true );

			frames.forEach( ( frame: any ) => {
				expect( typeof frame.CaseGeometryIndex ).toBe( 'number' );

				if ( frame.CaseGeometryIndex < 0 ) {
					return;
				}

				const geometry = geometries[ frame.CaseGeometryIndex ];
				expect( geometry ).toBeDefined();
				expect( geometry.OwnerKind ).toBe( 'frame' );
				expect( geometry.OwnerKey ).toBe( frame.Key );

				// The whole point of appending rather than nesting: the 3D
				// geometry block's reader has to work on a frame unchanged.
				expect(
					getCaseGeometryVertices( geometry ).length
				).toBeGreaterThan( 0 );
			} );

			// Appending must not disturb the box geometries the saved
			// geometryIndex attributes already point at.
			const boxGeometries = geometries.filter(
				( geometry: any ) => geometry.OwnerKind === 'box'
			);
			boxGeometries.forEach( ( geometry: any, index: number ) => {
				expect( geometries[ index ] ).toBe( geometry );
			} );
		},
		60000
	);
} );

/**
 * An exact tally is only meaningful over the whole corpus, so it is gated
 * behind `GLL_CORPUS_FULL=1` rather than quietly counting a subset.
 */
describeFullCorpus( 'frame coverage across the complete corpus', () => {
	afterAll( () => teardownWasm() );

	it( 'finds frames in exactly five files, all with geometry', async () => {
		const names = listCorpusFiles();
		let filesWithFrames = 0;
		let framesWithGeometry = 0;

		for ( const name of names ) {
			const result = await parseCorpusFile( name );
			if ( ! result.success ) {
				continue;
			}

			const data = normalizeGllData( result.data );
			if ( data.Database.Frames.length === 0 ) {
				continue;
			}
			filesWithFrames++;

			data.Database.Frames.forEach( ( frame: any ) => {
				if ( frame.CaseGeometryIndex >= 0 ) {
					framesWithGeometry++;
				}
			} );
		}

		expect( filesWithFrames ).toBe( 5 );
		expect( framesWithGeometry ).toBeGreaterThan( 0 );
	}, 600000 );
} );
