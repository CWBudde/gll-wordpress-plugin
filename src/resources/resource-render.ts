/**
 * Resources Block - DOM rendering
 *
 * Builds the resource list as real DOM nodes, kept apart from view.ts so it can
 * be exercised under jsdom without pulling in the WASM loader. view.ts fetches
 * and parses; everything that turns parsed data into elements lives here.
 *
 * The rows are built with createElement rather than the HTML-string templating
 * the other views use. That is deliberate: every download carries a base64
 * `data:` URI, up to ~2.9 MB for the largest embedded datasheet in the
 * reference corpus, and concatenating attacker-influenced values of that size
 * into markup is a shape worth avoiding entirely rather than escaping
 * carefully. Assigning them as properties means the escaping question never
 * arises — the one exception is the badge row, which interpolates counts and
 * nothing file-derived.
 *
 * @package
 */

import { collectResources } from './resource-model';
import type { ResourceViewItem } from './resource-model';

const ICON_PATHS: Record< string, string > = {
	pdf: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
	image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
	archive:
		'<path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/>',
	file: '<path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M13 2v7h7"/>',
};

/**
 * Render both resource sections into the block.
 *
 * @param {HTMLElement} block   Block element.
 * @param {Object}      data    Parsed GLL data.
 * @param {Object}      options Display options.
 */
export function renderResources( block, data, options ) {
	const container = block.querySelector( '.gll-resources-content' );
	if ( ! container ) {
		return;
	}

	const { documentation, dataFiles, isEmpty } = collectResources( data, {
		showDocumentation: options.showDocumentation,
		showDataFiles: options.showDataFiles,
		showPreviews: options.showPreviews,
	} );

	container.textContent = '';

	if ( isEmpty ) {
		// Hiding is applied here rather than by a CSS rule keyed on the data
		// attribute, because a CSS rule would also hide the error panel when
		// parsing fails — turning a loud failure into a silent one.
		if ( options.hideWhenEmpty ) {
			block.hidden = true;
			return;
		}

		// Not nothing: save() already painted a header and a spinner, so an
		// emptied block would read as broken rather than as empty.
		const empty = document.createElement( 'div' );
		empty.className = 'gll-resources-empty';
		empty.textContent = 'This GLL file contains no embedded resources.';
		container.appendChild( empty );
		container.style.display = 'block';
		return;
	}

	container.appendChild( buildMetadataElement( documentation, dataFiles ) );

	// An empty section is dropped entirely rather than rendered with a "none
	// found" line. Only 3 of the 29 reference files carry documentation, so
	// the placeholder would be the common case and would teach readers to skip
	// the whole block.
	if ( documentation.length > 0 ) {
		container.appendChild(
			buildSection(
				'Documentation',
				'Technical drawings, spec sheets, and manuals embedded in the GLL file.',
				documentation,
				options.previewMaxHeight
			)
		);
	}

	if ( dataFiles.length > 0 ) {
		container.appendChild(
			buildSection(
				'Data Files',
				'Embedded images, geometry, and configuration files.',
				dataFiles,
				options.previewMaxHeight
			)
		);
	}

	container.style.display = 'block';
}

/**
 * Build the metadata badge row.
 *
 * @param {Array} documentation Documentation items.
 * @param {Array} dataFiles     Data file items.
 * @return {HTMLElement} Badge row element.
 */
function buildMetadataElement(
	documentation: ResourceViewItem[],
	dataFiles: ResourceViewItem[]
): HTMLElement {
	const badges: string[] = [];

	if ( documentation.length > 0 ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>Documents:</strong> ${ documentation.length }</span>`
		);
	}

	if ( dataFiles.length > 0 ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>Data Files:</strong> ${ dataFiles.length }</span>`
		);
	}

	const row = document.createElement( 'div' );
	row.className = 'gll-resources-metadata';
	// Counts only — no file-derived strings reach this markup.
	row.innerHTML = badges.join( '' );
	return row;
}

/**
 * Build one titled section of resource rows.
 *
 * @param {string} title            Section heading.
 * @param {string} hint             Short explanation under the heading.
 * @param {Array}  items            Resource view items.
 * @param {number} previewMaxHeight Maximum preview height in pixels.
 * @return {HTMLElement} Section element.
 */
