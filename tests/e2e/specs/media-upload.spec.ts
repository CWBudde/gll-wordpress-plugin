/**
 * Uploading a `.gll` through the real media pipeline.
 *
 * The cheapest and highest-value spec in the suite: it exercises the MIME
 * allowlist and the filetype reconciliation end to end through the REST API,
 * and fails immediately if either filter regresses. The PHP suite asserts the
 * same filters in isolation; this asserts that an actual upload succeeds.
 *
 * @package
 */

import { test, expect } from '@wordpress/e2e-test-utils-playwright';
import path from 'node:path';

const FIXTURE = path.resolve( __dirname, '../../fixtures/sample.gll' );

test.describe( 'media library', () => {
	test.afterAll( async ( { requestUtils } ) => {
		await requestUtils.deleteAllMedia();
	} );

	test( 'accepts a .gll upload and types it correctly', async ( {
		requestUtils,
	} ) => {
		// The utils' Media type does not declare mime_type, but the REST
		// response carries it and it is the field under test here.
		const media = ( await requestUtils.uploadMedia( FIXTURE ) ) as any;

		// A rejected MIME type surfaces here as an error rather than a record,
		// so reaching this line at all is most of the assertion.
		expect( media.mime_type ).toBe( 'application/x-gll' );
		expect( media.source_url ).toMatch( /\.gll$/ );
	} );
} );
