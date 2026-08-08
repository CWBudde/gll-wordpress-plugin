/**
 * Unit tests for the resource view model.
 *
 * The module is imported directly rather than through the `../shared` barrel;
 * the barrel pulls in three.js' untransformed ESM OrbitControls and breaks
 * under Jest. This module has no shared imports at all, which is the point of
 * keeping it pure.
 */

import {
	formatFileSize,
	isImageResource,
	classifyResource,
	buildResourceItems,
	collectResources,
} from './resource-model';

const PNG_URI = 'data:image/png;base64,iVBORw0KGgo=';
const PDF_URI = 'data:application/pdf;base64,JVBERi0=';
const BINARY_URI = 'data:application/octet-stream;base64,AAAA';

describe( 'formatFileSize', () => {
	it( 'formats real corpus sizes', () => {
		// Whole numbers below 1 KB, one decimal above — matching the reference
		// viewer so the same file reads the same in both UIs.
		expect( formatFileSize( 0 ) ).toBe( '0 B' );
		expect( formatFileSize( 337 ) ).toBe( '337 B' );
		expect( formatFileSize( 1023 ) ).toBe( '1023 B' );
		expect( formatFileSize( 1024 ) ).toBe( '1.0 KB' );
		expect( formatFileSize( 14737 ) ).toBe( '14.4 KB' );
		expect( formatFileSize( 2172055 ) ).toBe( '2.1 MB' );
	} );

	it( 'returns an em dash rather than NaN for unusable input', () => {
		expect( formatFileSize( undefined ) ).toBe( '—' );
		expect( formatFileSize( NaN ) ).toBe( '—' );
		expect( formatFileSize( -1 ) ).toBe( '—' );
		expect( formatFileSize( Infinity ) ).toBe( '—' );
	} );
} );

describe( 'isImageResource', () => {
	it( 'requires both a raster extension and an image data URI', () => {
		expect( isImageResource( 'logo.png', PNG_URI ) ).toBe( true );
		// The corpus contains both black.PNG and Blank.png.
		expect( isImageResource( 'BLACK.PNG', PNG_URI ) ).toBe( true );
		expect( isImageResource( 'photo.jpeg', PNG_URI ) ).toBe( true );

		// A name that looks like an image but was not inlined as one: the WASM
		// MIME map is extension-driven and unknown types fall through to
		// octet-stream, which would render as a broken image.
		expect( isImageResource( 'logo.png', BINARY_URI ) ).toBe( false );
		expect( isImageResource( 'logo.png', undefined ) ).toBe( false );

		expect( isImageResource( 'sheet.pdf', PDF_URI ) ).toBe( false );
		expect( isImageResource( 'cabinet.xed', BINARY_URI ) ).toBe( false );
	} );

	it( 'cannot be satisfied by SVG', () => {
		expect(
			isImageResource( 'icon.svg', 'data:image/svg+xml;base64,PHN2Zz4=' )
		).toBe( false );
	} );
} );

describe( 'classifyResource', () => {
	it( 'separates images, PDFs, archives and everything else', () => {
		expect( classifyResource( 'logo.png', PNG_URI ) ).toBe( 'image' );
		expect( classifyResource( 'sheet.pdf', PDF_URI ) ).toBe( 'pdf' );
		expect( classifyResource( 'bundle.zip', BINARY_URI ) ).toBe(
			'archive'
		);
		expect( classifyResource( 'cabinet.xed', BINARY_URI ) ).toBe( 'file' );
		// An un-inlined PNG is not previewable, but it is still a PDF-less
		// ordinary file rather than an image.
		expect( classifyResource( 'logo.png', undefined ) ).toBe( 'file' );
	} );
} );

