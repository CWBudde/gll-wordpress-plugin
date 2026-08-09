/**
 * Tests for the Node parser runner that the server-side backend spawns.
 *
 * `GLL_Parser_Node` invokes `assets/parser/gll-parse.mjs` as a subprocess, and
 * the PHP suite cannot cover it: the wp-env container has no Node, which is
 * representative of most shared hosting rather than an oversight. So the two
 * halves are tested where each can run — PHP's spawning and error handling in
 * `tests/php/GLL_Parser_Test.php` against a stub backend, and the runner itself
 * here, under Jest, on a host that has Node by definition.
 *
 * The pruning is the part worth pinning. Without it PHP would have to
 * `json_decode()` up to 228.7 MB for a large file, which is more memory than a
 * normal PHP process is given, and server-side parsing would quietly work only
 * for small files.
 *
 * @package
 */

import { execFile } from 'node:child_process';
import { promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

import {
	CORPUS_PATH,
	PROJECT_ROOT,
	describeCorpus,
	hasFixture,
	listCorpusFiles,
} from './helpers/wasm-harness';

const run = promisify( execFile );

const RUNNER = path.join( PROJECT_ROOT, 'assets', 'parser', 'gll-parse.mjs' );
const FIXTURE = path.join( PROJECT_ROOT, 'tests', 'fixtures', 'sample.gll' );

/**
 * Run the runner against a file.
 *
 * @param {string} file Path to pass as the argument.
 * @return {Promise<Object>} `{stdout, stderr, code}`.
 */
async function runRunner( file ) {
	try {
		const { stdout, stderr } = await run(
			process.execPath,
			[ RUNNER, file ],
			{
				maxBuffer: 512 * 1024 * 1024,
			}
		);
		return { stdout, stderr, code: 0 };
	} catch ( error: any ) {
		return {
			stdout: error.stdout || '',
			stderr: error.stderr || '',
			code: error.code ?? 1,
		};
	}
}

describe( 'the Node parser runner', () => {
	it( 'ships where the plugin can find it', async () => {
		// `package.json`'s `files` array includes `assets`, so this is inside
		// the distributable. A runner under `scripts/` would not be.
		await expect( fs.access( RUNNER ) ).resolves.toBeUndefined();
		expect( RUNNER.includes( `${ path.sep }assets${ path.sep }` ) ).toBe(
			true
		);
	} );

	it( 'refuses to run without a file', async () => {
		const { code, stderr } = await runRunner( '' );

		expect( code ).not.toBe( 0 );
		expect( stderr ).toContain( 'usage' );
	} );

	it( 'reports an unreadable file on stderr and exits non-zero', async () => {
		const { code, stdout, stderr } = await runRunner(
			path.join( PROJECT_ROOT, 'tests', 'fixtures', 'does-not-exist.gll' )
		);

		expect( code ).not.toBe( 0 );
		expect( stdout ).toBe( '' );
		expect( stderr ).toContain( 'gll-parse' );
	} );

	it( 'reports a file that is not a GLL', async () => {
		// package.json is real, readable, and not a GLL — the parser has to say
		// so rather than printing something the PHP side would try to reduce.
		const { code, stderr } = await runRunner(
			path.join( PROJECT_ROOT, 'package.json' )
		);

		expect( code ).not.toBe( 0 );
		expect( stderr ).toContain( 'gll-parse' );
	} );

	( hasFixture ? describe : describe.skip )(
		'against the sample fixture',
		() => {
			let parsed;

			beforeAll( async () => {
				const { code, stdout } = await runRunner( FIXTURE );
				expect( code ).toBe( 0 );
				parsed = JSON.parse( stdout );
			}, 60000 );

			it( 'prints the raw parser shape, not the success envelope', () => {
				// `GLL_Subset::from_raw()` accepts either, but printing the bare
				// data is what keeps the payload small and the contract obvious.
				expect( parsed.database ).toBeTruthy();
				expect( parsed.gen_system ).toBeTruthy();
				expect( parsed.success ).toBeUndefined();
			} );

			it( 'reduces to the same subset as the committed golden', async () => {
				// The end-to-end proof that the server path and the editor path
				// agree: this output goes to PHP, and `GLL_Subset_Test` asserts the
				// PHP reducer turns the golden raw file into the golden subset.
				const { normalizeGllData } = await import(
					'../src/shared/gll-normalize'
				);
				const { buildDisplaySubset } = await import(
					'../src/shared/gll-subset'
				);
				const golden = JSON.parse(
					await fs.readFile(
						path.join(
							PROJECT_ROOT,
							'tests',
							'fixtures',
							'sample-subset.json'
						),
						'utf8'
					)
				);

				expect(
					buildDisplaySubset( normalizeGllData( parsed ) )
				).toEqual( golden );
			} );

			it( 'keeps response counts while dropping the spectra', () => {
				// The pruning replaces each response with an empty object so the
				// array keeps its length; the reducer counts it and never knows.
				const source = parsed.database.source_definitions[ 0 ];

				expect( source.responses.length ).toBeGreaterThan( 0 );
				expect( source.responses[ 0 ] ).toEqual( {} );
				expect( source.definition.on_axis_spectrum ).toBeUndefined();
			} );

			it( 'carries no base64 payloads', () => {
				expect( JSON.stringify( parsed ) ).not.toContain( 'data:' );
				expect( parsed.resources ).toBeUndefined();
			} );

			it( 'prints far less than the unpruned parse', async () => {
				// The number that decides whether PHP can decode this at all. The
				// golden is compacted first: it is committed pretty-printed, and
				// comparing against its indentation would flatter the result.
				const unpruned = JSON.stringify(
					JSON.parse(
						await fs.readFile(
							path.join(
								PROJECT_ROOT,
								'tests',
								'fixtures',
								'sample-raw.json'
							),
							'utf8'
						)
					)
				);
				const printed = JSON.stringify( parsed );

				expect( printed.length ).toBeLessThan( unpruned.length / 2 );
			} );
		}
	);

	describeCorpus( 'against a real manufacturer file', () => {
		/**
		 * The largest file the sweep admits.
		 *
		 * @return {string} Absolute path.
		 */
		function biggest() {
			return listCorpusFiles()
				.map( ( name ) => path.join( CORPUS_PATH, name ) )
				.sort(
					( a, b ) => statSync( b ).size - statSync( a ).size
				)[ 0 ];
		}

		it( 'delivers its whole output through a pipe', async () => {
			// THE REGRESSION THIS EXISTS FOR: `process.exit()` discards
			// unflushed stdout when stdout is a pipe, which is exactly how
			// the PHP backend runs this. Output larger than the ~64 KB pipe
			// buffer arrived truncated — as valid-looking JSON that stopped
			// mid-object — while the same command redirected to a file was
			// perfect, because file writes are synchronous.
			//
			// The committed 3 KB fixture cannot reach that threshold, so
			// only a real file pins it. `execFile` gives us a pipe.
			const file = biggest();
			const { code, stdout } = await runRunner( file );

			expect( code ).toBe( 0 );
			expect( stdout.length ).toBeGreaterThan( 64 * 1024 );

			const parsed = JSON.parse( stdout );
			expect( parsed.database ).toBeTruthy();
			expect( parsed.gen_system ).toBeTruthy();
		}, 120000 );

		it( 'prints a fraction of what the parse produced', async () => {
			const file = biggest();
			const { stdout } = await runRunner( file );

			// The parser expands a GLL enormously on the way out — the
			// largest corpus file becomes 228.7 MB of JSON. PHP has to
			// decode whatever arrives, so the pruning is what makes
			// server-side parsing possible at all rather than a nicety.
			expect( stdout.length ).toBeLessThan( statSync( file ).size );

			// And none of the payloads the subset drops survive the trip.
			expect( stdout ).not.toContain( 'raw_block' );
			expect( stdout ).not.toContain( 'on_axis_spectrum' );
			expect( stdout ).not.toContain( 'data:' );
		}, 120000 );
	} );
} );
