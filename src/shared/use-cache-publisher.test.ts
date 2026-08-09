/**
 * Tests for the editor-side cache publisher.
 *
 * The behaviour worth pinning is what it does NOT do: it must not write when the
 * cache is already warm, and it must not write again on every re-render. Opening
 * a post is a common action and this hook runs on all seven blocks, so a hook
 * that POSTed each time would turn "warm the cache" into a write amplifier.
 *
 * @package
 */

import { renderHook, waitFor } from '@testing-library/react';

import { useCachePublisher } from './use-cache-publisher';
import {
	deleteCachedSubset,
	fetchCachedSubset,
	publishSubset,
} from './gll-cache';

jest.mock( './gll-cache', () => ( {
	fetchCachedSubset: jest.fn(),
	publishSubset: jest.fn(),
	deleteCachedSubset: jest.fn(),
} ) );

const parsed = {
	GenSystem: { Label: 'Test' },
	Database: { SourceDefinitions: [], BoxTypes: [] },
};

/**
 * The URL a given attachment is selected as.
 *
 * @param {number} fileId Attachment ID.
 * @return {string} File URL.
 */
function urlFor( fileId ) {
	return `https://example.test/uploads/${ fileId }.gll`;
}

/**
 * Hook arguments for a block whose parse matches its selected file.
 *
 * @param {number} fileId Attachment ID.
 * @return {Object} Hook options.
 */
function published( fileId ) {
	return {
		fileId,
		fileUrl: urlFor( fileId ),
		data: parsed,
		parsedFrom: { url: urlFor( fileId ), hash: `hash-${ fileId }` },
	};
}

beforeEach( () => {
	jest.clearAllMocks();
	( fetchCachedSubset as jest.Mock ).mockResolvedValue( null );
	( publishSubset as jest.Mock ).mockResolvedValue( true );
	( deleteCachedSubset as jest.Mock ).mockResolvedValue( true );
} );

