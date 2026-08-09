/**
 * Publish the display subset of a parsed file from the block editor.
 *
 * The editor already parses the selected GLL to render its preview, so the
 * normalized data is sitting in a state hook with nothing more to pay for it.
 * Reducing that to the display subset and POSTing it is what warms the cache on
 * hosts that cannot parse server-side — which is every host where `proc_open` is
 * disabled, and most shared hosting.
 *
 * It reads before it writes. A GET that hits costs a few kilobytes and stops
 * there; only a cold, stale or version-mismatched cache is written, so opening a
 * post ten times does not write ten times. The server decides what "stale" means
 * by re-hashing the file, so this does not have to.
 *
 * Kept apart from `gll-cache.ts` because that module is imported by the frontend
 * view scripts, which must not pull `@wordpress/element` into their bundles for
 * the sake of one hook.
 *
 * @package
 */

import { useCallback, useEffect, useRef } from '@wordpress/element';

import {
	deleteCachedSubset,
	fetchCachedSubset,
	publishSubset,
} from './gll-cache';
import { buildDisplaySubset } from './gll-subset';

/**
 * Keep an attachment's cached subset up to date while the editor has a parse.
 *
 * Silent by design: a failed publish is not the author's problem and not
 * something they can act on. The cache stays cold, the frontend parses, and the
 * next editor load tries again.
 *
 * @param {number} fileId Attachment ID of the selected file, 0 when none.
 * @param {Object} data   Normalized parse, or null while loading.
 * @return {Function} `rebuild()`, which discards the stored subset and writes it
 *                    again from the parse in hand. Resolves to whether it stuck.
 */
export function useCachePublisher( fileId, data ) {
	// Which attachment this hook has already settled, so that a re-render with
	// the same data does not re-request. A ref rather than state: nothing
	// renders differently as a result.
	const settled = useRef( null );

	useEffect( () => {
		if ( ! fileId || ! data ) {
			return undefined;
		}

		const key = String( fileId );
		if ( settled.current === key ) {
			return undefined;
		}

		let cancelled = false;

		( async () => {
			const existing = await fetchCachedSubset( fileId );

			if ( cancelled ) {
				return;
			}

			if ( existing ) {
				settled.current = key;
				return;
			}

			const subset = buildDisplaySubset( data );
			if ( ! subset ) {
				return;
			}

			await publishSubset( fileId, subset );

			if ( ! cancelled ) {
				settled.current = key;
			}
		} )();

		return () => {
			cancelled = true;
		};
	}, [ fileId, data ] );

	return useCallback( async () => {
		if ( ! fileId || ! data ) {
			return false;
		}

		const subset = buildDisplaySubset( data );
		if ( ! subset ) {
			return false;
		}

		// Delete first, so that a rebuild is a real rebuild: the POST alone
		// would already overwrite, but an author who presses this is asking to
		// be sure nothing of the old entry survived.
		await deleteCachedSubset( fileId );

		const stored = await publishSubset( fileId, subset );

		// Whatever happened, this attachment is no longer settled from the
		// effect's point of view unless the write actually landed.
		settled.current = stored ? String( fileId ) : null;

		return stored;
	}, [ fileId, data ] );
}

export default useCachePublisher;
