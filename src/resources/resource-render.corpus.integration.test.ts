/**
 * End-to-end check: parse a real GLL and render it through the same code the
 * front end runs.
 *
 * The unit tests drive the renderer with hand-built fixtures and the normalizer
 * integration test drives real files but stops at the data. This closes the gap
 * between them, which is where a mismatch between the normalized shape and what
 * the renderer reads would otherwise hide.
 *
 * The `.integration.` infix keeps it out of the unit project and hands it to the
 * integration project, which runs under node — but the renderer needs a DOM, so
 * this file overrides the environment for itself. Skips when the corpus is
 * absent.
 *
 * The pragma has to live in this first docblock — Jest reads it nowhere else.
 *
 * @jest-environment jsdom
 */

import { normalizeGllData } from '../shared/gll-normalize';
import {
	describeCorpus,
	parseCorpusFile,
	teardownWasm,
} from '../../tests/helpers/wasm-harness';
import { renderResources } from './resource-render';

const OPTIONS = {
	showDocumentation: true,
	showDataFiles: true,
	showPreviews: true,
	previewMaxHeight: 240,
	hideWhenEmpty: false,
};

/**
 * Build a block element shaped like save()'s output.
 *
 * @return {HTMLElement} Block element with a content container.
 */
function makeBlock(): HTMLElement {
	const block = document.createElement( 'div' );
	block.className = 'gll-resources-block';
	const content = document.createElement( 'div' );
	content.className = 'gll-resources-content';
	block.appendChild( content );
	return block;
}

/**
 * Parse a corpus file, normalize it, and render it into a fresh block.
 *
 * @param {string} file File name within the corpus directory.
 * @return {Promise<HTMLElement>} The rendered block.
 */
async function renderCorpusFile( file: string ): Promise< HTMLElement > {
	const result = await parseCorpusFile( file );
	expect( result.success ).toBe( true );

	const block = makeBlock();
	renderResources( block, normalizeGllData( result.data ), OPTIONS );
	return block;
}

describeCorpus( 'rendering real GLL files', () => {
	afterAll( () => teardownWasm() );

	it( 'renders the Coda datasheets as working PDF downloads', async () => {
		const block = await renderCorpusFile( 'Coda-Audio G-Series-V1_2.gll' );

		const links = Array.from(
			block.querySelectorAll< HTMLAnchorElement >(
				'.gll-resource-download'
			)
		);
		const pdfs = links.filter( ( a ) =>
			( a.getAttribute( 'download' ) || '' ).endsWith( '.pdf' )
		);
		expect( pdfs ).toHaveLength( 4 );

		pdfs.forEach( ( link ) => {
			const href = link.getAttribute( 'href' ) || '';
			expect( href.startsWith( 'data:application/pdf;base64,' ) ).toBe(
				true
			);
			// The bytes behind the link must really be a PDF.
			expect(
				Buffer.from( href.slice( href.indexOf( ',' ) + 1 ), 'base64' )
					.subarray( 0, 4 )
					.toString( 'latin1' )
			).toBe( '%PDF' );
		} );
	}, 60000 );

	it( 'previews the embedded logo of a typical file', async () => {
		const block = await renderCorpusFile( 'APS-V1_1.gll' );

		const img = block.querySelector< HTMLImageElement >(
			'.gll-resource-preview img'
		);
		expect( img ).not.toBeNull();

		const src = img!.getAttribute( 'src' ) || '';
		expect( src.startsWith( 'data:image/png;base64,' ) ).toBe( true );
		// PNG signature.
		expect(
			Array.from(
				Buffer.from(
					src.slice( src.indexOf( ',' ) + 1 ),
					'base64'
				).subarray( 0, 4 )
			)
		).toEqual( [ 0x89, 0x50, 0x4e, 0x47 ] );
	}, 60000 );

	it( 'renders no blank rows for a file whose slots are all unused', async () => {
		const block = await renderCorpusFile( '3Way-LR.gll' );

		expect( block.querySelectorAll( '.gll-resource-item' ) ).toHaveLength(
			0
		);
		expect(
			block.querySelector( '.gll-resources-empty' )!.textContent
		).toBe( 'This GLL file contains no embedded resources.' );
	}, 60000 );

	it( 'never leaves a path separator in a download name', async () => {
		// Data-file names arrive as `.\Drawings\...`; a stray separator would
		// mean the browser saves under a name nobody asked for.
		const block = await renderCorpusFile( 'HOPS7-Pro V1_0.gll' );

		const names = Array.from(
			block.querySelectorAll< HTMLAnchorElement >(
				'.gll-resource-download'
			)
		).map( ( a ) => a.getAttribute( 'download' ) || '' );

		expect( names.length ).toBeGreaterThan( 0 );
		names.forEach( ( name ) => {
			expect( name ).not.toMatch( /[\\/]/ );
			expect( name ).not.toBe( '' );
		} );
	}, 60000 );
} );
