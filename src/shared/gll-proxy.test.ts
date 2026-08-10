/**
 * The editor's client for the download proxy.
 *
 * Unlike `gll-cache.ts`, this module throws, and the tests below pin that: the
 * editor has to distinguish "nobody can reach this file" from "only your browser
 * cannot", because those lead the author to different actions, and a swallowed
 * error erases the difference.
 *
 * @package
 */

import { canUseProxy, fetchRemoteFile, HttpError } from './gll-proxy';

const ADDRESS = 'https://cdn.example/speaker.gll';

let fetchMock;

beforeEach( () => {
	fetchMock = jest.fn();
	global.fetch = fetchMock as never;
	window.gllInfoSettings = {
		wasmUrl: '/wasm',
		wasmExecUrl: '/exec',
		restUrl: 'https://example.org/wp-json/gll-info/v1/',
		nonce: 'abc123',
	};
} );

afterEach( () => {
	delete window.gllInfoSettings;
} );

describe( 'fetchRemoteFile', () => {
	it( 'asks the plugin route, with the address escaped and the nonce attached', async () => {
		fetchMock.mockResolvedValue( {
			ok: true,
			arrayBuffer: async () => new ArrayBuffer( 4 ),
		} );

		const bytes = await fetchRemoteFile( ADDRESS );

		expect( bytes.byteLength ).toBe( 4 );

		const [ url, options ] = fetchMock.mock.calls[ 0 ];
		expect( url ).toBe(
			'https://example.org/wp-json/gll-info/v1/remote?url=' +
				encodeURIComponent( ADDRESS )
		);
		expect( options.headers[ 'X-WP-Nonce' ] ).toBe( 'abc123' );
		expect( options.credentials ).toBe( 'same-origin' );
	} );

	it( 'throws with the status and the route’s own explanation', async () => {
		fetchMock.mockResolvedValue( {
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			json: async () => ( {
				message: 'This site is not set up to load GLL files.',
			} ),
		} );

		// The route's message is the actionable part — "turned off", "too
		// large" and "that address cannot be loaded" all lead somewhere
		// different — so it is preferred over anything derived from the status.
		await expect( fetchRemoteFile( ADDRESS ) ).rejects.toThrow(
			'This site is not set up to load GLL files.'
		);

		await expect( fetchRemoteFile( ADDRESS ) ).rejects.toMatchObject( {
			status: 403,
		} );
	} );

	it( 'still throws when the error body is not readable', async () => {
		fetchMock.mockResolvedValue( {
			ok: false,
			status: 502,
			statusText: 'Bad Gateway',
			json: async () => {
				throw new Error( 'not json' );
			},
		} );

		await expect( fetchRemoteFile( ADDRESS ) ).rejects.toBeInstanceOf(
			HttpError
		);
	} );
} );

describe( 'canUseProxy', () => {
	it( 'is true only where the editor’s nonce was localized', () => {
		expect( canUseProxy() ).toBe( true );

		delete window.gllInfoSettings.nonce;
		expect( canUseProxy() ).toBe( false );

		// A view script on a public page never gets the settings object's write
		// half, so it can never try.
		delete window.gllInfoSettings;
		expect( canUseProxy() ).toBe( false );
	} );
} );
