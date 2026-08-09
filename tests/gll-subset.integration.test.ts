/**
 * Integration tests for the cacheable display subset.
 *
 * Two jobs, and the first one is the important one.
 *
 * THE GOLDEN PIN. The subset is built twice — by `src/shared/gll-subset.ts` for
 * the editor, and by `includes/class-gll-subset.php` for the server-side parser
 * backends, which hand PHP raw JSON with no JavaScript in the loop. Neither
 * suite can run the other's code, so both are held to the same committed
 * artifacts: this suite asserts the JS builder still reproduces
 * `tests/fixtures/*-subset.json` from `tests/fixtures/*-raw.json`, and
 * `tests/php/GLL_Subset_Test.php` asserts the PHP reducer reproduces the same
 * file from the same input. Regenerate both with `scripts/make-goldens.mjs`
 * whenever the shape changes on purpose, and commit the result.
 *
 * Neither golden needs the corpus, so this half runs in CI.
 *
 * THE CORPUS SWEEP. What a real manufacturer file reduces to, which is the
 * number that decides whether storing it in `wp_postmeta` was a reasonable idea.
 * Skipped unless `GLL_CORPUS` points somewhere.
 *
 * @package
 */

import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';

import { normalizeGllData } from '../src/shared/gll-normalize';
import {
	buildDisplaySubset,
	hydrateSubsetLabels,
} from '../src/shared/gll-subset';
import {
	CORPUS_PATH,
	PROJECT_ROOT,
	describeCorpus,
	listCorpusFiles,
	parseCorpusFile,
	teardownWasm,
} from './helpers/wasm-harness';

/**
 * Byte cap the PHP side enforces before storing a subset.
 *
 * Mirrors `GLL_Cache::MAX_BYTES`. A corpus file whose subset exceeded this would
 * silently never be cached, so it is asserted here rather than discovered on a
 * production site.
 */
const MAX_BYTES = 524288;

const FIXTURES = path.join( PROJECT_ROOT, 'tests', 'fixtures' );

/**
 * Read one committed golden.
 *
 * @param {string} name File name within `tests/fixtures`.
 * @return {Promise<Object>} Decoded JSON.
 */
async function golden( name ) {
	return JSON.parse(
		await fs.readFile( path.join( FIXTURES, name ), 'utf8' )
	);
}

describe( 'the golden fixtures pin both subset implementations', () => {
	it.each( [ 'sample', 'synthetic' ] )(
		'reproduces %s-subset.json from %s-raw.json',
		async ( name ) => {
			const raw = await golden( `${ name }-raw.json` );
			const expected = await golden( `${ name }-subset.json` );

			expect( buildDisplaySubset( normalizeGllData( raw ) ) ).toEqual(
				expected
			);
		}
	);

	it( 'stores no translated label text in either golden', async () => {
		// The PHP reducer has no label tables at all, so a golden that carried
		// label text could never be reproduced by it. This is the assertion
		// that would catch someone re-adding them to the JS builder.
		const encoded = JSON.stringify(
			await golden( 'synthetic-subset.json' )
		);

		expect( encoded ).not.toContain( 'TypeLabel' );
		expect( encoded ).not.toContain( 'KindLabel' );
		expect( encoded ).not.toContain( 'FilterShapeLabel' );
		expect( encoded ).not.toContain( 'AlignmentLabel' );
	} );

	it( 'hydrates the synthetic golden back to renderable labels', async () => {
		const hydrated = hydrateSubsetLabels(
			await golden( 'synthetic-subset.json' )
		);
		const { Limits, Warnings, FilterGroups } = hydrated.Database;

		expect( Limits.map( ( limit ) => limit.TypeLabel ) ).toEqual( [
			'Max Weight',
			'Max Tilt Angle',
			// Type 9 is not a defined limit kind; the table names it rather
			// than leaving the reader with a bare number.
			'Limit Type 9',
		] );
		expect( Warnings.map( ( warning ) => warning.TypeLabel ) ).toEqual( [
			'Min Count Warning',
			'Warning Type 7',
		] );

		const filters = FilterGroups[ 0 ].Filters[ 0 ].Bank.Filters;
		expect( filters.map( ( filter ) => filter.KindLabel ) ).toEqual( [
			'IIR',
			'FIR',
			'LogSpectrum',
			// An unknown filter kind stays undefined on purpose: the callers
			// drop an empty leading token rather than printing "Filter Type 5".
			undefined,
		] );
		expect( filters[ 0 ].IIR.FilterShapeLabel ).toBe( 'Linkwitz-Riley' );
		expect( filters[ 0 ].IIR.AlignmentLabel ).toBe( '-6 dB' );
	} );

	it( 'counts only the geometry a renderer could draw', async () => {
		// The synthetic fixture deliberately carries an edge with an unset
		// endpoint and a face with too few resolved indices. Both are dropped by
		// the normalizer, so the config block's summary and the 3D geometry
		// block cannot disagree about one mesh.
		const [ box ] = ( await golden( 'synthetic-subset.json' ) ).Database
			.CaseGeometries;

		expect( box ).toMatchObject( {
			VertexCount: 4,
			EdgeCount: 2,
			FaceCount: 2,
		} );
	} );
} );

