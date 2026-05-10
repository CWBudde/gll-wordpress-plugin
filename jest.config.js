/**
 * Jest configuration for the GLL Info plugin.
 *
 * Two projects:
 *   - unit:        fast tests under jsdom (src/**\/*.test.ts(x))
 *   - integration: real WASM under node (tests/**\/*.integration.test.ts)
 *
 * Both extend @wordpress/jest-preset-default which is bundled with
 * @wordpress/scripts and handles babel transform for TS/TSX plus CSS module
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
};
