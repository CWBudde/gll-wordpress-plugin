/**
 * The file-loading wiring every block edit component used to carry its own copy
 * of.
 *
 * Seven copies of a `useGLLLoader()` call, a `loadAttempted` flag, an effect that
 * fires the load, and select/remove handlers that rewrite three attributes. They
 * had already drifted in four separate ways by the time this was written, which
 * is the argument for the file rather than any line in it.
 *
 * Two of those drifts are settled here rather than preserved:
 *
 * - **Selecting a file clears the previous parse, in every block.** Only the file
 *   viewer used to. The comment in `use-cache-publisher.ts` describes what the
 *   other six risked: new attributes, old data, and a summary stored under the
 *   wrong file's identity, permanently. That guard stays, but it is now
 *   belt-and-braces rather than the only thing standing between a visitor and
 *   metadata for a different loudspeaker.
 * - **The load guard is `fileUrl && ! loadAttempted`.** The file viewer also
 *   tested `! data && ! isLoading`, which is dead weight once the clear above is
 *   unconditional — and which put `data` in the effect's dependency array, so the
 *   effect re-ran on every parse completion for nothing.
 *
 * @package
 */

import { useCallback, useEffect, useState } from '@wordpress/element';

import { useGLLLoader } from './gll-context';
import type { GllFileSource } from './file-source';

interface UseFileSourceOptions {
	attributes: GllFileSource;
	setAttributes: ( next: Partial< GllFileSource > ) => void;
	allowProxy?: boolean;
}

/**
 * Load whichever file a block is pointed at, and let it be re-pointed.
 *
 * @param {Object}   options               Options.
 * @param {Object}   options.attributes    The block's `fileId`/`fileUrl`/`fileName`.
 * @param {Function} options.setAttributes Block attribute setter.
 * @param {boolean}  options.allowProxy    Whether a blocked cross-origin fetch may
 *                                         be retried through this site. True in the
 *                                         editor, and meaningless anywhere else.
 * @return {Object} Loader state plus `setSource`, `clearSource` and `reload`.
 */
export function useFileSource( {
	attributes,
	setAttributes,
	allowProxy = true,
}: UseFileSourceOptions ) {
	const { fileId, fileUrl, fileName } = attributes;
	const { data, parsedFrom, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );

	useEffect( () => {
		if ( fileUrl && ! loadAttempted ) {
			setLoadAttempted( true );
			load( fileUrl, true, { proxy: allowProxy ? 'fallback' : 'never' } );
		}
	}, [ fileUrl, load, loadAttempted, allowProxy ] );

	const setSource = useCallback(
		( next: GllFileSource ) => {
			setAttributes( next );
			clear();
			setLoadAttempted( false );
		},
		[ setAttributes, clear ]
	);

	const clearSource = useCallback( () => {
		setSource( { fileId: 0, fileUrl: '', fileName: '' } );
	}, [ setSource ] );

	// Re-arms the effect rather than fetching directly, so there is one code path
	// that knows how to load a file and not two that can disagree.
	const reload = useCallback( () => {
		clear();
		setLoadAttempted( false );
	}, [ clear ] );

	return {
		data,
		parsedFrom,
		isLoading,
		error,
		source: { fileId, fileUrl, fileName },
		setSource,
		clearSource,
		reload,
	};
}

export default useFileSource;
