/**
 * Inspector control for rebuilding an attachment's cached display subset.
 *
 * Shown only by the two blocks that actually render from the cache. For every
 * other block the cache is a side effect of having parsed the file, and offering
 * a button to rebuild something the block does not read would be a control whose
 * effect an author cannot see — which is the reason `showFaces` is on the list
 * of things this project regrets shipping.
 *
 * The wording avoids "cache", which invites the reading "this page is stale, and
 * pressing this will fix it". What it does is re-derive stored data from the file
 * that is already loaded.
 *
 * @package
 */

import { __ } from '@wordpress/i18n';
import { Button } from '@wordpress/components';
import { useState } from '@wordpress/element';

/**
 * A button that re-derives and re-stores the display subset.
 *
 * @param {Object}   props         Component props.
 * @param {Function} props.rebuild Rebuild callback from `useCachePublisher()`.
 * @param {boolean}  props.enabled Whether a parse is available to rebuild from.
 * @return {JSX.Element} Control markup.
 */
export default function CacheRebuildControl( { rebuild, enabled } ) {
	// 'idle' | 'working' | 'done' | 'failed'. A string rather than two booleans
	// because the states are exclusive and the combinations are not meaningful.
	const [ state, setState ] = useState( 'idle' );

	const onClick = async () => {
		setState( 'working' );
		setState( ( await rebuild() ) ? 'done' : 'failed' );
	};

	return (
		<div className="gll-cache-rebuild">
			<p className="gll-cache-rebuild__hint">
				{ __(
					'Visitors are served a small summary of this file instead of downloading and parsing it. It is stored when the file is uploaded or first placed in a block.',
					'gll-info'
				) }
			</p>
			<Button
				variant="secondary"
				onClick={ onClick }
				disabled={ ! enabled || 'working' === state }
				aria-disabled={ ! enabled || 'working' === state }
			>
				{ 'working' === state
					? __( 'Refreshing…', 'gll-info' )
					: __( 'Refresh stored summary', 'gll-info' ) }
			</Button>
			{ 'done' === state && (
				<p role="status" className="gll-cache-rebuild__status">
					{ __( 'Stored summary refreshed.', 'gll-info' ) }
				</p>
			) }
			{ 'failed' === state && (
				<p role="alert" className="gll-cache-rebuild__status">
					{ __(
						'The summary could not be stored. Visitors will parse the file in their browser instead, which still works.',
						'gll-info'
					) }
				</p>
			) }
		</div>
	);
}
