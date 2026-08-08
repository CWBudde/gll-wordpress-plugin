/**
 * Unit tests for the WASM loader.
 *
 * The loader keeps module-level singleton state (loadPromise / wasmReady /
 * wasmError). Each test re-imports the module via jest.isolateModulesAsync()
 * so cases don't bleed into each other.
 *
 * To avoid mocking document.head + script tag injection, we pre-register
 * `window.Go` before calling initWasm — this drives the loader down the
 * "wasm_exec already loaded" early-return branch in loadWasmExec().
 */

type LoaderModule = typeof import('./wasm-loader');

interface FakeWasmEnv {
	parseGLLImpl: jest.Mock;
	originalFetch: typeof globalThis.fetch | undefined;
	originalGo: unknown;
	originalParseGLL: unknown;
	originalInstantiateStreaming: typeof WebAssembly.instantiateStreaming;
}

/**
 * Set up the globals the WASM loader expects: window.Go (constructor whose
 * run() registers window.parseGLL), global fetch (returns ok:true), and
 * WebAssembly.instantiateStreaming (returns fake instance).
 *
 * @param {Function} parseGLLImpl               Mock for the function the WASM
 *                                              module would normally export.
 * @param {Object}   [options]                  Behavior tweaks.
 * @param {boolean}  [options.registerParseGLL] When false, fake Go.run() skips
 *                                              registering parseGLL (used for
 *                                              the missing-export error path).
 * @return {FakeWasmEnv} Snapshot of replaced globals for teardown.
 */
function setupSuccessfulWasmEnvironment(
	parseGLLImpl: jest.Mock = jest.fn( () =>
		JSON.stringify( { success: true, data: { ok: true } } )
	),
	options: { registerParseGLL?: boolean } = {}
): FakeWasmEnv {
	const { registerParseGLL = true } = options;

	const env: FakeWasmEnv = {
		parseGLLImpl,
		originalFetch: globalThis.fetch,
		originalGo: ( window as any ).Go,
		originalParseGLL: ( window as any ).parseGLL,
		originalInstantiateStreaming: WebAssembly.instantiateStreaming,
	};

	globalThis.fetch = jest.fn().mockResolvedValue( {
		ok: true,
		status: 200,
		statusText: 'OK',
	} as Response ) as any;

	( WebAssembly as any ).instantiateStreaming = jest
		.fn()
		.mockResolvedValue( { instance: {}, module: {} } );

	( window as any ).Go = class FakeGo {
		importObject = {};
		run() {
			if ( registerParseGLL ) {
				( window as any ).parseGLL = parseGLLImpl;
			}
		}
	};

	return env;
}

function teardownWasmEnvironment( env: FakeWasmEnv ): void {
	globalThis.fetch = env.originalFetch as any;
	( WebAssembly as any ).instantiateStreaming =
		env.originalInstantiateStreaming;
	delete ( window as any ).Go;
	delete ( window as any ).parseGLL;
	if ( env.originalGo !== undefined ) {
		( window as any ).Go = env.originalGo;
	}
	if ( env.originalParseGLL !== undefined ) {
		( window as any ).parseGLL = env.originalParseGLL;
	}
	jest.restoreAllMocks();
}

async function loadFreshLoader(): Promise< LoaderModule > {
	let mod: LoaderModule | undefined;
	await jest.isolateModulesAsync( async () => {
		mod = await import( './wasm-loader' );
	} );
	if ( ! mod ) {
		throw new Error( 'failed to import wasm-loader' );
	}
	return mod;
}

