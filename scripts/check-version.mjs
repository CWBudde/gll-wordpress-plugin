#!/usr/bin/env node
/**
 * Assert that the plugin version agrees everywhere it is written down.
 *
 * The version lives in five places and every release bumps them by hand:
 *
 *   1. the `Version:` header in gll-info.php   (what WordPress shows)
 *   2. `define( 'GLL_INFO_VERSION', ... )`     (what cache-busts the assets)
 *   3. `Stable tag:` in readme.txt             (what wp.org would serve)
 *   4. `version` in package.json               (what names the ZIP)
 *   5. the newest `= x.y.z =` changelog heading in readme.txt
 *
 * Missing one is silent: the plugin installs, the blocks work, and the only
 * symptom is a stale asset URL or a changelog that describes the wrong release.
 * This check is what makes the manual procedure safe, which is worth more than
 * automating the bump itself.
 *
 * Usage:
 *   node scripts/check-version.mjs
 *   node scripts/check-version.mjs --expect 0.2.0
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);

/**
 * Read a file relative to the project root.
 *
 * @param {string} relative Path relative to the repository root.
 * @return {string} File contents.
 */
function read( relative ) {
	return readFileSync( path.join( root, relative ), 'utf8' );
}

/**
 * Pull a single capture group out of a file, or record why it was not found.
 *
 * @param {string} label    Human-readable name of the location.
 * @param {string} contents File contents to search.
 * @param {RegExp} pattern  Pattern whose first group is the version.
 * @return {{label: string, version: string|null}} What was found.
 */
function extract( label, contents, pattern ) {
	const match = contents.match( pattern );
	return { label, version: match ? match[ 1 ].trim() : null };
}

const pluginPhp = read( 'gll-info.php' );
const readmeTxt = read( 'readme.txt' );
const packageJson = JSON.parse( read( 'package.json' ) );

const found = [
	extract(
		'gll-info.php "Version:" header',
		pluginPhp,
		/^\s*\*\s*Version:\s*(.+)$/m
	),
	extract(
		'gll-info.php GLL_INFO_VERSION',
		pluginPhp,
		/define\(\s*'GLL_INFO_VERSION',\s*'([^']+)'\s*\)/
	),
	extract( 'readme.txt "Stable tag:"', readmeTxt, /^Stable tag:\s*(.+)$/m ),
	{ label: 'package.json "version"', version: packageJson.version ?? null },
	// The newest heading under == Changelog ==, which is the first `= x.y.z =`
	// line after that section starts.
	extract(
		'readme.txt newest changelog heading',
		readmeTxt.slice( readmeTxt.indexOf( '== Changelog ==' ) ),
		/^=\s*([0-9]+\.[0-9]+\.[0-9]+)\s*=$/m
	),
];

const missing = found.filter( ( entry ) => ! entry.version );
if ( missing.length ) {
	console.error( 'check-version: could not read the version from:' );
	missing.forEach( ( entry ) => console.error( `  - ${ entry.label }` ) );
	process.exit( 1 );
}

const versions = new Set( found.map( ( entry ) => entry.version ) );

if ( versions.size > 1 ) {
	console.error( 'check-version: versions disagree.' );
	found.forEach( ( entry ) =>
		console.error( `  ${ entry.version.padEnd( 12 ) } ${ entry.label }` )
	);
	process.exit( 1 );
}

const [ version ] = [ ...versions ];

// `--expect <v>` is what a tag build uses: the tag is the source of truth there,
// and a tag that does not match the tree is a mis-cut release.
const expectIndex = process.argv.indexOf( '--expect' );
if ( expectIndex !== -1 ) {
	const expected = ( process.argv[ expectIndex + 1 ] || '' ).replace(
		/^v/,
		''
	);
	if ( expected !== version ) {
		console.error(
			`check-version: tree is ${ version } but ${ expected } was expected.`
		);
		process.exit( 1 );
	}
}

console.log(
	`check-version: ${ version } in all ${ found.length } locations.`
);
