/**
 * Derive the resource rows from normalized GLL data.
 *
 * This lives next to the block rather than in `src/shared/` on purpose,
 * following the precedent set by `src/geometry/scene-builder.ts`: the only
 * consumers are this block's two entry points, and `src/shared/` is for things
 * more than one block reaches for.
 *
 * The module is deliberately pure — no DOM, no React, and of the WordPress
 * packages only `@wordpress/i18n`, since the user-visible strings it composes
 * (the size text, the accessible download label) are built here rather than in
 * the two renderers — so every derivation (classification, size text, download
 * names) is decided once and tested once, leaving `edit.tsx` and `view.ts` as
 * dumb templates over identical data. That is what keeps the editor preview and
 * the front end from drifting apart, since they cannot share markup.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

export type ResourceKind = 'pdf' | 'image' | 'archive' | 'file';

export interface NormalizedResourceEntry {
	Label?: string;
	Key?: string;
	Filename: string;
	Name: string;
	Size: number;
	DataUri?: string;
}

export interface ResourceViewItem {
	/** Stable key for React and for DOM ids. */
	id: string;
	/** Primary line: the label for documentation, the name otherwise. */
	title: string;
	/** Secondary line, present only when it adds something to the title. */
	subtitle?: string;
	/** Base name, used for the download attribute. */
	name: string;
	/** Human-readable size. */
	sizeText: string;
	kind: ResourceKind;
	isImage: boolean;
	/** Set only for images, and only when previews are enabled. */
	previewUri?: string;
	/** Absent when the parser did not inline the bytes. */
	downloadUri?: string;
	/** Accessible name — never a bare "Download". */
	downloadLabel: string;
}

export interface CollectOptions {
	showDocumentation?: boolean;
	showDataFiles?: boolean;
	showPreviews?: boolean;
}

export interface CollectedResources {
	documentation: ResourceViewItem[];
	dataFiles: ResourceViewItem[];
	isEmpty: boolean;
}

const IMAGE_EXTENSION = /\.(png|jpe?g|gif)$/i;
const IMAGE_DATA_URI = /^data:image\//i;
const PDF_EXTENSION = /\.pdf$/i;
const ARCHIVE_EXTENSION = /\.(zip|gz|tar|7z|rar)$/i;

/**
 * Byte-size unit symbols.
 *
 * Left untranslated on purpose, and therefore safe as a module-level constant:
 * these are bare unit symbols, not prose. Only the number/unit join below goes
 * through `__()`, and it does so at call time.
 */
const SIZE_UNITS = [ 'B', 'KB', 'MB', 'GB', 'TB' ];

/**
 * Format a byte count the way the reference viewer does.
 *
 * Kept deliberately identical to gll-tools' `formatBytes` (1024-based, whole
 * numbers for bytes and one decimal above) so the same file reads the same in
 * both UIs. Two things are fixed here: the reference treats 0, null, undefined
 * and NaN alike, and it would loop forever on a negative input.
 *
 * @param {number} bytes Byte count.
 * @return {string} Formatted size, or an em dash when there is no usable value.
 */
export function formatFileSize( bytes?: number ): string {
	if ( ! Number.isFinite( bytes as number ) || ( bytes as number ) < 0 ) {
		// Untranslated: a bare em dash is the "no value" marker, and it is the
		// same glyph in every locale.
		return '—';
	}

	let value = bytes as number;
	let unit = 0;

	while ( value >= 1024 && unit < SIZE_UNITS.length - 1 ) {
		value /= 1024;
		unit++;
	}

	return sprintf(
		/* translators: 1: formatted number of bytes, 2: unit symbol such as KB or MB. */
		__( '%1$s %2$s', 'gll-info' ),
		value.toFixed( unit === 0 ? 0 : 1 ),
		SIZE_UNITS[ unit ]
	);
}

/**
 * Decide whether an entry can be shown in an `<img>`.
 *
 * Both arms are load-bearing. The extension alone is not enough because the
 * WASM layer guesses MIME types from the extension and falls back to
 * `application/octet-stream`, which renders as a broken image. The MIME prefix
 * alone is not enough because that is only what the browser acts on, not what
 * the file claims to be. Requiring both also puts SVG out of reach, so there is
 * no scriptable-image question to answer.
 *
 * @param {string} name    Base file name.
 * @param {string} dataUri Inlined data URI, when present.
 * @return {boolean} True when the entry is a previewable raster image.
 */
