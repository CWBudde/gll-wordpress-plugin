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

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { normalizeGllData } from '../src/shared/gll-normalize';
import { getBalloonGrid, computePolarSlices } from '../src/shared/polar-utils';
import { buildSourceResponseSeries } from '../src/shared/charting-utils';
import {
	buildFullSphereLevels,
	computeGlobalMaxLevel,
} from '../src/shared/balloon-utils';
import { getCaseGeometryVertices } from '../src/shared/geometry-utils';

const PROJECT_ROOT = path.resolve( __dirname, '..' );
const WASM_PATH = path.join( PROJECT_ROOT, 'assets', 'wasm', 'gll.wasm' );
const WASM_EXEC_PATH = path.join(
	PROJECT_ROOT,
	'assets',
	'wasm',
	'wasm_exec.js'
);
const FIXTURE_PATH = path.join(
	PROJECT_ROOT,
	'tests',
	'fixtures',
	'sample.gll'
);

const hasFixture = existsSync( FIXTURE_PATH );
const maybeDescribe = hasFixture ? describe : describe.skip;

maybeDescribe( 'normalizeGllData against the real parser', () => {
	let normalized: any;

	beforeAll( async () => {
		require( WASM_EXEC_PATH );

		const wasmBytes = await fs.readFile( WASM_PATH );
		const go = new ( globalThis as any ).Go();
		const { instance } = await WebAssembly.instantiate(
			wasmBytes,
			go.importObject
		);
		void go.run( instance );

		const fileBytes = await fs.readFile( FIXTURE_PATH );
		const result = JSON.parse(
			( globalThis as any ).parseGLL( new Uint8Array( fileBytes ) )
		);
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
		const maxLevel = computeGlobalMaxLevel( source, grid );
		const levels = buildFullSphereLevels( source, grid, 0 );

		expect( Number.isFinite( maxLevel ) ).toBe( true );
		expect( levels.length ).toBeGreaterThan( 0 );
		expect( levels.some( ( v ) => v > -100 ) ).toBe( true );
	} );

	it( 'exposes case geometries as a flat, indexable list', () => {
		const geometries = normalized.Database.CaseGeometries;
		expect( Array.isArray( geometries ) ).toBe( true );

		if ( geometries.length > 0 ) {
			const vertices = getCaseGeometryVertices( geometries[ 0 ] );
			expect( Array.isArray( vertices ) ).toBe( true );
		}
	} );

	it( 'is idempotent', () => {
		expect( normalizeGllData( normalized ) ).toBe( normalized );
	} );
} );
