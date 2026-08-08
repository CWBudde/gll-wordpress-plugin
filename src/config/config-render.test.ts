/**
 * Tests for the frontend DOM rendering of the config block.
 *
 * This is the path readers actually hit, and it renders the same data as the
 * editor through entirely separate code, so it is covered directly rather than
 * inferred from the editor tests.
 *
 * The module deliberately imports nothing but config-model, so none of the WASM
 * machinery has to be mocked.
 */

import { renderConfig } from './config-render';

const DEFAULT_OPTIONS = {
	showBoxTypes: true,
	showFrames: true,
	showFilterGroups: true,
	showLimits: true,
	showWarnings: true,
	showGeometrySummary: true,
	showFilterDetails: true,
	showPinPoints: false,
	initiallyCollapsed: false,
	hideWhenEmpty: false,
};

/**
 * Build a block element shaped like save()'s output.
 *
 * @return {HTMLElement} Block element with a content container.
 */
function makeBlock(): HTMLElement {
	const block = document.createElement( 'div' );
	block.className = 'gll-config-block';
	const content = document.createElement( 'div' );
	content.className = 'gll-config-content';
	content.style.display = 'none';
	block.appendChild( content );
	return block;
}

/**
 * Normalized data carrying one of every section.
 */
const fullData = {
	Database: {
		BoxTypes: [
			{
				Key: 'G512-Pro',
				Label: 'G512 Pro Cabinet',
				Weight: 42.5,
				Sources: [ 'LF', 'HF' ],
			},
		],
		Frames: [
			{
				Key: 'FF-12',
				Label: 'Fly Frame',
				Weight: 18,
				IsFlown: true,
			},
		],
		FilterGroups: [
			{
				Key: 'presets',
				Label: 'Presets',
				Filters: [
					{ Key: 'hpf', Label: 'HPF 80 Hz' },
					{ Key: 'shelf', Label: 'Shelf 4 kHz' },
				],
			},
		],
		Limits: [ { TypeLabel: 'Maximum Weight', Type: 2, Value: 500 } ],
		Warnings: [
			{
				TypeLabel: 'Rigging',
				Type: 0,
				Value: 0,
				Text: 'Do not fly more than 12 cabinets.',
			},
		],
	},
};

