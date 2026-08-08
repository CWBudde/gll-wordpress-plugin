/**
 * Tests for the frontend DOM rendering.
 *
 * This is the path readers actually hit, and it is where the download wiring
 * lives, so it is worth covering directly rather than inferring from the editor
 * tests — the two render the same data through entirely separate code.
 *
 * The module deliberately imports nothing but resource-model, so none of the
 * WASM or three.js machinery has to be mocked.
 */

import { renderResources } from './resource-render';

const PDF_URI = 'data:application/pdf;base64,JVBERi0=';
const PNG_URI = 'data:image/png;base64,iVBORw0KGgo=';

const DEFAULT_OPTIONS = {
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
	content.style.display = 'none';
	block.appendChild( content );
	return block;
}

const dataWithBoth = {
	Database: {
		IncludeFiles: [
			{
				Label: 'G512 Data',
				Filename: 'CODA Data Sheet - G512-Pro.pdf',
				Name: 'CODA Data Sheet - G512-Pro.pdf',
				Size: 523073,
				DataUri: PDF_URI,
			},
		],
		DataFiles: [
			{
				Filename: '.\\Drawings\\logo.png',
				Name: 'logo.png',
				Size: 5028,
				DataUri: PNG_URI,
			},
		],
	},
};

describe( 'renderResources', () => {
	it( 'renders both sections with their rows', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, DEFAULT_OPTIONS );

		const titles = Array.from(
			block.querySelectorAll( '.gll-resources-section-title' )
		).map( ( el ) => el.textContent );
		expect( titles ).toEqual( [ 'Documentation', 'Data Files' ] );

		expect( block.querySelectorAll( '.gll-resource-item' ) ).toHaveLength(
			2
		);
		expect( block.querySelector( '.gll-resources-content' ) ).toHaveStyle(
			'display: block'
		);
	} );

	it( 'wires each download to its data URI and base name', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, DEFAULT_OPTIONS );

		const links = block.querySelectorAll< HTMLAnchorElement >(
			'.gll-resource-download'
		);
		expect( links ).toHaveLength( 2 );

		expect( links[ 0 ].getAttribute( 'href' ) ).toBe( PDF_URI );
		expect( links[ 0 ].getAttribute( 'download' ) ).toBe(
			'CODA Data Sheet - G512-Pro.pdf'
		);
		// A row of buttons all reading "Download" is useless to a screen
		// reader, so each carries the file name.
		expect( links[ 0 ].getAttribute( 'aria-label' ) ).toBe(
			'Download CODA Data Sheet - G512-Pro.pdf'
		);

		// The stored Windows path must never reach the download attribute.
		expect( links[ 1 ].getAttribute( 'download' ) ).toBe( 'logo.png' );
	} );

	it( 'previews images and honours the height attribute', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, {
			...DEFAULT_OPTIONS,
			previewMaxHeight: 320,
		} );

		const img = block.querySelector< HTMLImageElement >(
			'.gll-resource-preview img'
		);
		expect( img ).not.toBeNull();
		expect( img!.getAttribute( 'src' ) ).toBe( PNG_URI );
		expect( img!.getAttribute( 'loading' ) ).toBe( 'lazy' );

		const preview = block.querySelector< HTMLElement >(
			'.gll-resource-preview'
		);
		expect(
			preview!.style.getPropertyValue( '--gll-resource-preview-max' )
		).toBe( '320px' );
	} );

	it( 'drops previews but keeps downloads when previews are off', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, {
			...DEFAULT_OPTIONS,
			showPreviews: false,
		} );

		expect( block.querySelector( '.gll-resource-preview' ) ).toBeNull();
		expect(
			block.querySelectorAll( '.gll-resource-download' )
		).toHaveLength( 2 );
	} );

	it( 'omits the download for an entry with no inlined bytes', () => {
		const block = makeBlock();
		renderResources(
			block,
			{
				Database: {
					IncludeFiles: [],
					DataFiles: [
						{ Filename: 'big.xed', Name: 'big.xed', Size: 900 },
					],
				},
			},
			DEFAULT_OPTIONS
		);

		expect( block.querySelector( '.gll-resource-download' ) ).toBeNull();
		expect( block.querySelector( '.gll-resource-size' )!.textContent ).toBe(
			'900 B'
		);
	} );

	it( 'drops an empty section entirely, unlike the editor', () => {
		// Only 3 of 29 reference files carry documentation, so a "none found"
		// placeholder would be the common case and would train readers to skip
		// the block.
		const block = makeBlock();
		renderResources(
			block,
			{
				Database: {
					IncludeFiles: [],
					DataFiles: dataWithBoth.Database.DataFiles,
				},
			},
			DEFAULT_OPTIONS
		);

		const titles = Array.from(
			block.querySelectorAll( '.gll-resources-section-title' )
		).map( ( el ) => el.textContent );
		expect( titles ).toEqual( [ 'Data Files' ] );
	} );

	it( 'says a file is empty rather than leaving a bare header', () => {
		const block = makeBlock();
		renderResources(
			block,
			{ Database: { IncludeFiles: [], DataFiles: [] } },
			DEFAULT_OPTIONS
		);

		expect(
			block.querySelector( '.gll-resources-empty' )!.textContent
		).toBe( 'This GLL file contains no embedded resources.' );
		expect( block.hidden ).toBe( false );
	} );

	it( 'hides the block only when asked and only when empty', () => {
		const empty = makeBlock();
		renderResources(
			empty,
			{ Database: { IncludeFiles: [], DataFiles: [] } },
			{ ...DEFAULT_OPTIONS, hideWhenEmpty: true }
		);
		expect( empty.hidden ).toBe( true );

		const populated = makeBlock();
		renderResources( populated, dataWithBoth, {
			...DEFAULT_OPTIONS,
			hideWhenEmpty: true,
		} );
		expect( populated.hidden ).toBe( false );
	} );

	it( 'counts what it rendered in the badge row', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, DEFAULT_OPTIONS );

		const badges = Array.from(
			block.querySelectorAll( '.gll-meta-badge' )
		).map( ( el ) => el.textContent );
		expect( badges ).toEqual( [ 'Documents: 1', 'Data Files: 1' ] );
	} );

	it( 'renders a file name as text, never as markup', () => {
		// Uploading a GLL is not the same as being trusted to author markup.
		const block = makeBlock();
		renderResources(
			block,
			{
				Database: {
					IncludeFiles: [],
					DataFiles: [
						{
							Filename: '<img src=x onerror=alert(1)>.png',
							Name: '<img src=x onerror=alert(1)>.png',
							Size: 10,
						},
					],
				},
			},
			DEFAULT_OPTIONS
		);

		const title = block.querySelector( '.gll-resource-title' )!;
		expect( title.querySelector( 'img' ) ).toBeNull();
		expect( title.textContent ).toBe( '<img src=x onerror=alert(1)>.png' );
	} );

	it( 'clears previous output when re-rendered', () => {
		const block = makeBlock();
		renderResources( block, dataWithBoth, DEFAULT_OPTIONS );
		renderResources( block, dataWithBoth, DEFAULT_OPTIONS );

		expect( block.querySelectorAll( '.gll-resource-item' ) ).toHaveLength(
			2
		);
	} );
} );
