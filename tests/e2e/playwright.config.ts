/**
 * Playwright configuration for the end-to-end suite.
 *
 * Runs against wp-env's tests environment on port 8889, not the development
 * site on 8888, so a run cannot disturb whatever is being looked at by hand.
 *
 * @package
 */

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.WP_BASE_URL || 'http://localhost:8889';

export default defineConfig( {
	testDir: './specs',
	// The blocks fetch a multi-megabyte WASM module and then parse a binary, so
	// the default 30 s is not generous for the round-trip specs.
	timeout: 120_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	// One worker: the specs publish posts and upload media into a single shared
	// WordPress, so parallel workers would race over the same site state.
	workers: 1,
	forbidOnly: !! process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	outputDir: './artifacts',

	use: {
		baseURL,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		video: 'off',
	},

	projects: [
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/,
		},
		{
			name: 'chromium',
			dependencies: [ 'setup' ],
			use: {
				...devices[ 'Desktop Chrome' ],
				storageState: './tests/e2e/.auth/admin.json',
				// SwiftShader gives headless Chromium a real GL context. Without
				// it the WebGL specs test the fallback path rather than the
				// renderer, which is the opposite of what they are for.
				launchOptions: {
					args: [
						'--use-gl=angle',
						'--use-angle=swiftshader',
						'--enable-unsafe-swiftshader',
					],
				},
			},
		},
		{
			name: 'firefox',
			dependencies: [ 'setup' ],
			use: {
				...devices[ 'Desktop Firefox' ],
				storageState: './tests/e2e/.auth/admin.json',
			},
			// Headless WebGL on Linux is unreliable in Firefox and WebKit, so
			// the @webgl specs run on Chromium only. Removing this filter does
			// not gain coverage; it gains flakes.
			grepInvert: /@webgl/,
		},
		{
			name: 'webkit',
			dependencies: [ 'setup' ],
			use: {
				...devices[ 'Desktop Safari' ],
				storageState: './tests/e2e/.auth/admin.json',
			},
			grepInvert: /@webgl/,
		},
	],
} );
