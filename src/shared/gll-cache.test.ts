/**
 * Tests for the cached-subset REST client.
 *
 * The contract that matters here is the failure behaviour, not the happy path.
 * Every caller of this module has a fallback — parse the file in the browser —
 * and reaches it by getting null or false back. A client that threw, or that
 * returned a half-decoded body on a 404, would turn a cold cache into a broken
 * block.
 *
 * @package
 */

import {
	deleteCachedSubset,
	fetchCachedSubset,
	publishSubset,
} from './gll-cache';
import { SUBSET_VERSION } from './gll-subset';

/**
 * A minimal body the client should accept as a subset.
 *
 * @return {Object} Stored subset.
 */
function storedSubset() {
	return {
		Version: SUBSET_VERSION,
		GenSystem: { Label: 'Test' },
		Database: {
			Limits: [ { Type: 2, Value: 10 } ],
			Warnings: [],
			FilterGroups: [],
		},
	};
}

/**
 * Install a `fetch` stub.
 *
 * @param {Object} response What the stub resolves to.
 * @return {Function} The stub.
 */
function mockFetch( response ) {
	const stub = jest.fn().mockResolvedValue( response );
	( global as any ).fetch = stub;
	return stub;
}

describe( 'fetchCachedSubset', () => {
	beforeEach( () => {
		window.gllInfoSettings = {
			wasmUrl: '/w.wasm',
			wasmExecUrl: '/w.js',
			restUrl: 'https://example.test/wp-json/gll-info/v1/',
		};
	} );

	afterEach( () => {
		delete ( global as any ).fetch;
		delete window.gllInfoSettings;
	} );

	it( 'requests the attachment’s cache entry', async () => {
		const stub = mockFetch( {
			ok: true,
			json: async () => storedSubset(),
		} );

		await fetchCachedSubset( 42 );

		expect( stub ).toHaveBeenCalledWith(
			'https://example.test/wp-json/gll-info/v1/cache/42',
			expect.objectContaining( { credentials: 'same-origin' } )
		);
	} );

	it( 'returns the subset with its labels re-derived', async () => {
		mockFetch( { ok: true, json: async () => storedSubset() } );

		const subset = await fetchCachedSubset( 42 );

		// Stored without label text; usable only once hydrated.
		expect( subset.Database.Limits[ 0 ].TypeLabel ).toBe( 'Max Weight' );
	} );

	it( 'returns null on a cold cache, so the caller falls back to parsing', async () => {
		mockFetch( { ok: false, status: 404, json: async () => ( {} ) } );

		expect( await fetchCachedSubset( 42 ) ).toBeNull();
	} );

	it( 'returns null rather than throwing when the request fails', async () => {
		( global as any ).fetch = jest
			.fn()
			.mockRejectedValue( new Error( 'offline' ) );

		await expect( fetchCachedSubset( 42 ) ).resolves.toBeNull();
	} );

	it( 'returns null when the body is not JSON', async () => {
		mockFetch( {
			ok: true,
			json: async () => {
				throw new SyntaxError( 'Unexpected token <' );
			},
		} );

		expect( await fetchCachedSubset( 42 ) ).toBeNull();
	} );

	it( 'rejects a 200 that is not a subset', async () => {
		// A proxy or a security plugin can answer 200 with an HTML error page.
		// Rendering from that would blank the block instead of falling back.
		mockFetch( { ok: true, json: async () => ( { message: 'nope' } ) } );

		expect( await fetchCachedSubset( 42 ) ).toBeNull();
	} );

	it( 'makes no request at all without an attachment ID', async () => {
		const stub = mockFetch( { ok: true, json: async () => ( {} ) } );

		expect( await fetchCachedSubset( undefined ) ).toBeNull();
		expect( await fetchCachedSubset( 0 ) ).toBeNull();
		expect( stub ).not.toHaveBeenCalled();
	} );

	it( 'falls back to a default namespace when settings are missing', async () => {
		delete window.gllInfoSettings;
		const stub = mockFetch( {
			ok: true,
			json: async () => storedSubset(),
		} );

		await fetchCachedSubset( 7 );

		expect( stub ).toHaveBeenCalledWith(
			'/wp-json/gll-info/v1/cache/7',
			expect.anything()
		);
	} );

	it( 'tolerates a rest URL without a trailing slash', async () => {
		window.gllInfoSettings = {
			wasmUrl: '/w.wasm',
			wasmExecUrl: '/w.js',
			restUrl: 'https://example.test/wp-json/gll-info/v1',
		};
		const stub = mockFetch( {
			ok: true,
			json: async () => storedSubset(),
		} );

		await fetchCachedSubset( 7 );

		expect( stub ).toHaveBeenCalledWith(
			'https://example.test/wp-json/gll-info/v1/cache/7',
			expect.anything()
		);
	} );
} );

