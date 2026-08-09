/**
 * Re-export the WordPress Prettier config so a bare `prettier` invocation uses
 * the same rules `wp-scripts format` does.
 *
 * `wp-scripts format` does not match `.mjs`, but `wp-scripts lint-js` does
 * enforce Prettier rules there. Without this file the two disagree: a release
 * script could fail lint with no formatter able to fix it.
 *
 * @package
 */

module.exports = require( '@wordpress/prettier-config' );
