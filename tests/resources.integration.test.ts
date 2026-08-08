/**
 * Integration test: drive the real gll.wasm over the reference corpus and check
 * that the embedded-file lists the resources block renders survive
 * normalization intact.
 *
 * The corpus lives outside this repository (the files are third-party
 * manufacturer GLLs, so they are not vendored here), which means these tests
 * skip wherever it is absent — CI included. Point GLL_CORPUS at a directory of
 * `.gll` files to run them elsewhere.
 *
 * The assertion that earns this file its keep is the base64 round trip: a
 * `data_uri` whose payload does not decode to exactly `Size` bytes means the
 * WASM layer truncated or mis-encoded the file, and nothing else would notice
 * until a reader downloaded a corrupt PDF.
 *
 * Mirrors the WASM bootstrap in gll-normalize.integration.test.ts.
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { normalizeGllData } from '../src/shared/gll-normalize';

const PROJECT_ROOT = path.resolve( __dirname, '..' );
const WASM_PATH = path.join( PROJECT_ROOT, 'assets', 'wasm', 'gll.wasm' );
const WASM_EXEC_PATH = path.join(
	PROJECT_ROOT,
	'assets',
	'wasm',
	'wasm_exec.js'
);

const CORPUS_PATH =
	process.env.GLL_CORPUS || '/mnt/projekte/Code/gll-tools/testdata/gll';

const hasCorpus = existsSync( CORPUS_PATH );
const maybeDescribe = hasCorpus ? describe : describe.skip;

// Several corpus files run to 16 MB and the whole sweep parses ~30 of them, so
// the 30 s global timeout in jest.config.js is not enough.
jest.setTimeout( 300000 );

/**
 * Parse one GLL through the real WASM parser and normalize it.
 *
 * Deliberately parses a single file per call so multi-megabyte base64 payloads
 * fall out of scope between cases rather than accumulating.
 *
 * @param {string} file File name within the corpus directory.
 * @return {Promise<Object>} Normalized GLL data.
 */
async function parseCorpusFile( file: string ): Promise< any > {
	const bytes = await fs.readFile( path.join( CORPUS_PATH, file ) );
	const result = JSON.parse(
		( globalThis as any ).parseGLL( new Uint8Array( bytes ) )
	);
	expect( result.success ).toBe( true );
	return normalizeGllData( result.data );
}

/**
 * Decoded byte length of a base64 data URI payload.
 *
 * @param {string} dataUri Data URI emitted by the WASM layer.
 * @return {number} Number of bytes the payload decodes to.
 */
function decodedLength( dataUri: string ): number {
	return Buffer.from( dataUri.slice( dataUri.indexOf( ',' ) + 1 ), 'base64' )
		.length;
}

maybeDescribe( 'embedded resources against the real corpus', () => {
	let files: string[] = [];

	beforeAll( async () => {
		require( WASM_EXEC_PATH );

		const wasmBytes = await fs.readFile( WASM_PATH );
		const go = new ( globalThis as any ).Go();
		const { instance } = await WebAssembly.instantiate(
			wasmBytes,
			go.importObject
		);
		void go.run( instance );

		files = ( await fs.readdir( CORPUS_PATH ) )
			.filter( ( f ) => f.toLowerCase().endsWith( '.gll' ) )
			.sort();
		expect( files.length ).toBeGreaterThan( 0 );
	} );

	// One sweep, not two: the corpus is 180 MB and parsing it takes about a
	// minute, so the per-entry invariants and the aggregate counts share a
	// single pass rather than each paying for their own.
	it( 'holds its invariants and its distribution across the whole corpus', async () => {
		let withDocs = 0;
		let withDataFiles = 0;
		let withNeither = 0;

		for ( const file of files ) {
			const data = await parseCorpusFile( file );
			const docs = data.Database.IncludeFiles;
			const dataFiles = data.Database.DataFiles;

			for ( const entry of [ ...docs, ...dataFiles ] ) {
				// Blank table slots must never reach a consumer.
				expect( entry.Filename.trim() ).not.toBe( '' );
				expect( entry.Size ).toBeGreaterThan( 0 );

				// The base name is what lands in a download attribute, so it
				// must not still be carrying a path.
				expect( entry.Name ).not.toMatch( /[\\/]/ );
				expect( entry.Name ).not.toBe( '' );

				if ( entry.DataUri ) {
					expect( entry.DataUri.startsWith( 'data:' ) ).toBe( true );
					expect( decodedLength( entry.DataUri ) ).toBe( entry.Size );
				}
			}

			if ( docs.length > 0 ) {
				withDocs++;
			}
			if ( dataFiles.length > 0 ) {
				withDataFiles++;
			}
			if ( docs.length === 0 && dataFiles.length === 0 ) {
				withNeither++;
			}
		}

		// If these move, either the parser changed or the blank-slot filter
		// did. Both are worth a deliberate look rather than a silent pass.
		expect( withDocs ).toBe( 3 );
		expect( withDataFiles ).toBe( 24 );
		expect( withNeither ).toBe( 5 );
	} );

	it( 'reads the four labelled datasheets out of the Coda G-Series', async () => {
		const data = await parseCorpusFile( 'Coda-Audio G-Series-V1_2.gll' );
		const docs = data.Database.IncludeFiles;

		expect( docs.map( ( d: any ) => d.Label ) ).toEqual( [
			'G512 Data',
			'G515 Data',
			'G712 Data',
			'G715 Data',
		] );
		docs.forEach( ( doc: any ) => {
			expect(
				doc.DataUri.startsWith( 'data:application/pdf;base64,' )
			).toBe( true );
			// %PDF
			expect(
				Buffer.from(
					doc.DataUri.slice( doc.DataUri.indexOf( ',' ) + 1 ),
					'base64'
				)
					.subarray( 0, 4 )
					.toString( 'latin1' )
			).toBe( '%PDF' );
		} );
	} );

	it( 'folds the two-level drawing path in HOPS7-Pro', async () => {
		// The only corpus file nesting a second directory level, and the
		// largest single embedded file at 2.17 MB.
		const data = await parseCorpusFile( 'HOPS7-Pro V1_0.gll' );

		expect( data.Database.IncludeFiles ).toHaveLength( 1 );
		expect( data.Database.IncludeFiles[ 0 ].Size ).toBe( 2172055 );

		const nested = data.Database.DataFiles.find( ( f: any ) =>
			f.Filename.includes( 'Logo Drawings' )
		);
		expect( nested ).toBeDefined();
		expect( nested.Name ).not.toMatch( /[\\/]/ );
	} );

	it( 'drops both blank slots in 3Way-LR', async () => {
		// The parser emits two data-file records here and both are unused
		// padding; this is the file that proves the filter is needed.
		const data = await parseCorpusFile( '3Way-LR.gll' );

		expect( data.Database.DataFiles ).toEqual( [] );
		expect( data.Database.IncludeFiles ).toEqual( [] );
	} );
} );
