/**
 * End-to-end sweep: parse every GLL of the reference corpus with the real WASM
 * parser and render each one through the same code the front end runs.
 *
 * The unit tests drive `renderConfig` with hand-built fixtures and the model
 * tests cover the derivations in isolation. Neither can catch the failure this
 * file is for: a normalized field that quietly stops arriving, or an enum table
 * wired to the wrong section. Those only show up against real binaries, and only
 * in aggregate — which is why the section coverage is asserted as corpus-wide
 * totals rather than as expectations pinned to individual files.
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
	describeFullCorpus,
	listCorpusFiles,
	parseCorpusFile,
	teardownWasm,
} from '../../tests/helpers/wasm-harness';
import { renderConfig } from './config-render';
import type { RenderOptions } from './config-render';

/** Everything on, so no section can hide behind a toggle. */
const OPTIONS: RenderOptions = {
	showBoxTypes: true,
	showFrames: true,
	showFilterGroups: true,
	showLimits: true,
	showWarnings: true,
	showGeometrySummary: true,
	showFilterDetails: true,
	showPinPoints: true,
	initiallyCollapsed: false,
	hideWhenEmpty: false,
};

/**
 * How many files render each card. The front end DROPS an empty section, so a
 * file with no frames contributes no frames card at all and these are counts of
 * files, not of entries.
 *
 * `filter-groups` is 10, not the 8 this test was specified with. Checked against
 * the raw parser output rather than against the renderer: ten corpus files carry
 * a non-empty `database.filter_groups` — 3Way-LR, APS-V1_1, CoRay4-Twin-V1_5,
 * CoRay4-V1_5, HOPS7-Pro V1_0, N-APS v1_0, N-RAY-V0_3 Beta, SCP-F-Sub Array
 * V1_0, SCP-F-V1_0 and TiRAY-V1_3. The other four totals matched as specified.
 */
const EXPECTED_CARD_FILES: Record< string, number > = {
	'box-types': 26,
	'filter-groups': 10,
	frames: 5,
	limits: 5,
	warnings: 2,
};

/** Headroom over the observed worst case; the 8193-float arrays blow past it. */
const FILTER_GROUP_JSON_LIMIT = 2 * 1024 * 1024;

/** A stray FIR payload would come back under one of these names. */
const FIR_PAYLOAD_KEYS = [ 'data_irm', 'data_dip', 'DataIrm', 'DataDip' ];

interface FileReport {
	file: string;
	cards: string[];
	filterGroupCount: number;
}

const reports: FileReport[] = [];

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
	block.appendChild( content );
	return block;
}

/**
 * Parse a corpus file and normalize it.
 *
 * @param {string} file File name within the corpus directory.
 * @return {Promise<Object>} Normalized GLL data.
 */
async function loadCorpusFile( file: string ): Promise< any > {
	const result = await parseCorpusFile( file );
	expect( result.success ).toBe( true );
	return normalizeGllData( result.data );
}

/**
 * Render normalized data into a fresh block.
 *
 * @param {Object} data Normalized GLL data.
 * @return {HTMLElement} The rendered block.
 */
function render( data: any ): HTMLElement {
	const block = makeBlock();
	renderConfig( block, data, OPTIONS );
	return block;
}

const corpusFiles = listCorpusFiles();

