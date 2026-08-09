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
};
