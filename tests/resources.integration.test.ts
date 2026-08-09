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

import { normalizeGllData } from '../src/shared/gll-normalize';
import {
	describeCorpus,
	describeFullCorpus,
	listCorpusFiles,
	parseCorpusFile as parseRawCorpusFile,
	teardownWasm,
} from './helpers/wasm-harness';

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
	const result = await parseRawCorpusFile( file );
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

const corpusFiles = listCorpusFiles();

describeCorpus( 'embedded resources against the real corpus', () => {
	afterAll( () => teardownWasm() );

	it( 'has files to sweep', () => {
		expect( corpusFiles.length ).toBeGreaterThan( 0 );
	} );

	it.each( corpusFiles )(
		'%s holds the embedded-file invariants',
		async ( file ) => {
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
		},
		60000
	);

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
	}, 60000 );

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
	}, 60000 );

	it( 'drops both blank slots in 3Way-LR', async () => {
		// The parser emits two data-file records here and both are unused
		// padding; this is the file that proves the filter is needed.
		const data = await parseCorpusFile( '3Way-LR.gll' );

		expect( data.Database.DataFiles ).toEqual( [] );
		expect( data.Database.IncludeFiles ).toEqual( [] );
	}, 60000 );
} );

/**
 * The distribution of embedded files across the corpus.
 *
 * These are exact counts over all 30 files, so they are meaningless against the
 * size-bounded default sweep and only run under `GLL_CORPUS_FULL=1`. If they
 * move, either the parser changed or the blank-slot filter did — both worth a
 * deliberate look rather than a silent pass.
 */
describeFullCorpus( 'resource distribution across the complete corpus', () => {
	afterAll( () => teardownWasm() );

	it( 'matches the recorded documentation and data-file counts', async () => {
		let withDocs = 0;
		let withDataFiles = 0;
		let withNeither = 0;

		for ( const file of listCorpusFiles() ) {
			const data = await parseCorpusFile( file );
			const docs = data.Database.IncludeFiles;
			const dataFiles = data.Database.DataFiles;

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

		expect( withDocs ).toBe( 3 );
		expect( withDataFiles ).toBe( 24 );
		expect( withNeither ).toBe( 5 );
	}, 600000 );
} );
