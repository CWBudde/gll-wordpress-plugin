/**
 * Jest configuration for the GLL Info plugin.
 *
 * Two projects:
 *   - unit:        fast tests under jsdom (src/**\/*.test.ts(x))
 *   - integration: real WASM under node (tests/**\/*.integration.test.ts)
 *
 * Both extend @wordpress/jest-preset-default which is bundled with
 * `@wordpress/scripts` and handles babel transform for TS/TSX plus CSS module
 * mapping. The preset also adds @wordpress/jest-console which fails tests on
 * unhandled console.error / console.warn.
 */

const sharedModuleNameMapper = {
	'^@shared/(.*)$': '<rootDir>/src/shared/$1',
};

const sharedTransformIgnorePatterns = [
	'/node_modules/(?!(@wordpress|@babel)/)',
];

module.exports = {
	projects: [
		{
			displayName: 'unit',
			preset: '@wordpress/jest-preset-default',
			testEnvironment: 'jsdom',
			testMatch: [ '<rootDir>/src/**/*.test.{ts,tsx}' ],
			testPathIgnorePatterns: [
				'/node_modules/',
				'/build/',
				'\\.integration\\.test\\.',
			],
			setupFilesAfterEnv: [
				'<rootDir>/node_modules/@wordpress/jest-preset-default/scripts/setup-test-framework.js',
				'<rootDir>/jest.setup.js',
			],
			moduleNameMapper: sharedModuleNameMapper,
			transformIgnorePatterns: sharedTransformIgnorePatterns,
		},
		{
			displayName: 'integration',
			// Do not use the preset here: its setup-globals.js references
			// `window`, which is undefined under testEnvironment: 'node'.
			testEnvironment: 'node',
			testMatch: [
				'<rootDir>/tests/**/*.integration.test.{ts,tsx}',
				'<rootDir>/src/**/*.integration.test.{ts,tsx}',
			],
			testPathIgnorePatterns: [ '/node_modules/', '/build/' ],
			moduleNameMapper: sharedModuleNameMapper,
			transform: {
				'\\.[jt]sx?$': require.resolve( 'babel-jest' ),
			},
			transformIgnorePatterns: sharedTransformIgnorePatterns,
		},
	],
	testTimeout: 30000,

	// Coverage settings are root-level siblings of `projects`, NOT per-project.
	// Jest silently ignores `coverageThreshold` placed inside a project entry,
	// which looks like it works and enforces nothing.
	//
	// Collected for the unit project only (see the test:coverage script): the
	// integration project's reach depends on whether the reference corpus is
	// present, so mixing it in would make the number differ between a laptop
	// and CI and leave any threshold unenforceable.
	collectCoverageFrom: [
		'src/**/*.{ts,tsx}',
		'!src/**/*.test.{ts,tsx}',
		'!src/**/*.d.ts',
		'!src/global.d.ts',
		// Block registration boilerplate: a registerBlockType call and nothing
		// to assert about it that the PHP registration tests do not cover.
		'!src/**/index.tsx',
		// Frontend entry points. Each registers a DOMContentLoaded handler and
		// constructs a Chart or a WebGLRenderer on import, so what remains
		// after the render modules are extracted is browser-only glue. Leaving
		// it in the denominator makes the number noise nobody acts on.
		'!src/**/view.ts',
		// No WebGL context exists under jsdom; testing these would assert
		// against our own mocks.
		'!src/shared/three-wrapper.tsx',
		'!src/shared/geometry-viewer.tsx',
	],
	coverageReporters: [ 'text-summary', 'lcov' ],

	// Measured, not chosen. A threshold picked from a book goes red on its first
	// run and gets deleted within the week.
	//
	// The per-path floors are the ones that matter: they sit just under what
	// each well-covered module reaches today, so deleting a test or growing an
	// untested branch in exactly the code this phase covered fails loudly.
	//
	// `global` is NOT the whole-project number. Jest removes every file matched
	// by a path-specific threshold from the global group, so this applies only
	// to what is left over — the editor components and the geometry viewer.
	// The summary printed above the failure still reports the whole project
	// (currently ~67%), which makes the two look contradictory; they are
	// measuring different sets. Set against the residual, and expect it to move
	// whenever a path entry is added or removed.
	coverageThreshold: {
		global: {
			statements: 55,
			branches: 46,
			functions: 49,
			lines: 55,
		},
		'./src/shared/escape-html.ts': {
			statements: 100,
			branches: 100,
			functions: 100,
			lines: 100,
		},
		'./src/shared/a11y.ts': { statements: 95, branches: 92 },
		'./src/shared/charting-utils.ts': { statements: 95, branches: 92 },
		'./src/shared/balloon-utils.ts': { statements: 88, branches: 80 },
		'./src/shared/polar-utils.ts': { statements: 80, branches: 76 },
		'./src/shared/polar-compass-plugin.ts': {
			statements: 100,
			branches: 100,
		},
		'./src/frequency-response/response-render.ts': {
			statements: 95,
			branches: 92,
		},
		'./src/polar-plot/polar-render.ts': { statements: 95, branches: 92 },
		'./src/balloon-3d/balloon-render.ts': { statements: 95, branches: 92 },
	},
};