describeCorpus( 'display subset over the reference corpus', () => {
	afterAll( () => {
		teardownWasm();
	} );

	const files = listCorpusFiles();

	it( 'has files to sweep', () => {
		expect( files.length ).toBeGreaterThan( 0 );
	} );

	it.each( files )( '%s reduces to a storable subset', async ( name ) => {
		const raw = await parseCorpusFile( name );
		const subset = buildDisplaySubset( normalizeGllData( raw.data ) );

		expect( subset ).not.toBeNull();

		const bytes = Buffer.byteLength( JSON.stringify( subset ) );
		expect( bytes ).toBeLessThanOrEqual( MAX_BYTES );

		// The two blocks served from the cache read these; a file that reduced
		// to a subset missing one of them would render an empty block rather
		// than falling back.
		expect( subset.Database ).toEqual(
			expect.objectContaining( {
				SourceDefinitions: expect.any( Array ),
				BoxTypes: expect.any( Array ),
				Frames: expect.any( Array ),
				Limits: expect.any( Array ),
				Warnings: expect.any( Array ),
				FilterGroups: expect.any( Array ),
				CaseGeometries: expect.any( Array ),
			} )
		);
	} );

	it( 'drops the payloads that make a full parse expensive', async () => {
		// The biggest file in the sweep, because the whole argument for caching
		// is about the files that are expensive to parse. The smallest one would
		// pass this trivially and report a meaningless number.
		const biggest = files
			.map( ( name ) => ( {
				name,
				size: statSync( path.join( CORPUS_PATH, name ) ).size,
			} ) )
			.sort( ( a, b ) => b.size - a.size )[ 0 ];

		const raw = await parseCorpusFile( biggest.name );
		const normalized = normalizeGllData( raw.data );
		const subset = buildDisplaySubset( normalized );

		const full = Buffer.byteLength( JSON.stringify( normalized ) );
		const reduced = Buffer.byteLength( JSON.stringify( subset ) );

		// An order of magnitude, not a byte count: the exact ratio depends on
		// which files the sweep's size bound admitted, and pinning it would make
		// this fail on a different corpus rather than on a real regression.
		expect( reduced * 10 ).toBeLessThan( full );
		expect( JSON.stringify( subset ) ).not.toContain( 'data:' );

		process.stdout.write(
			`\n  ${ biggest.name }: ${ ( biggest.size / 1024 / 1024 ).toFixed(
				1
			) } MB on disk, ${ ( full / 1024 / 1024 ).toFixed(
				1
			) } MB parsed, ${ ( reduced / 1024 ).toFixed( 1 ) } KB cached\n`
		);
	} );
} );