describeCorpus( 'rendering the whole GLL corpus as configuration', () => {
	afterAll( () => teardownWasm() );

	it( 'has files to sweep', () => {
		expect( corpusFiles.length ).toBeGreaterThan( 0 );
	} );

	// One case per file, so a failure names the file and each parse gets its own
	// timeout rather than sharing one budget across the whole sweep. Each case
	// keeps only a small report, which the later assertions read.
	it.each( corpusFiles )(
		'%s renders without throwing and without junk in the output',
		async ( file ) => {
			const data = await loadCorpusFile( file );
			const block = render( data );

			const cards = Array.from(
				block.querySelectorAll< HTMLElement >( '.gll-config-card' )
			);

			// Either cards or an explicit empty notice — never a blank block.
			if ( cards.length === 0 ) {
				expect(
					`${ file }: ${ Boolean(
						block.querySelector( '.gll-config-empty' )
					) }`
				).toBe( `${ file }: true` );
			}

			const text = block.textContent || '';
			[ 'NaN', 'undefined', '[object Object]' ].forEach( ( junk ) => {
				expect( `${ file }: ${ text.includes( junk ) }` ).toBe(
					`${ file }: false`
				);
			} );

			// A detail line reduced to the "no value" marker means a formatter
			// dropped its unit and its label along with its number.
			Array.from(
				block.querySelectorAll( '.gll-config-entry-detail' )
			).forEach( ( detail ) => {
				expect(
					`${ file }: ${ ( detail.textContent || '' ).trim() }`
				).not.toBe( `${ file }: -` );
			} );

			// Labels come out of an uploaded binary; nothing they contain may
			// become an element.
			[ 'img', 'script', 'iframe' ].forEach( ( tag ) => {
				expect(
					`${ file }: ${ Boolean( block.querySelector( tag ) ) }`
				).toBe( `${ file }: false` );
			} );

			// Enum tables wired to the wrong section show up as the raw
			// fallback label the normalizer emits for an unknown code.
			Array.from(
				block.querySelectorAll(
					'[data-card="limits"] .gll-config-entry-title, [data-card="warnings"] .gll-config-entry-title'
				)
			).forEach( ( title ) => {
				expect( `${ file }: ${ title.textContent || '' }` ).not.toMatch(
					/: (Limit|Warning) Type \d+$/
				);
			} );

			// Each summary badge must agree with its own body, counting the
			// entries the card owns and not the nested filter definitions.
			cards.forEach( ( card ) => {
				const key = card.getAttribute( 'data-card' ) || '';
				const badge = card.querySelector( '.gll-config-count' );
				const body = card.querySelector( '.gll-config-body' );
				const own = Array.from( body?.children || [] ).filter(
					( child ) => child.classList.contains( 'gll-config-entry' )
				);

				expect( `${ file }/${ key }: ${ badge?.textContent }` ).toBe(
					`${ file }/${ key }: ${ own.length }`
				);
			} );

			// PAYLOAD GUARD: the FIR coefficient arrays must never survive
			// normalization.
			const groups = data?.Database?.FilterGroups || [];
			groups.forEach( ( group: any ) => {
				( group?.Filters || [] ).forEach( ( definition: any ) => {
					( definition?.Bank?.Filters || [] ).forEach(
						( filter: any ) => {
							if ( ! filter?.FIR ) {
								return;
							}

							expect( typeof filter.FIR.CoefficientCount ).toBe(
								'number'
							);
							FIR_PAYLOAD_KEYS.forEach( ( key ) => {
								expect(
									`${ file }: ${ key in filter.FIR }`
								).toBe( `${ file }: false` );
							} );
						}
					);
				} );
			} );

			expect( JSON.stringify( groups ).length ).toBeLessThan(
				FILTER_GROUP_JSON_LIMIT
			);

			reports.push( {
				file,
				cards: cards.map(
					( card ) => card.getAttribute( 'data-card' ) || ''
				),
				filterGroupCount: groups.length,
			} );
		},
		60000
	);

	it( 'renders filter definitions for the most filter-heavy file', async () => {
		const heaviest = reports.reduce( ( best, report ) =>
			report.filterGroupCount > best.filterGroupCount ? report : best
		);
		expect( heaviest.filterGroupCount ).toBeGreaterThan( 0 );

		const block = render( await loadCorpusFile( heaviest.file ) );
		const card = block.querySelector( '[data-card="filter-groups"]' );
		expect( card ).not.toBeNull();

		const children = Array.from(
			card!.querySelectorAll( '.gll-config-children .gll-config-entry' )
		);
		expect( children.length ).toBeGreaterThan( 0 );

		const detailed = children.filter( ( child ) =>
			Array.from(
				child.querySelectorAll( '.gll-config-entry-detail' )
			).some( ( detail ) => ( detail.textContent || '' ).trim() !== '' )
		);
		expect( detailed.length ).toBeGreaterThan( 0 );
	}, 60000 );
} );

/**
 * Section coverage as corpus-wide totals.
 *
 * This is the assertion the file's docblock describes: a normalized field that
 * quietly stops arriving shows up here as a card count dropping, and only in
 * aggregate. It is therefore meaningless against the size-bounded default sweep
 * and runs only under `GLL_CORPUS_FULL=1`.
 */
describeFullCorpus( 'section coverage across the complete corpus', () => {
	afterAll( () => teardownWasm() );

	it( 'covers the expected number of files per section', async () => {
		const counts: Record< string, number > = {
			'box-types': 0,
			frames: 0,
			'filter-groups': 0,
			limits: 0,
			warnings: 0,
		};

		for ( const file of listCorpusFiles() ) {
			const block = render( await loadCorpusFile( file ) );
			Array.from(
				block.querySelectorAll< HTMLElement >( '.gll-config-card' )
			).forEach( ( card ) => {
				const key = card.getAttribute( 'data-card' ) || '';
				counts[ key ] = ( counts[ key ] || 0 ) + 1;
			} );
		}

		expect( counts ).toEqual( EXPECTED_CARD_FILES );
	}, 600000 );
} );