describe( 'wasm-loader', () => {
	describe( 'isWasmSupported', () => {
		it( 'returns true when WebAssembly is available', async () => {
			const loader = await loadFreshLoader();
			expect( loader.isWasmSupported() ).toBe( true );
		} );

		it( 'returns false when WebAssembly.instantiateStreaming is missing', async () => {
			const original = WebAssembly.instantiateStreaming;
			( WebAssembly as any ).instantiateStreaming = undefined;
			try {
				const loader = await loadFreshLoader();
				expect( loader.isWasmSupported() ).toBe( false );
			} finally {
				( WebAssembly as any ).instantiateStreaming = original;
			}
		} );
	} );

	describe( 'initWasm', () => {
		it( 'is idempotent for concurrent callers (only one fetch)', async () => {
			// initWasm is declared async, so each call returns a fresh outer
			// Promise even though both chain to the shared inner loadPromise.
			// Object identity is the wrong assertion; behavior is what matters.
			const env = setupSuccessfulWasmEnvironment();
			try {
				const loader = await loadFreshLoader();
				const p1 = loader.initWasm();
				const p2 = loader.initWasm();
				await Promise.all( [ p1, p2 ] );
				expect( loader.isWasmReady() ).toBe( true );
				expect(
					( globalThis.fetch as jest.Mock ).mock.calls
				).toHaveLength( 1 );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'becomes ready after successful initialization', async () => {
			const env = setupSuccessfulWasmEnvironment();
			try {
				const loader = await loadFreshLoader();
				expect( loader.isWasmReady() ).toBe( false );
				await loader.initWasm();
				expect( loader.isWasmReady() ).toBe( true );
				expect( loader.getWasmError() ).toBeNull();
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'rejects and exposes the error when fetch fails', async () => {
			const env = setupSuccessfulWasmEnvironment();
			( globalThis.fetch as jest.Mock ).mockResolvedValue( {
				ok: false,
				status: 404,
				statusText: 'Not Found',
			} );
			try {
				const loader = await loadFreshLoader();
				await expect( loader.initWasm() ).rejects.toThrow(
					/Failed to fetch WASM/
				);
				expect( loader.isWasmReady() ).toBe( false );
				expect( loader.getWasmError() ).toBeInstanceOf( Error );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'reports an error when WASM does not export parseGLL', async () => {
			const env = setupSuccessfulWasmEnvironment( jest.fn(), {
				registerParseGLL: false,
			} );
			try {
				const loader = await loadFreshLoader();
				await expect( loader.initWasm() ).rejects.toThrow(
					/did not export parseGLL/
				);
			} finally {
				teardownWasmEnvironment( env );
			}
		} );
	} );

	describe( 'parseGLL', () => {
		it( 'auto-initializes when called before initWasm completes', async () => {
			const parseImpl = jest.fn( () =>
				JSON.stringify( {
					success: true,
					data: { GenSystem: { Label: 'X' } },
				} )
			);
			const env = setupSuccessfulWasmEnvironment( parseImpl );
			try {
				const loader = await loadFreshLoader();
				const bytes = new Uint8Array( [ 1, 2, 3 ] );
				const data = await loader.parseGLL( bytes );
				expect( loader.isWasmReady() ).toBe( true );
				expect( parseImpl ).toHaveBeenCalledWith( bytes );
				expect( data ).toEqual( { GenSystem: { Label: 'X' } } );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'converts ArrayBuffer input to Uint8Array before passing to WASM', async () => {
			const parseImpl = jest.fn( ( arg ) => {
				expect( arg ).toBeInstanceOf( Uint8Array );
				return JSON.stringify( { success: true, data: {} } );
			} );
			const env = setupSuccessfulWasmEnvironment( parseImpl );
			try {
				const loader = await loadFreshLoader();
				await loader.parseGLL( new ArrayBuffer( 8 ) );
				expect( parseImpl ).toHaveBeenCalledTimes( 1 );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'throws when WASM returns success: false', async () => {
			const parseImpl = jest.fn( () =>
				JSON.stringify( { success: false, error: 'bad checksum' } )
			);
			const env = setupSuccessfulWasmEnvironment( parseImpl );
			try {
				const loader = await loadFreshLoader();
				await expect(
					loader.parseGLL( new Uint8Array() )
				).rejects.toThrow( 'bad checksum' );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );
	} );

	describe( 'parseGLLFile', () => {
		it( 'rejects files without a .gll extension', async () => {
			const env = setupSuccessfulWasmEnvironment();
			try {
				const loader = await loadFreshLoader();
				const file = new File( [ 'x' ], 'speaker.txt' );
				await expect( loader.parseGLLFile( file ) ).rejects.toThrow(
					/Invalid file type/
				);
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'reads the file as ArrayBuffer and parses it', async () => {
			const parseImpl = jest.fn( () =>
				JSON.stringify( {
					success: true,
					// Already-normalized shape: parseGLL passes it through
					// untouched, keeping this test about plumbing.
					data: { Database: {}, ok: 1 },
				} )
			);
			const env = setupSuccessfulWasmEnvironment( parseImpl );
			try {
				const loader = await loadFreshLoader();
				// Pre-warm initWasm to isolate the failure surface from
				// async file-reading.
				await loader.initWasm();

				// File-shaped object: avoids the jsdom Blob.arrayBuffer polyfill
				// path so we test parseGLLFile in isolation.
				const fileLike = {
					name: 'speaker.gll',
					arrayBuffer: jest
						.fn()
						.mockResolvedValue(
							new Uint8Array( [ 9, 8, 7 ] ).buffer
						),
				} as unknown as File;

				const result = await loader.parseGLLFile( fileLike );
				expect( result ).toEqual( { Database: {}, ok: 1 } );
				expect(
					fileLike.arrayBuffer as jest.Mock
				).toHaveBeenCalledTimes( 1 );
				expect( parseImpl ).toHaveBeenCalledTimes( 1 );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );
	} );

	describe( 'parseGLLFromUrl', () => {
		it( 'fetches the URL and parses the response body', async () => {
			const parseImpl = jest.fn( () =>
				JSON.stringify( {
					success: true,
					// Already-normalized shape: parseGLL passes it through
					// untouched, keeping this test about plumbing.
					data: { Database: {}, url: 'ok' },
				} )
			);
			const env = setupSuccessfulWasmEnvironment( parseImpl );

			// parseGLLFromUrl fetches the URL FIRST (needs arrayBuffer), then
			// parseGLL → initWasm fetches the WASM binary (instantiateStreaming
			// is mocked, so the response body is never read).
			( globalThis.fetch as jest.Mock )
				.mockResolvedValueOnce( {
					ok: true,
					status: 200,
					statusText: 'OK',
					arrayBuffer: async () => new Uint8Array( [ 1, 2 ] ).buffer,
				} as Response )
				.mockResolvedValueOnce( {
					ok: true,
					status: 200,
					statusText: 'OK',
				} as Response );

			try {
				const loader = await loadFreshLoader();
				const result = await loader.parseGLLFromUrl(
					'https://example.com/sample.gll'
				);
				expect( result ).toEqual( { Database: {}, url: 'ok' } );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );

		it( 'surfaces fetch errors on the GLL file', async () => {
			const env = setupSuccessfulWasmEnvironment();
			// First (and only) fetch: the URL fetch fails → WASM init never runs.
			( globalThis.fetch as jest.Mock ).mockResolvedValueOnce( {
				ok: false,
				status: 500,
				statusText: 'Server Error',
			} as Response );

			try {
				const loader = await loadFreshLoader();
				await expect(
					loader.parseGLLFromUrl( 'https://example.com/bad.gll' )
				).rejects.toThrow( /Failed to fetch GLL file/ );
			} finally {
				teardownWasmEnvironment( env );
			}
		} );
	} );

	describe( 'ensureWasmReady alias', () => {
		it( 'is the same function as initWasm', async () => {
			const loader = await loadFreshLoader();
			expect( loader.ensureWasmReady ).toBe( loader.initWasm );
		} );
	} );
} );