describe( 'useCachePublisher', () => {
	it( 'publishes a subset when the cache is cold', async () => {
		renderHook( () => useCachePublisher( published( 42 ) ) );

		await waitFor( () => expect( publishSubset ).toHaveBeenCalled() );

		const [ fileId, subset ] = ( publishSubset as jest.Mock ).mock
			.calls[ 0 ];
		expect( fileId ).toBe( 42 );
		expect( subset.Database.SourceDefinitions ).toEqual( [] );
	} );

	it( 'does not write when the cache is already warm', async () => {
		( fetchCachedSubset as jest.Mock ).mockResolvedValue( {
			Version: 1,
			Database: {},
		} );

		renderHook( () => useCachePublisher( published( 42 ) ) );

		await waitFor( () => expect( fetchCachedSubset ).toHaveBeenCalled() );
		expect( publishSubset ).not.toHaveBeenCalled();
	} );

	it( 'settles once, so re-rendering does not re-request', async () => {
		const { rerender } = renderHook( () =>
			useCachePublisher( published( 42 ) )
		);

		await waitFor( () =>
			expect( publishSubset ).toHaveBeenCalledTimes( 1 )
		);

		rerender();
		rerender();

		expect( fetchCachedSubset ).toHaveBeenCalledTimes( 1 );
		expect( publishSubset ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'does nothing without a file or without a parse', async () => {
		renderHook( () =>
			useCachePublisher( { ...published( 42 ), fileId: 0 } )
		);
		renderHook( () =>
			useCachePublisher( { ...published( 42 ), data: null } )
		);

		await Promise.resolve();

		expect( fetchCachedSubset ).not.toHaveBeenCalled();
		expect( publishSubset ).not.toHaveBeenCalled();
	} );

	it( 'does not publish one file’s parse under another file’s ID', async () => {
		// THE REGRESSION THIS EXISTS FOR. Selecting a new file updates `fileId`
		// and `fileUrl` at once, but six of the seven blocks leave the previous
		// parse in place while the new one loads. Publishing then would store
		// file A's summary against attachment B, mark B settled, and leave
		// visitors reading the wrong file's metadata for good.
		const { rerender } = renderHook(
			( props: any ) => useCachePublisher( props ),
			{
				initialProps: {
					fileId: 43,
					fileUrl: urlFor( 43 ),
					data: parsed,
					// Still the parse of the previously selected file.
					parsedFrom: { url: urlFor( 42 ), hash: 'hash-42' },
				},
			}
		);

		await Promise.resolve();

		expect( fetchCachedSubset ).not.toHaveBeenCalled();
		expect( publishSubset ).not.toHaveBeenCalled();

		// Once the new file's parse lands, it publishes normally.
		rerender( published( 43 ) as any );

		await waitFor( () =>
			expect( publishSubset ).toHaveBeenCalledTimes( 1 )
		);
		expect( ( publishSubset as jest.Mock ).mock.calls[ 0 ][ 0 ] ).toBe(
			43
		);
	} );

	it( 'sends the digest of the bytes it parsed', async () => {
		renderHook( () => useCachePublisher( published( 42 ) ) );

		await waitFor( () => expect( publishSubset ).toHaveBeenCalled() );

		expect( ( publishSubset as jest.Mock ).mock.calls[ 0 ][ 2 ] ).toBe(
			'hash-42'
		);
	} );

	it( 'publishes without a digest when the browser could not compute one', async () => {
		// `crypto.subtle` is unavailable outside a secure context, so a
		// plain-HTTP site has no digest to send. Caching still has to work.
		renderHook( () =>
			useCachePublisher( {
				...published( 42 ),
				parsedFrom: { url: urlFor( 42 ), hash: null },
			} )
		);

		await waitFor( () => expect( publishSubset ).toHaveBeenCalled() );

		expect(
			( publishSubset as jest.Mock ).mock.calls[ 0 ][ 2 ]
		).toBeFalsy();
	} );

	it( 'publishes again when the author picks a different file', async () => {
		const { rerender } = renderHook(
			( { fileId } ) => useCachePublisher( published( fileId ) ),
			{ initialProps: { fileId: 42 } }
		);

		await waitFor( () =>
			expect( publishSubset ).toHaveBeenCalledTimes( 1 )
		);

		rerender( { fileId: 43 } );

		await waitFor( () =>
			expect( publishSubset ).toHaveBeenCalledTimes( 2 )
		);
		expect( ( publishSubset as jest.Mock ).mock.calls[ 1 ][ 0 ] ).toBe(
			43
		);
	} );

	describe( 'rebuild()', () => {
		it( 'deletes before writing, so nothing of the old entry survives', async () => {
			const order: string[] = [];
			( deleteCachedSubset as jest.Mock ).mockImplementation(
				async () => {
					order.push( 'delete' );
					return true;
				}
			);
			( publishSubset as jest.Mock ).mockImplementation( async () => {
				order.push( 'publish' );
				return true;
			} );

			const { result } = renderHook( () =>
				useCachePublisher( published( 42 ) )
			);
			await waitFor( () => expect( publishSubset ).toHaveBeenCalled() );
			order.length = 0;

			expect( await result.current() ).toBe( true );
			expect( order ).toEqual( [ 'delete', 'publish' ] );
		} );

		it( 'reports a failed write', async () => {
			( publishSubset as jest.Mock ).mockResolvedValue( false );

			const { result } = renderHook( () =>
				useCachePublisher( published( 42 ) )
			);

			expect( await result.current() ).toBe( false );
		} );

		it( 'is inert without a parse to rebuild from', async () => {
			const { result } = renderHook( () =>
				useCachePublisher( { ...published( 42 ), data: null } )
			);

			expect( await result.current() ).toBe( false );
			expect( deleteCachedSubset ).not.toHaveBeenCalled();
		} );
	} );
} );