export function isImageResource( name: string, dataUri?: string ): boolean {
	return (
		IMAGE_EXTENSION.test( name || '' ) &&
		IMAGE_DATA_URI.test( dataUri || '' )
	);
}

/**
 * Classify an entry for iconography and styling.
 *
 * @param {string} name    Base file name.
 * @param {string} dataUri Inlined data URI, when present.
 * @return {string} Resource kind.
 */
export function classifyResource(
	name: string,
	dataUri?: string
): ResourceKind {
	if ( isImageResource( name, dataUri ) ) {
		return 'image';
	}
	if ( PDF_EXTENSION.test( name || '' ) ) {
		return 'pdf';
	}
	if ( ARCHIVE_EXTENSION.test( name || '' ) ) {
		return 'archive';
	}
	return 'file';
}

/**
 * Reduce a name to something safe to hand a download attribute.
 *
 * The normalizer already folded the path away; this guards the residual cases
 * (a name that is nothing but separators or dots) because the value is also
 * shown to the reader and read out by screen readers.
 *
 * @param {string} name Base file name.
 * @return {string} Safe download name.
 */
function safeDownloadName( name: string ): string {
	const stripped = String( name || '' )
		.replace( /[\\/]/g, '' )
		.trim();

	if ( ! stripped || stripped === '.' || stripped === '..' ) {
		// Untranslated: this is a file name written to disk by the browser, not
		// prose, and it is also what `link.download` receives.
		return 'download';
	}

	return stripped;
}

/**
 * Build the view items for one list of embedded files.
 *
 * @param {Array}   entries          Normalized embedded file records.
 * @param {Object}  options          Build options.
 * @param {string}  options.list     List name, used to keep ids unique.
 * @param {boolean} options.previews Whether image previews are enabled.
 * @return {Object[]} View items in source order.
 */
export function buildResourceItems(
	entries: NormalizedResourceEntry[] | undefined,
	{ list, previews = true }: { list: string; previews?: boolean }
): ResourceViewItem[] {
	return ( entries || [] ).map( ( entry, index ) => {
		const name = entry.Name || entry.Filename || '';
		const isImage = isImageResource( name, entry.DataUri );
		const title = entry.Label || name;

		return {
			// Base names repeat across the corpus (several files ship a
			// `black.PNG`), so the index has to take part in the id.
			id: `${ list }-${ index }-${ name }`,
			title,
			// Only worth a second line when it is not just the title again.
			subtitle: title === name ? undefined : name,
			name: safeDownloadName( name ),
			sizeText: formatFileSize( entry.Size ),
			kind: classifyResource( name, entry.DataUri ),
			isImage,
			previewUri: isImage && previews ? entry.DataUri : undefined,
			downloadUri: entry.DataUri,
			downloadLabel: sprintf(
				/* translators: %s: name of the embedded file to download. */
				__( 'Download %s', 'gll-info' ),
				name
			),
		};
	} );
}

/**
 * Collect both resource lists out of normalized GLL data.
 *
 * @param {Object}  data                      Normalized GLL data.
 * @param {Object}  options                   Which sections to include.
 * @param {boolean} options.showDocumentation Include the include-file list.
 * @param {boolean} options.showDataFiles     Include the data-file list.
 * @param {boolean} options.showPreviews      Allow inline image previews.
 * @return {Object} Documentation and data-file items, plus an emptiness flag.
 */
export function collectResources(
	data: any,
	{
		showDocumentation = true,
		showDataFiles = true,
		showPreviews = true,
	}: CollectOptions = {}
): CollectedResources {
	const database = data?.Database || {};

	const documentation = showDocumentation
		? buildResourceItems( database.IncludeFiles, {
				list: 'doc',
				previews: showPreviews,
		  } )
		: [];

	const dataFiles = showDataFiles
		? buildResourceItems( database.DataFiles, {
				list: 'data',
				previews: showPreviews,
		  } )
		: [];

	return {
		documentation,
		dataFiles,
		isEmpty: documentation.length === 0 && dataFiles.length === 0,
	};
}
