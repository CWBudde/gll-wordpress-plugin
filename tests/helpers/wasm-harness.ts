/**
 * Shared bootstrap for the tests that drive the real Go WASM parser.
 *
 * Five test files previously re-implemented this sequence verbatim, and each
 * booted its own Go instance and swept the whole reference corpus. With the
 * largest corpus file at 16 MB and 30 files on disk, that put the integration
 * project past five minutes and one sweep past its timeout.
 *
 * This file is deliberately not named `*.test.ts`, so neither Jest project
 * picks it up as a suite.
 *
 * @package
 */

import { existsSync, promises as fs, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const PROJECT_ROOT = path.resolve( __dirname, '..', '..' );
export const WASM_PATH = path.join(
	PROJECT_ROOT,
	'assets',
	'wasm',
	'gll.wasm'
);
export const WASM_EXEC_PATH = path.join(
	PROJECT_ROOT,
	'assets',
	'wasm',
	'wasm_exec.js'
);
export const FIXTURE_PATH = path.join(
	PROJECT_ROOT,
	'tests',
	'fixtures',
	'sample.gll'
);

/**
 * The reference corpus of real manufacturer GLL files.
 *
 * Third-party data, so it is not vendored; point `GLL_CORPUS` at a directory of
 * `.gll` files to run the corpus-backed assertions. Absent, they skip — which
 * is the normal state in CI.
 */
export const CORPUS_PATH =
	process.env.GLL_CORPUS || '/mnt/projekte/Code/gll-tools/testdata/gll';

export const hasCorpus = existsSync( CORPUS_PATH );
export const hasFixture = existsSync( FIXTURE_PATH );

/** Run a suite only when the reference corpus is reachable. */
export const describeCorpus = hasCorpus ? describe : describe.skip;

/** Run a suite only when the committed fixture is present. */
export const describeFixture = hasFixture ? describe : describe.skip;

/**
 * Whether the caller asked for every corpus file regardless of size.
 *
 * The default run skips the handful of very large files, which is most of the
 * bytes and most of the wall clock. Set `GLL_CORPUS_FULL=1` before a release to
 * sweep everything.
 */
export const isFullCorpusRun = process.env.GLL_CORPUS_FULL === '1';

/** Suites that only make sense over the complete corpus, e.g. exact tallies. */
export const describeFullCorpus =
	hasCorpus && isFullCorpusRun ? describe : describe.skip;

/**
 * Size ceiling for the default corpus sweep, in bytes.
 *
 * Four megabytes keeps 22 of the 30 reference files while dropping roughly
 * 99 MB of the 180 MB on disk.
 */
const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;

const maxBytes = Number( process.env.GLL_CORPUS_MAX_BYTES );
export const CORPUS_MAX_BYTES =
	Number.isFinite( maxBytes ) && maxBytes > 0 ? maxBytes : DEFAULT_MAX_BYTES;

/**
 * How many files a single Go instance parses before being replaced.
 *
 * The Go heap inside a WASM instance grows and is never returned to the host,
 * so a full sweep of the largest files in one instance accumulates hundreds of
 * megabytes. Re-instantiating costs about 200 ms, which is noise next to a
 * 16 MB parse.
 */
const PARSES_PER_INSTANCE = 8;

let parseCount = 0;
let booted = false;

/**
 * Instantiate the Go runtime and expose `globalThis.parseGLL`.
 *
 * Idempotent: safe to call from every `beforeAll` in a file.
 */
export async function bootstrapWasm(): Promise< void > {
	if ( booted && typeof ( globalThis as any ).parseGLL === 'function' ) {
		return;
	}

	// jsdom ships neither, and the Go runtime refuses to load without them.
	// The node-based integration tests already run against Node's own.
	if ( ! ( globalThis as any ).TextEncoder ) {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { TextEncoder, TextDecoder } = require( 'node:util' );
		( globalThis as any ).TextEncoder = TextEncoder;
		( globalThis as any ).TextDecoder = TextDecoder;
	}

	// eslint-disable-next-line @typescript-eslint/no-var-requires
	require( WASM_EXEC_PATH );

	const wasmBytes = await fs.readFile( WASM_PATH );
	const go = new ( globalThis as any ).Go();
	const { instance } = await WebAssembly.instantiate(
		wasmBytes,
		go.importObject
	);
	// Never resolves: the Go scheduler keeps running for the process lifetime.
	void go.run( instance );

	( globalThis as any ).__gllGo = go;
	booted = true;
	parseCount = 0;
}

/**
 * Release the Go runtime's pending timers.
 *
 * `go.run()` never settles, and wasm_exec keeps the scheduler alive with a
 * pending `setTimeout`. Left alone that is an open handle at the end of every
 * file, which Jest reports as a worker failing to exit gracefully. Clearing the
 * timers it registered is the honest fix; `--forceExit` would only hide it and
 * can truncate coverage output.
 */
export function teardownWasm(): void {
	const go = ( globalThis as any ).__gllGo;
	const scheduled = go?._scheduledTimeouts;

	if ( scheduled && typeof scheduled.forEach === 'function' ) {
		scheduled.forEach( ( timer: any ) => clearTimeout( timer ) );
		if ( typeof scheduled.clear === 'function' ) {
			scheduled.clear();
		}
	}

	delete ( globalThis as any ).parseGLL;
	delete ( globalThis as any ).__gllGo;
	booted = false;
}

/**
 * List the corpus files this run should sweep.
 *
 * Synchronous because `it.each` needs the list at collection time, before any
 * hook has had a chance to run. Sorted so the set is stable across machines,
 * and size-bounded unless `GLL_CORPUS_FULL=1` is set.
 *
 * Returns an empty list when the corpus is absent, so callers can pass it
 * straight to `it.each` inside a suite that is about to be skipped anyway.
 *
 * @return {string[]} File names within `CORPUS_PATH`.
 */
export function listCorpusFiles(): string[] {
	if ( ! hasCorpus ) {
		return [];
	}

	const names = readdirSync( CORPUS_PATH )
		.filter( ( name ) => name.toLowerCase().endsWith( '.gll' ) )
		.sort();

	if ( isFullCorpusRun ) {
		return names;
	}

	return names.filter(
		( name ) =>
			statSync( path.join( CORPUS_PATH, name ) ).size <= CORPUS_MAX_BYTES
	);
}

/**
 * Parse one corpus file and return the raw parser payload.
 *
 * Re-instantiates the Go runtime periodically so a long sweep does not carry
 * every previous file's allocations.
 *
 * @param {string} name File name within `CORPUS_PATH`.
 * @return {Promise<any>} The decoded parser result.
 */
export async function parseCorpusFile( name: string ): Promise< any > {
	if ( parseCount >= PARSES_PER_INSTANCE ) {
		teardownWasm();
	}
	await bootstrapWasm();
	parseCount++;

	const bytes = await fs.readFile( path.join( CORPUS_PATH, name ) );
	return JSON.parse(
		( globalThis as any ).parseGLL( new Uint8Array( bytes ) )
	);
}

/**
 * Parse the committed fixture.
 *
 * @return {Promise<any>} The decoded parser result.
 */
export async function parseFixture(): Promise< any > {
	await bootstrapWasm();

	const bytes = await fs.readFile( FIXTURE_PATH );
	return JSON.parse(
		( globalThis as any ).parseGLL( new Uint8Array( bytes ) )
	);
}
