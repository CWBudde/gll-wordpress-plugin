#!/usr/bin/env node
/**
 * Measure the cost of parsing and preparing every GLL in the reference corpus.
 *
 * Not a Jest test, deliberately. A "test" that reports a number rather than
 * asserting one misuses the runner, and Jest's worker scheduling and module
 * isolation add noise on the same order as the effects being measured. Not
 * gated in CI either: the corpus is machine-local, ~180 MB of third-party
 * vendor data, and GitHub runners vary enough on CPU-bound WASM to swamp any
 * threshold tight enough to catch a real regression.
 *
 * Run it by hand before a release and diff the result against
 * docs/performance.md.
 *
 * Usage:
 *   node --experimental-strip-types --expose-gc scripts/perf-corpus.mjs
 *   GLL_CORPUS=/path/to/gll node ... scripts/perf-corpus.mjs --json out.json
 */

import { createRequire, registerHooks } from 'node:module';
import {
	existsSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const require = createRequire( import.meta.url );

// The plugin source imports without file extensions, which webpack resolves and
// Node's ESM loader does not. Rather than transpile the tree, teach the
// resolver to retry with .ts/.tsx — enough to import the pure modules directly
// and measure the real code rather than a copy of it.
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

const CORPUS =
	process.env.GLL_CORPUS || '/mnt/projekte/Code/gll-tools/testdata/gll';

const { normalizeGllData } = await import( '../src/shared/gll-normalize.ts' );
const { getBalloonGrid, buildBalloonGeometryData } = await import(
	'../src/shared/balloon-utils.ts'
);
const { buildCaseGeometryData } = await import(
	'../src/shared/geometry-utils.ts'
);

/**
 * Boot the Go runtime and return the parser plus its WebAssembly instance.
 *
 * The instance is kept so its linear memory can be inspected: the Go heap grows
 * and is never returned to the host, which makes `mem.buffer.byteLength` the
 * real per-file memory floor — and the number most likely to explain a failure
 * on a memory-constrained browser.
 *
 * @return {Promise<{parse: Function, instance: WebAssembly.Instance}>} Parser handle.
 */
async function boot() {
	globalThis.TextEncoder = ( await import( 'node:util' ) ).TextEncoder;
	globalThis.TextDecoder = ( await import( 'node:util' ) ).TextDecoder;

	require( path.join( root, 'assets/wasm/wasm_exec.js' ) );

	const bytes = readFileSync( path.join( root, 'assets/wasm/gll.wasm' ) );
	const go = new globalThis.Go();
	const { instance } = await WebAssembly.instantiate(
		bytes,
		go.importObject
	);
	void go.run( instance );

	return { parse: globalThis.parseGLL, instance };
}

/**
 * Milliseconds elapsed while running a function, plus its result.
 *
 * @param {Function} fn Work to time.
 * @return {{ms: number, value: *}} Duration and result.
 */
function timed( fn ) {
	const start = performance.now();
	const value = fn();
	return { ms: performance.now() - start, value };
}

/**
 * Format a byte count for the report.
 *
 * @param {number} bytes Byte count.
 * @return {string} Human-readable size.
 */
function mb( bytes ) {
	return ( bytes / 1024 / 1024 ).toFixed( 1 );
}

const files = readdirSync( CORPUS )
	.filter( ( name ) => name.toLowerCase().endsWith( '.gll' ) )
	.sort(
		( a, b ) =>
			statSync( path.join( CORPUS, a ) ).size -
			statSync( path.join( CORPUS, b ) ).size
	);

if ( files.length === 0 ) {
	console.error( `No .gll files under ${ CORPUS }` );
	process.exit( 1 );
}

const rows = [];

for ( const name of files ) {
	// A fresh Go instance per file. The Go heap inside a WASM instance grows and
	// is never returned to the host, so reusing one instance would report each
	// file's memory as the running total of every file before it — which reads
	// as a per-file cost and is not one. Re-booting costs ~200 ms against parses
	// measured in seconds.
	const { parse, instance } = await boot();

	const filePath = path.join( CORPUS, name );
	const size = statSync( filePath ).size;
	const bytes = readFileSync( filePath );

	let peakRss = process.memoryUsage().rss;
	const sampler = setInterval( () => {
		peakRss = Math.max( peakRss, process.memoryUsage().rss );
	}, 5 );

	// The parser hands back a JSON *string*, so decoding it is a separate and
	// plausibly dominant cost that nothing has ever measured.
	const parsed = timed( () => parse( new Uint8Array( bytes ) ) );
	const decoded = timed( () => JSON.parse( parsed.value ) );

	clearInterval( sampler );

	if ( ! decoded.value.success ) {
		rows.push( { name, size, failed: true } );
		continue;
	}

	const normalized = timed( () => normalizeGllData( decoded.value.data ) );
	const data = normalized.value;

	// Render-side costs, which are the user-visible ones.
	const source = ( data.Database.SourceDefinitions || [] ).find(
		( entry ) => ( entry.Responses || [] ).length > 0
	);
	let balloonTriangles = 0;
	let balloonMs = 0;
	if ( source && getBalloonGrid( source ) ) {
		const built = timed( () =>
			buildBalloonGeometryData( source, {
				frequencyIndex: 0,
				dbRange: 40,
				scale: 1,
			} )
		);
		balloonMs = built.ms;
		balloonTriangles = built.value ? built.value.indices.length / 3 : 0;
	}

	const geometry = ( data.Database.CaseGeometries || [] )[ 0 ];
	const geometryBuilt = geometry
		? timed( () => buildCaseGeometryData( geometry ) )
		: { ms: 0, value: null };

	const chartPoints = source?.Responses?.[ 0 ]?.Frequencies?.length || 0;

	rows.push( {
		name,
		size,
		parseMs: parsed.ms,
		jsonBytes: parsed.value.length,
		decodeMs: decoded.ms,
		normalizeMs: normalized.ms,
		goHeap: instance.exports.mem.buffer.byteLength,
		peakRss,
		balloonMs,
		balloonTriangles,
		geometryMs: geometryBuilt.ms,
		geometryEdges: geometryBuilt.value
			? geometryBuilt.value.edgePositions.length / 6
			: 0,
		chartPoints,
	} );

	if ( typeof global.gc === 'function' ) {
		global.gc();
	}
}

const header = [
	'| File | Size | Parse | JSON | Decode | Normalize | Balloon | Tris | Geometry | Go heap | Peak RSS |',
	'|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
];

const body = rows.map( ( row ) => {
	if ( row.failed ) {
		return `| ${ row.name } | ${ mb( row.size ) } MB | parse failed |`;
	}
	return [
		`| ${ row.name }`,
		`${ mb( row.size ) } MB`,
		`${ row.parseMs.toFixed( 0 ) } ms`,
		`${ mb( row.jsonBytes ) } MB`,
		`${ row.decodeMs.toFixed( 0 ) } ms`,
		`${ row.normalizeMs.toFixed( 0 ) } ms`,
		`${ row.balloonMs.toFixed( 0 ) } ms`,
		`${ row.balloonTriangles }`,
		`${ row.geometryMs.toFixed( 0 ) } ms`,
		`${ mb( row.goHeap ) } MB`,
		`${ mb( row.peakRss ) } MB |`,
	].join( ' | ' );
} );

console.log( `<!-- generated by scripts/perf-corpus.mjs -->` );
console.log( `Corpus: ${ CORPUS } (${ files.length } files)` );
console.log(
	`Machine: ${ os.cpus()[ 0 ].model.trim() }, ${
		os.cpus().length
	} threads, node ${ process.version }`
);
console.log();
console.log( header.concat( body ).join( '\n' ) );

const jsonIndex = process.argv.indexOf( '--json' );
if ( jsonIndex !== -1 && process.argv[ jsonIndex + 1 ] ) {
	writeFileSync(
		process.argv[ jsonIndex + 1 ],
		JSON.stringify( rows, null, 2 )
	);
}
