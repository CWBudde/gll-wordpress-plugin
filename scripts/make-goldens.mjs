#!/usr/bin/env node
/**
 * Regenerate the golden fixtures that pin the two subset implementations.
 *
 * The display subset is built twice: `src/shared/gll-subset.ts` reduces a
 * normalized parse for the editor, and `includes/class-gll-subset.php` reduces
 * raw parser output for the server-side backends, which hand PHP a JSON string
 * with no JS in the loop. Two implementations of one shape drift unless
 * something holds them together, and neither suite can run the other's code.
 *
 * So both are held to one artifact instead of to each other:
 *
 *   tests/fixtures/sample-raw.json     raw parser output for sample.gll
 *   tests/fixtures/sample-subset.json  what the JS builder makes of it
 *
 * The Jest integration suite asserts the JS builder still reproduces the subset
 * from the raw golden; the PHPUnit suite asserts `GLL_Subset::from_raw()`
 * reproduces the same subset from the same raw golden. Both run in CI with no
 * corpus present, because the input is the committed 3 KB fixture.
 *
 * Run this after any deliberate change to the subset shape, and commit the
 * result together with the code change:
 *
 *   node --experimental-strip-types scripts/make-goldens.mjs
 */

import { createRequire, registerHooks } from 'node:module';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire( import.meta.url );

// The plugin source imports without file extensions, which webpack resolves and
// Node's ESM loader does not. Same hook as scripts/perf-corpus.mjs, and for the
// same reason: import the real modules rather than a copy of them.
registerHooks( {
	resolve( specifier, context, nextResolve ) {
		if ( specifier.startsWith( '.' ) && context.parentURL ) {
			const base = fileURLToPath(
				new URL( specifier, context.parentURL )
			);
			if ( ! existsSync( base ) ) {
				for ( const extension of [ '.ts', '.tsx' ] ) {
					if ( existsSync( base + extension ) ) {
						return nextResolve( specifier + extension, context );
					}
				}
			}
		}
		return nextResolve( specifier, context );
	},
} );

const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);

const { normalizeGllData } = await import( '../src/shared/gll-normalize.ts' );
const { buildDisplaySubset } = await import( '../src/shared/gll-subset.ts' );

globalThis.TextEncoder = ( await import( 'node:util' ) ).TextEncoder;
globalThis.TextDecoder = ( await import( 'node:util' ) ).TextDecoder;

require( path.join( root, 'assets/wasm/wasm_exec.js' ) );

const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(
	readFileSync( path.join( root, 'assets/wasm/gll.wasm' ) ),
	go.importObject
);
void go.run( instance );

const fixture = path.join( root, 'tests/fixtures/sample.gll' );
const result = JSON.parse(
	globalThis.parseGLL( new Uint8Array( readFileSync( fixture ) ) )
);

if ( ! result.success ) {
	throw new Error( `parse failed: ${ result.error }` );
}

/**
 * Write the subset a raw parse reduces to, pretty-printed.
 *
 * Tab-indented and newline-terminated so a shape change shows up as a
 * reviewable diff rather than one very long line.
 *
 * @param {string} name Fixture base name.
 * @param {Object} raw  Raw parser output.
 */
function writeSubset( name, raw ) {
	const file = path.join( root, `tests/fixtures/${ name }-subset.json` );
	writeSyncJson( file, buildDisplaySubset( normalizeGllData( raw ) ) );
	process.stdout.write( `wrote ${ path.relative( root, file ) }\n` );
}

/**
 * Serialize one golden.
 *
 * @param {string} file  Absolute path.
 * @param {Object} value Value to write.
 */
function writeSyncJson( file, value ) {
	writeFileSync( file, JSON.stringify( value, null, '\t' ) + '\n' );
}

const rawPath = path.join( root, 'tests/fixtures/sample-raw.json' );
writeSyncJson( rawPath, result.data );
process.stdout.write( `wrote ${ path.relative( root, rawPath ) }\n` );
writeSubset( 'sample', result.data );

// The committed 3 KB sample carries no frames, limits, warnings, filter groups
// or case geometries, so on its own it would leave most of the PHP reducer
// unexercised. `synthetic-raw.json` is hand-written to reach those branches —
// including the ones that DROP data: an edge with an unset endpoint, a face with
// fewer than three resolved indices, a box with no geometry (which must not
// shift the frame geometry's position in the flat list), and unknown limit,
// warning and filter-kind enums.
writeSubset(
	'synthetic',
	JSON.parse(
		readFileSync(
			path.join( root, 'tests/fixtures/synthetic-raw.json' ),
			'utf8'
		)
	)
);

// go.run() never settles and wasm_exec keeps the scheduler alive with a pending
// timer, so the process would hang here without an explicit exit.
process.exit( 0 );
