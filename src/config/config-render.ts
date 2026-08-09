/**
 * Config Block - DOM rendering
 *
 * Builds the configuration cards as real DOM nodes, kept apart from view.ts so
 * it can be exercised under jsdom without pulling in the WASM loader. view.ts
 * fetches, parses and owns the collapse/persistence behaviour; everything that
 * turns parsed data into elements lives here.
 *
 * Every string this module places in the document — box labels, frame names,
 * filter descriptions, warning texts — comes straight out of an uploaded
 * binary. So the cards are built with createElement and textContent rather than
 * the HTML-string templating some of the older views use: assigning a property
 * means the escaping question never arises, instead of being answered correctly
 * at each of a few dozen call sites. There is no innerHTML in this module at
 * all — not even for the badge row, which resource-render.ts allows itself
 * because it interpolates counts and nothing else.
 *
 * The model hands over strings that are already formatted; nothing here
 * reformats, truncates or reinterprets them.
 *
 * @package
 */

import { __ } from '@wordpress/i18n';

import { collectConfig } from './config-model';
import type {
	CollectOptions,
	ConfigEntry,
	ConfigSection,
} from './config-model';

export interface RenderOptions extends CollectOptions {
	/** Render the cards closed; view.ts may still reopen them from storage. */
	initiallyCollapsed?: boolean;
	/** Hide the whole block when the file carries no configuration at all. */
	hideWhenEmpty?: boolean;
}

/**
 * Render the configuration sections into the block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Parsed GLL data.
 * @param {Object}      options Display options.
 */
export function renderConfig(
	block: HTMLElement,
	data: any,
	options: RenderOptions
): void {
	const container = block.querySelector< HTMLElement >(
		'.gll-config-content'
	);
	if ( ! container ) {
		return;
	}

	const { sections, isEmpty } = collectConfig( data, options );

	container.textContent = '';

	if ( isEmpty ) {
		// Hiding is applied here rather than by a CSS rule keyed on the data
		// attribute, because a CSS rule would also hide the error panel when
		// parsing fails — turning a loud failure into a silent one. Phase 9
		// shipped that bug once; it reads as a blank page.
		if ( options.hideWhenEmpty ) {
			block.hidden = true;
			return;
		}

		// Not nothing: save() already painted a header and a spinner, so an
		// emptied block would read as broken rather than as empty.
		const empty = document.createElement( 'div' );
		empty.className = 'gll-config-empty';
		empty.textContent = __(
			'This GLL file contains no configuration data.',
			'gll-info'
		);
		container.appendChild( empty );
		container.style.display = 'block';
		return;
	}

	// A re-render after an empty one has to undo the hide above, otherwise
	// swapping the selected file for a richer one leaves the block invisible.
	block.hidden = false;

	// No summary badge row here, unlike the resources block: every card's
	// <summary> already carries its own count, and those stay visible while the
	// card is collapsed, so a row repeating the same five numbers would be pure
	// duplication.
	sections.forEach( ( section ) => {
		// An empty section is dropped entirely on the front end. The editor
		// deliberately diverges and keeps it, so an author flipping a toggle
		// sees something change; a reader has no toggles and would only see a
		// row of "none found" placeholders.
		if ( section.isEmpty ) {
			return;
		}

		container.appendChild(
			buildSection( section, Boolean( options.initiallyCollapsed ) )
		);
	} );

	container.style.display = 'block';
}

/**
 * Build one collapsible section card.
 *
 * @param {Object}  section   Collected section.
 * @param {boolean} collapsed Whether the card starts closed.
 * @return {HTMLElement} Details element.
 */
function buildSection(
	section: ConfigSection,
	collapsed: boolean
): HTMLElement {
	const card = document.createElement( 'details' );
	card.className = 'gll-config-card';
	// view.ts finds the cards by this attribute to restore their open state.
	card.setAttribute( 'data-card', section.key );
	card.open = ! collapsed;

	const summary = document.createElement( 'summary' );
	summary.className = 'gll-config-summary';

	const title = document.createElement( 'span' );
	title.className = 'gll-config-summary-title';
	title.textContent = section.title;
	summary.appendChild( title );

	const count = document.createElement( 'span' );
	count.className = 'gll-config-count';
	count.textContent = String( section.count );
	summary.appendChild( count );

	card.appendChild( summary );

	const body = document.createElement( 'div' );
	body.className = 'gll-config-body';
	section.entries.forEach( ( entry ) => {
		body.appendChild( buildEntry( entry ) );
	} );
	card.appendChild( body );

	return card;
}

/**
 * Build one configuration entry, recursing once for nested children.
 *
 * @param {Object} entry Config entry.
 * @return {HTMLElement} Entry element.
 */
function buildEntry( entry: ConfigEntry ): HTMLElement {
	const el = document.createElement( 'div' );
	el.className = 'gll-config-entry';

	const title = document.createElement( 'div' );
	title.className = 'gll-config-entry-title';
	title.textContent = entry.title;
	el.appendChild( title );

	if ( entry.subtitle ) {
		const subtitle = document.createElement( 'div' );
		subtitle.className = 'gll-config-entry-subtitle';
		subtitle.textContent = entry.subtitle;
		el.appendChild( subtitle );
	}

	if ( entry.badges && entry.badges.length > 0 ) {
		const badges = document.createElement( 'div' );
		badges.className = 'gll-config-entry-badges';
		entry.badges.forEach( ( text ) => {
			const badge = document.createElement( 'span' );
			badge.className = 'gll-config-entry-badge';
			badge.textContent = text;
			badges.appendChild( badge );
		} );
		el.appendChild( badges );
	}

	( entry.details || [] ).forEach( ( line ) => {
		const detail = document.createElement( 'div' );
		detail.className = 'gll-config-entry-detail';
		detail.textContent = line;
		el.appendChild( detail );
	} );

	// One level only: filter definitions sit inside a filter group, and the
	// model does not nest deeper than that.
	if ( entry.children && entry.children.length > 0 ) {
		const children = document.createElement( 'div' );
		children.className = 'gll-config-children';
		entry.children.forEach( ( child ) => {
			children.appendChild( buildEntry( child ) );
		} );
		el.appendChild( children );
	}

	return el;
}