describe( 'renderConfig', () => {
	it( 'renders the sections as cards in the fixed order', () => {
		const block = makeBlock();
		renderConfig( block, fullData, DEFAULT_OPTIONS );

		const keys = Array.from(
			block.querySelectorAll( 'details.gll-config-card' )
		).map( ( el ) => el.getAttribute( 'data-card' ) );

		expect( keys ).toEqual( [
			'box-types',
			'frames',
			'filter-groups',
			'limits',
			'warnings',
		] );
		expect( block.querySelector( '.gll-config-content' ) ).toHaveStyle(
			'display: block'
		);
	} );

	it( 'opens the cards unless asked to start collapsed', () => {
		const open = makeBlock();
		renderConfig( open, fullData, DEFAULT_OPTIONS );
		expect(
			Array.from(
				open.querySelectorAll< HTMLDetailsElement >(
					'details.gll-config-card'
				)
			).every( ( el ) => el.open )
		).toBe( true );

		const collapsed = makeBlock();
		renderConfig( collapsed, fullData, {
			...DEFAULT_OPTIONS,
			initiallyCollapsed: true,
		} );
		expect(
			Array.from(
				collapsed.querySelectorAll< HTMLDetailsElement >(
					'details.gll-config-card'
				)
			).some( ( el ) => el.open )
		).toBe( false );
	} );

	it( 'drops an empty section entirely, unlike the editor', () => {
		// The editor keeps an empty section so an author toggling a control
		// sees something change. A reader has no toggles, so a row of "none
		// found" placeholders would only teach them to skip the block.
		const block = makeBlock();
		renderConfig(
			block,
			{
				Database: {
					BoxTypes: fullData.Database.BoxTypes,
					Frames: [],
					FilterGroups: [],
					Limits: [],
					Warnings: [],
				},
			},
			DEFAULT_OPTIONS
		);

		const keys = Array.from(
			block.querySelectorAll( 'details.gll-config-card' )
		).map( ( el ) => el.getAttribute( 'data-card' ) );
		expect( keys ).toEqual( [ 'box-types' ] );
	} );

	it( 'says a file is empty rather than leaving a bare header', () => {
		const block = makeBlock();
		renderConfig( block, { Database: {} }, DEFAULT_OPTIONS );

		expect(
			block.querySelector( '.gll-config-empty' )!.textContent
		).toContain( 'no configuration' );
		expect( block.hidden ).toBe( false );
	} );

	it( 'hides the block only when asked and only when empty', () => {
		const empty = makeBlock();
		renderConfig(
			empty,
			{ Database: {} },
			{
				...DEFAULT_OPTIONS,
				hideWhenEmpty: true,
			}
		);
		expect( empty.hidden ).toBe( true );
		expect( empty.querySelector( '.gll-config-empty' ) ).toBeNull();

		const populated = makeBlock();
		renderConfig( populated, fullData, {
			...DEFAULT_OPTIONS,
			hideWhenEmpty: true,
		} );
		expect( populated.hidden ).toBe( false );
	} );

	it( 'unhides a block that a previous empty render had hidden', () => {
		// Swapping the selected file for a richer one must not leave the block
		// invisible.
		const block = makeBlock();
		renderConfig(
			block,
			{ Database: {} },
			{
				...DEFAULT_OPTIONS,
				hideWhenEmpty: true,
			}
		);
		expect( block.hidden ).toBe( true );

		renderConfig( block, fullData, {
			...DEFAULT_OPTIONS,
			hideWhenEmpty: true,
		} );
		expect( block.hidden ).toBe( false );
		expect(
			block.querySelectorAll( 'details.gll-config-card' ).length
		).toBeGreaterThan( 0 );
	} );

	it( 'counts the entries of each section in its badge', () => {
		const block = makeBlock();
		renderConfig( block, fullData, DEFAULT_OPTIONS );

		const counts = Array.from(
			block.querySelectorAll( '.gll-config-count' )
		).map( ( el ) => el.textContent );
		expect( counts ).toEqual( [ '1', '1', '1', '1', '1' ] );
	} );

	it( 'leaves the counting to the summaries, with no duplicate badge row', () => {
		const block = makeBlock();
		renderConfig( block, fullData, DEFAULT_OPTIONS );

		// The counts live in the <summary>, where they stay readable while the
		// card is collapsed. A separate row repeating them was removed rather
		// than styled, so nothing should reintroduce one.
		expect( block.querySelector( '.gll-config-metadata' ) ).toBeNull();
	} );

	it( 'nests filter definitions inside their group', () => {
		const block = makeBlock();
		renderConfig( block, fullData, DEFAULT_OPTIONS );

		const group = block.querySelector(
			'details.gll-config-card[data-card="filter-groups"]'
		)!;
		const children = group.querySelector( '.gll-config-children' );
		expect( children ).not.toBeNull();
		expect(
			children!.querySelectorAll( '.gll-config-entry' )
		).toHaveLength( 2 );
	} );

	it( 'renders file-derived strings as text, never as markup', () => {
		// Uploading a GLL is not the same as being trusted to author markup.
		const block = makeBlock();
		renderConfig(
			block,
			{
				Database: {
					BoxTypes: [
						{
							Name: '<img src=x onerror=alert(1)>',
							Label: '<img src=x onerror=alert(1)>',
						},
					],
					Warnings: [ { Text: '<script>alert(1)</script>' } ],
				},
			},
			DEFAULT_OPTIONS
		);

		expect( block.querySelector( 'img' ) ).toBeNull();
		expect( block.querySelector( 'script' ) ).toBeNull();
		expect( block.textContent ).toContain( '<img src=x onerror=alert(1)>' );
		expect( block.textContent ).toContain( '<script>alert(1)</script>' );
	} );

	it( 'clears previous output when re-rendered', () => {
		const block = makeBlock();
		renderConfig( block, fullData, DEFAULT_OPTIONS );
		const first = block.querySelectorAll( '.gll-config-entry' ).length;

		renderConfig( block, fullData, DEFAULT_OPTIONS );

		expect(
			block.querySelectorAll( 'details.gll-config-card' )
		).toHaveLength( 5 );
		expect( block.querySelectorAll( '.gll-config-entry' ) ).toHaveLength(
			first
		);
	} );

	it( 'does nothing when the block has no content container', () => {
		const bare = document.createElement( 'div' );
		bare.className = 'gll-config-block';

		expect( () =>
			renderConfig( bare, fullData, DEFAULT_OPTIONS )
		).not.toThrow();
		expect( bare.children ).toHaveLength( 0 );
	} );
} );