describe( 'publishSubset', () => {
	beforeEach( () => {
		window.gllInfoSettings = {
			wasmUrl: '/w.wasm',
			wasmExecUrl: '/w.js',
			restUrl: '/wp-json/gll-info/v1/',
			nonce: 'abc123',
		};
	} );

	afterEach( () => {
		delete ( global as any ).fetch;
		delete window.gllInfoSettings;
	} );

	it( 'posts the subset under a data key, with the nonce', async () => {
		const stub = mockFetch( { ok: true } );
		const subset = storedSubset();

		expect( await publishSubset( 42, subset ) ).toBe( true );

		const [ url, init ] = stub.mock.calls[ 0 ];
		expect( url ).toBe( '/wp-json/gll-info/v1/cache/42' );
		expect( init.method ).toBe( 'POST' );
		expect( init.headers[ 'X-WP-Nonce' ] ).toBe( 'abc123' );
		expect( JSON.parse( init.body ) ).toEqual( { data: subset } );
	} );

	it( 'reports failure rather than throwing', async () => {
		mockFetch( { ok: false, status: 403 } );

		expect( await publishSubset( 42, storedSubset() ) ).toBe( false );

		( global as any ).fetch = jest
			.fn()
			.mockRejectedValue( new Error( 'offline' ) );

		await expect( publishSubset( 42, storedSubset() ) ).resolves.toBe(
			false
		);
	} );

	it( 'makes no request without an ID or without a subset', async () => {
		const stub = mockFetch( { ok: true } );

		expect( await publishSubset( 0, storedSubset() ) ).toBe( false );
		expect( await publishSubset( 42, null ) ).toBe( false );
		expect( stub ).not.toHaveBeenCalled();
	} );

	it( 'omits the nonce header when there is no nonce', async () => {
		// The view scripts get no nonce, because only the read route is public.
		// A header of `undefined` would be sent as the string "undefined".
		delete window.gllInfoSettings.nonce;
		const stub = mockFetch( { ok: true } );

		await publishSubset( 42, storedSubset() );

		expect( stub.mock.calls[ 0 ][ 1 ].headers ).not.toHaveProperty(
			'X-WP-Nonce'
		);
	} );
} );

describe( 'deleteCachedSubset', () => {
	afterEach( () => {
		delete ( global as any ).fetch;
		delete window.gllInfoSettings;
	} );

	it( 'sends a DELETE and reports the outcome', async () => {
		const stub = mockFetch( { ok: true } );

		expect( await deleteCachedSubset( 42 ) ).toBe( true );
		expect( stub.mock.calls[ 0 ][ 1 ].method ).toBe( 'DELETE' );
	} );

	it( 'reports failure rather than throwing', async () => {
		( global as any ).fetch = jest
			.fn()
			.mockRejectedValue( new Error( 'offline' ) );

		await expect( deleteCachedSubset( 42 ) ).resolves.toBe( false );
	} );
} );
