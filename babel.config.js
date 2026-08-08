/**
 * Babel configuration.
 *
 * Used by babel-jest during tests; production builds go through the
 * `@wordpress/scripts` toolchain (which configures babel internally for webpack).
 *
 * Delegating to @wordpress/babel-preset-default keeps test transforms aligned
 * with the production toolchain — including @babel/preset-typescript so TS/TSX
 * files compile, and @babel/preset-react for JSX.
 */

module.exports = ( api ) => {
	api.cache.using( () => process.env.NODE_ENV );
	return {
		presets: [ '@wordpress/babel-preset-default' ],
	};
};
