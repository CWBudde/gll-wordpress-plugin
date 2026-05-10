/**
 * Integration test: load the real Go-compiled gll.wasm in Node.
 *
 * This test bypasses the wasm-loader (which is browser-oriented) and runs the
 * stock Go runtime directly. The Go wasm_exec.js is an IIFE that defines
 * `globalThis.Go`; require()-ing it executes the script and registers `Go`.
 * Once `go.run(instance)` runs, the WASM module registers `globalThis.parseGLL`.
 *
 * If the fixture at tests/fixtures/sample.gll is missing, the actual contract
 * assertion is skipped so contributors without the binary are not blocked.
 *
 * NOTE: Go's wasm_exec.js predates WASI. If Go ever ships a Node-incompatible
 * wasm_exec.js, this test will fail at the require() step and the fix will be
 * to use Node's `vm` module or evaluate the script with a shim.
 */

import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

const PROJECT_ROOT = path.resolve( __dirname, '..' );
const WASM_PATH = path.join( PROJECT_ROOT, 'assets', 'wasm', 'gll.wasm' );
const WASM_EXEC_PATH = path.join(
	PROJECT_ROOT,
	'assets',
	'wasm',
	'wasm_exec.js'
);
const FIXTURE_PATH = path.join(
	PROJECT_ROOT,
	'tests',
	'fixtures',
	'sample.gll'
);

const hasFixture = existsSync( FIXTURE_PATH );
const maybeIt = hasFixture ? it : it.skip;

describe( 'real WASM parser (integration)', () => {
	beforeAll( () => {
		// Loading wasm_exec.js mutates globalThis (sets `Go`). The integration
		// project runs in its own worker so this won't pollute jsdom tests.
		require( WASM_EXEC_PATH );
	} );

	maybeIt(
		'parses a sample GLL file and returns a recognizable shape',
		async () => {
			expect( typeof ( globalThis as any ).Go ).toBe( 'function' );

			const wasmBytes = await fs.readFile( WASM_PATH );
			const go = new ( globalThis as any ).Go();
			const { instance } = await WebAssembly.instantiate(
				wasmBytes,
				go.importObject
			);

			// Kick the Go runtime: this registers globalThis.parseGLL.
			// `go.run` resolves when the program exits; we don't await it because
			// the WASM keeps running while the JS host is alive.
			void go.run( instance );

			expect( typeof ( globalThis as any ).parseGLL ).toBe( 'function' );

			const fixtureBytes = await fs.readFile( FIXTURE_PATH );
			const resultJson = ( globalThis as any ).parseGLL(
				new Uint8Array( fixtureBytes )
			);
			const result = JSON.parse( resultJson );

			expect( result.success ).toBe( true );
			expect( result.data ).toBeDefined();
			expect( result.data.Header ).toBeDefined();
			expect( result.data.GenSystem ).toBeDefined();
			expect( result.data.Database ).toBeDefined();
			expect(
				Array.isArray( result.data.Database.SourceDefinitions )
			).toBe( true );
		}
	);

	if ( ! hasFixture ) {
		it.skip( `SKIPPED: missing fixture at ${ FIXTURE_PATH }. Drop a real .gll file there to enable this test.`, () => {} );
	}
} );
