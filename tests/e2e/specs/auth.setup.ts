/**
 * Log in once and save the session for every other project to reuse.
 *
 * @package
 */

import { test as setup, expect } from '@playwright/test';

const AUTH_FILE = 'tests/e2e/.auth/admin.json';

setup( 'authenticate as admin', async ( { page } ) => {
	await page.goto( '/wp-login.php' );

	await page.getByLabel( 'Username or Email Address' ).fill( 'admin' );
	await page.getByLabel( 'Password', { exact: true } ).fill( 'password' );
	await page.getByRole( 'button', { name: 'Log In' } ).click();

	await expect(
		page.locator( '#wpadminbar, body.wp-admin' ).first()
	).toBeVisible();

	await page.context().storageState( { path: AUTH_FILE } );
} );
