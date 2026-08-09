/**
 * Make the tests site usable before any spec runs.
 *
 * This is not belt-and-braces. The WordPress core PHPUnit suite reinstalls the
 * tests site on every run, which deactivates the plugin AND leaves no active
 * theme — so `npm run test:php` followed by `npm run test:e2e` fails every
 * block-insertion spec, and the symptom (blocks simply never appear) points
 * nowhere near the cause.
 *
 * Why an active theme matters, since it reads as cosmetic: core's
 * `get_block_asset_url()` resolves a block stylesheet by testing its path
 * against `realpath( get_template_directory() )`. With no valid theme that
 * returns false, `wp_normalize_path` turns it into an empty string, and the
 * resulting `str_starts_with( $path, '/' )` matches every absolute path. Every
 * block stylesheet is then emitted as a theme URL with the server's filesystem
 * path glued on, 404s, and no block renders at all.
 *
 * @package
 */

import { execSync } from 'node:child_process';

export default function globalSetup(): void {
	const run = ( command: string ) =>
		execSync( command, { stdio: 'pipe', encoding: 'utf8' } );

	try {
		run( 'npx wp-env run tests-cli wp plugin activate gll-info' );
		run( 'npx wp-env run tests-cli wp theme activate twentytwentyfour' );
	} catch ( error ) {
		throw new Error(
			'Could not prepare the wp-env tests site. Is it running?\n' +
				'Try: npx wp-env start\n\n' +
				String( ( error as Error ).message )
		);
	}
}