describe( 'buildResourceItems', () => {
	it( 'prefers the label as the title and keeps the name as a subtitle', () => {
		const [ item ] = buildResourceItems(
			[
				{
					Label: 'G512 Data',
					Filename: 'CODA Data Sheet - G512-Pro.pdf',
					Name: 'CODA Data Sheet - G512-Pro.pdf',
					Size: 523073,
					DataUri: PDF_URI,
				},
			],
			{ list: 'doc' }
		);

		expect( item.title ).toBe( 'G512 Data' );
		expect( item.subtitle ).toBe( 'CODA Data Sheet - G512-Pro.pdf' );
		expect( item.sizeText ).toBe( '510.8 KB' );
		expect( item.kind ).toBe( 'pdf' );
		expect( item.downloadLabel ).toContain(
			'CODA Data Sheet - G512-Pro.pdf'
		);
	} );

	it( 'omits the subtitle when it would just repeat the title', () => {
		const [ item ] = buildResourceItems(
			[ { Filename: 'logo.png', Name: 'logo.png', Size: 10 } ],
			{ list: 'data' }
		);

		expect( item.title ).toBe( 'logo.png' );
		expect( item.subtitle ).toBeUndefined();
	} );

	it( 'keeps ids unique when two entries share a base name', () => {
		// black.PNG recurs across the corpus, and a document and a data file
		// could collide too.
		const items = buildResourceItems(
			[
				{ Filename: 'a\\black.PNG', Name: 'black.PNG', Size: 337 },
				{ Filename: 'b\\black.PNG', Name: 'black.PNG', Size: 337 },
			],
			{ list: 'data' }
		);

		expect( items[ 0 ].id ).not.toBe( items[ 1 ].id );
	} );

	it( 'withholds the preview URI when previews are off', () => {
		const [ item ] = buildResourceItems(
			[
				{
					Filename: 'logo.png',
					Name: 'logo.png',
					Size: 10,
					DataUri: PNG_URI,
				},
			],
			{ list: 'data', previews: false }
		);

		expect( item.isImage ).toBe( true );
		expect( item.previewUri ).toBeUndefined();
		// Turning previews off must not take the download with it.
		expect( item.downloadUri ).toBe( PNG_URI );
	} );

	it( 'leaves downloadUri unset when the parser did not inline the bytes', () => {
		const [ item ] = buildResourceItems(
			[ { Filename: 'big.xed', Name: 'big.xed', Size: 900 } ],
			{ list: 'data' }
		);

		expect( item.downloadUri ).toBeUndefined();
		expect( item.sizeText ).toBe( '900 B' );
	} );

	it( 'falls back to a usable download name for degenerate input', () => {
		const items = buildResourceItems(
			[
				{ Filename: '..', Name: '..', Size: 1 },
				{ Filename: '/', Name: '/', Size: 1 },
			],
			{ list: 'data' }
		);

		expect( items[ 0 ].name ).toBe( 'download' );
		expect( items[ 1 ].name ).toBe( 'download' );
	} );

	it( 'tolerates an absent list', () => {
		expect( buildResourceItems( undefined, { list: 'doc' } ) ).toEqual(
			[]
		);
	} );
} );

describe( 'collectResources', () => {
	const data = {
		Database: {
			IncludeFiles: [
				{
					Label: 'Datasheet',
					Filename: 'sheet.pdf',
					Name: 'sheet.pdf',
					Size: 100,
					DataUri: PDF_URI,
				},
			],
			DataFiles: [
				{
					Filename: 'logo.png',
					Name: 'logo.png',
					Size: 50,
					DataUri: PNG_URI,
				},
			],
		},
	};

	it( 'collects both lists by default', () => {
		const result = collectResources( data );

		expect( result.documentation ).toHaveLength( 1 );
		expect( result.dataFiles ).toHaveLength( 1 );
		expect( result.isEmpty ).toBe( false );
	} );

	it( 'honours the section toggles', () => {
		expect(
			collectResources( data, { showDocumentation: false } ).documentation
		).toEqual( [] );
		expect(
			collectResources( data, { showDataFiles: false } ).dataFiles
		).toEqual( [] );
	} );

	it( 'reports emptiness when both sections are switched off', () => {
		const result = collectResources( data, {
			showDocumentation: false,
			showDataFiles: false,
		} );

		expect( result.isEmpty ).toBe( true );
	} );

	it( 'reports emptiness for a file with no embedded resources', () => {
		// 5 of 29 corpus files, 3Way-LR.gll among them.
		const result = collectResources( {
			Database: { IncludeFiles: [], DataFiles: [] },
		} );

		expect( result.isEmpty ).toBe( true );
	} );

	it( 'tolerates missing data entirely', () => {
		expect( collectResources( null ).isEmpty ).toBe( true );
		expect( collectResources( {} ).isEmpty ).toBe( true );
	} );
} );
