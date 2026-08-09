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

beforeEach( () => {
	jest.clearAllMocks();
	( fetchCachedSubset as jest.Mock ).mockResolvedValue( null );
	( publishSubset as jest.Mock ).mockResolvedValue( true );
	( deleteCachedSubset as jest.Mock ).mockResolvedValue( true );
} );

describe( 'useCachePublisher', () => {
	it( 'publishes a subset when the cache is cold', async () => {
		renderHook( () => useCachePublisher( 42, parsed ) );

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

		renderHook( () => useCachePublisher( 42, parsed ) );

		await waitFor( () => expect( fetchCachedSubset ).toHaveBeenCalled() );
		expect( publishSubset ).not.toHaveBeenCalled();
	} );

	it( 'settles once, so re-rendering does not re-request', async () => {
		const { rerender } = renderHook( () =>
			useCachePublisher( 42, parsed )
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
		renderHook( () => useCachePublisher( 0, parsed ) );
		renderHook( () => useCachePublisher( 42, null ) );

		await Promise.resolve();

		expect( fetchCachedSubset ).not.toHaveBeenCalled();
		expect( publishSubset ).not.toHaveBeenCalled();
	} );

	it( 'publishes again when the author picks a different file', async () => {
		const { rerender } = renderHook(
			( { fileId } ) => useCachePublisher( fileId, parsed ),
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
				useCachePublisher( 42, parsed )
			);
			await waitFor( () => expect( publishSubset ).toHaveBeenCalled() );
			order.length = 0;

			expect( await result.current() ).toBe( true );
			expect( order ).toEqual( [ 'delete', 'publish' ] );
		} );

		it( 'reports a failed write', async () => {
			( publishSubset as jest.Mock ).mockResolvedValue( false );

			const { result } = renderHook( () =>
				useCachePublisher( 42, parsed )
			);

			expect( await result.current() ).toBe( false );
		} );

		it( 'is inert without a parse to rebuild from', async () => {
			const { result } = renderHook( () =>
				useCachePublisher( 42, null )
			);

			expect( await result.current() ).toBe( false );
			expect( deleteCachedSubset ).not.toHaveBeenCalled();
		} );
	} );
} );
