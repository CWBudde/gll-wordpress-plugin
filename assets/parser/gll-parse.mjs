#!/usr/bin/env node
/* eslint-env node */
/* global globalThis */
/**
 * Parse a GLL file with the bundled WebAssembly parser and print the result.
 *
 * This is the server-side half of the plugin's parsing story. It runs the exact
 * `assets/wasm/gll.wasm` the browser runs, under Node instead of a browser, so
 * the plugin gains a server-side parser without gaining a Go toolchain on the
 * server — the dependency the project set out to avoid. `GLL_Parser_Node`
 * invokes it; `tests/helpers/wasm-harness.ts` and `scripts/perf-corpus.mjs` have
 * been booting the same runtime under Node since Phase 12.
 *
 * Usage:
 *   node gll-parse.mjs <path-to-file.gll>
 *
 * Prints the parser's `data` object as JSON on stdout and exits 0. On any
 * failure it prints a message on stderr and exits non-zero; the caller treats
 * that as "no cache", which is a state the frontend already handles by parsing
 * in the browser.
 *
 * Deliberately plain JavaScript with no imports from `src/`: it never builds the
 * display subset, only the raw parse. `GLL_Subset::from_raw()` does the
 * reduction in PHP, because the other two backends hand PHP raw output too and
 * routing them through Node to reduce it would make Node a dependency of all
 * three.
 *
 * @package
 */

import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TextDecoder, TextEncoder } from 'node:util';

const require = createRequire( import.meta.url );

const here = path.dirname( fileURLToPath( import.meta.url ) );
const wasmDir = path.resolve( here, '..', 'wasm' );

/**
 * Fail with a message on stderr.
 *
 * @param {string} message Diagnostic for the PHP caller's error log.
 */
function fail( message ) {
	process.stderr.write( `${ message }\n` );
	process.exit( 1 );
}

const file = process.argv[ 2 ];
if ( ! file ) {
	fail( 'usage: gll-parse.mjs <path-to-file.gll>' );
}

// The Go runtime refuses to load without these, and Node does not put them on
// the global object until v11+/undici — set them explicitly rather than assume.
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;

let raw;
try {
	require( path.join( wasmDir, 'wasm_exec.js' ) );

	const go = new globalThis.Go();
	const { instance } = await WebAssembly.instantiate(
		readFileSync( path.join( wasmDir, 'gll.wasm' ) ),
		go.importObject
	);
	// Never settles: the Go scheduler runs for the process lifetime. The
	// explicit process.exit() at the end is what ends it.
	void go.run( instance );

	raw = JSON.parse(
		globalThis.parseGLL( new Uint8Array( readFileSync( file ) ) )
	);
} catch ( error ) {
	fail( `gll-parse: ${ error && error.message ? error.message : error }` );
}

if ( ! raw || ! raw.success ) {
	fail( `gll-parse: ${ ( raw && raw.error ) || 'parse failed' }` );
}

/**
 * Drop the payloads the display subset does not carry, before PHP ever sees them.
 *
 * The parser expands a 15.4 MB GLL into 228.7 MB of JSON, and handing that to
 * `json_decode()` would need more memory than a normal PHP process is given —
 * the server-side path would then work only for small files. Nearly all of that
 * volume is response spectra, and the subset keeps only how many there are.
 *
 * So each response is replaced by an empty object rather than removed: the
 * arrays keep their length, `GLL_Subset::from_raw()` counts them exactly as it
 * would have, and it needs no knowledge that this pruning happened. It sees the
 * same raw shape whether it came from here, from the `gllinfo` CLI, or from a
 * PHP WASM runtime — none of which prune, which is why `GLL_Parser` also applies
 * a file-size ceiling to those two.
 *
 * @param {Object} data Raw parser output.
 * @return {Object} The same object, pruned in place.
 */
function prune( data ) {
	const database = data && data.database;
	if ( ! database ) {
		return data;
	}

	const blank = ( list ) =>
		Array.isArray( list ) ? list.map( () => ( {} ) ) : list;

	// The parser hands back the undecoded bytes of the system block alongside
	// the fields it decoded. Nothing downstream has ever read it — the
	// normalizer maps named members only — and it is by far the largest single
	// thing in the output: 20.5 MB of the 26.5 MB this file used to print.
	delete data.gen_system?.raw_block;

	for ( const source of database.source_definitions || [] ) {
		if ( source.responses ) {
			source.responses = blank( source.responses );
		}

		const definition = source.definition;
		if ( ! definition ) {
			continue;
		}

		// Carried by neither cached block; only frequency-response and
		// polar-plot read it, and both keep parsing in the browser.
		delete definition.on_axis_spectrum;

		if ( definition.balloon_data && definition.balloon_data.responses ) {
			definition.balloon_data.responses = blank(
				definition.balloon_data.responses
			);
		}
	}

	// FIR coefficients: 8193 float64 each for `data_irm` and `data_dip`, about
	// 200 KB per filter as JSON, and the subset keeps only how many there are.
	// Zeroed rather than removed, for the same reason the responses are blanked
	// rather than dropped — `GLL_Subset::from_raw()` counts `data_irm` and must
	// not have to know whether it was pruned.
	for ( const group of database.filter_groups || [] ) {
		for ( const entry of group.filters || [] ) {
			for ( const filter of entry.filter?.filters || [] ) {
				const fir = filter.fir_data;
				if ( ! fir ) {
					continue;
				}

				if ( Array.isArray( fir.data_irm ) ) {
					fir.data_irm = fir.data_irm.map( () => 0 );
				}
				delete fir.data_dip;
			}

			// Filter spectra become presence booleans in the subset, so only
			// whether they are empty survives the reduction.
			for ( const filter of entry.filter?.filters || [] ) {
				const spectrum = filter.log_spectrum;
				if ( ! spectrum ) {
					continue;
				}

				spectrum.level = spectrum.level?.length
					? [ 0 ]
					: spectrum.level;
				spectrum.phase = spectrum.phase?.length
					? [ 0 ]
					: spectrum.phase;
			}
		}
	}

	// Base64 payloads belonging to the `resources` block, which is not cached.
	// The largest embedded datasheet in the reference corpus is 2.17 MB.
	for ( const key of [ 'include_files', 'data_files' ] ) {
		for ( const entry of database[ key ] || [] ) {
			delete entry.data_uri;
		}
	}

	// The parser's heuristic byte scan. The normalizer has dropped it since
	// Phase 9: its PNG entries duplicate `data_files` byte for byte and its
	// zlib entries are the internals of embedded PDFs.
	delete data.resources;

	return data;
}

// The exit MUST wait for the write to drain, and this is not a stylistic
// preference. When stdout is a pipe — which is exactly how `GLL_Parser_Node`
// runs this — Node writes to it asynchronously, and `process.exit()` discards
// whatever has not been flushed. A large parse would then arrive at PHP
// truncated at the pipe buffer, as valid-looking JSON that stops mid-object.
//
// It does not reproduce when stdout is redirected to a file, because file
// writes are synchronous: testing this by hand with `> out.json` looks perfect
// while every real invocation is broken.
//
// Exiting explicitly is still necessary: `go.run()` never settles and wasm_exec
// keeps a timer pending, so the process would otherwise hang after printing.
process.stdout.write( JSON.stringify( prune( raw.data ) ), () => {
	process.exit( 0 );
} );