function buildSection(
	title: string,
	hint: string,
	items: ResourceViewItem[],
	previewMaxHeight: number
): HTMLElement {
	const section = document.createElement( 'div' );
	section.className = 'gll-resources-section';

	const heading = document.createElement( 'h4' );
	heading.className = 'gll-resources-section-title';
	heading.textContent = title;
	section.appendChild( heading );

	const hintEl = document.createElement( 'p' );
	hintEl.className = 'gll-resources-section-hint';
	hintEl.textContent = hint;
	section.appendChild( hintEl );

	const list = document.createElement( 'ul' );
	list.className = 'gll-resource-list';
	items.forEach( ( item ) => {
		list.appendChild( buildRow( item, previewMaxHeight ) );
	} );
	section.appendChild( list );

	return section;
}

/**
 * Build one resource row.
 *
 * @param {Object} item             Resource view item.
 * @param {number} previewMaxHeight Maximum preview height in pixels.
 * @return {HTMLElement} List item element.
 */
function buildRow(
	item: ResourceViewItem,
	previewMaxHeight: number
): HTMLElement {
	const row = document.createElement( 'li' );
	row.className = `gll-resource-item gll-resource-item--${ item.kind }`;

	const meta = document.createElement( 'div' );
	meta.className = 'gll-resource-meta';

	const icon = document.createElementNS(
		'http://www.w3.org/2000/svg',
		'svg'
	);
	icon.setAttribute( 'viewBox', '0 0 24 24' );
	icon.setAttribute( 'fill', 'none' );
	icon.setAttribute( 'stroke', 'currentColor' );
	icon.setAttribute( 'stroke-width', '2' );
	icon.setAttribute( 'aria-hidden', 'true' );
	// Static markup from a fixed table, not from the file.
	icon.innerHTML = ICON_PATHS[ item.kind ] || ICON_PATHS.file;
	meta.appendChild( icon );

	const details = document.createElement( 'div' );
	details.className = 'gll-resource-details';

	const title = document.createElement( 'span' );
	title.className = 'gll-resource-title';
	title.textContent = item.title;
	details.appendChild( title );

	if ( item.subtitle ) {
		const subtitle = document.createElement( 'span' );
		subtitle.className = 'gll-resource-subtitle';
		subtitle.textContent = item.subtitle;
		details.appendChild( subtitle );
	}

	meta.appendChild( details );
	row.appendChild( meta );

	if ( item.previewUri ) {
		const preview = document.createElement( 'div' );
		preview.className = 'gll-resource-preview';
		preview.style.setProperty(
			'--gll-resource-preview-max',
			`${ previewMaxHeight }px`
		);

		const img = document.createElement( 'img' );
		img.src = item.previewUri;
		img.alt = item.name;
		// setAttribute rather than the IDL properties: assigning `loading` or
		// `decoding` is silently dropped wherever the property is not
		// implemented, whereas the attribute is always honoured by engines that
		// support the hint.
		img.setAttribute( 'loading', 'lazy' );
		img.setAttribute( 'decoding', 'async' );
		preview.appendChild( img );
		row.appendChild( preview );
	}

	const actions = document.createElement( 'div' );
	actions.className = 'gll-resource-actions';

	const size = document.createElement( 'span' );
	size.className = 'gll-resource-size';
	size.textContent = item.sizeText;
	actions.appendChild( size );

	// No download for an entry the parser declined to inline: a dead button is
	// worse than none.
	if ( item.downloadUri ) {
		const link = document.createElement( 'a' );
		link.className = 'gll-resource-download';
		link.href = item.downloadUri;
		// `download` plus a data: URI is the whole mechanism — no click
		// handler. Intercepting the click would mean navigating to the data:
		// URI, which browsers block at top level, or building a Blob.
		link.download = item.name;
		// Several rows reading only "Download" is useless to a screen reader.
		link.setAttribute( 'aria-label', item.downloadLabel );
		link.textContent = 'Download';
		actions.appendChild( link );
	}

	row.appendChild( actions );
	return row;
}
