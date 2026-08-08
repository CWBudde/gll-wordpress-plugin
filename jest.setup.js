/**
 * Jest setup for the unit project.
 *
 * - Adds @testing-library/jest-dom matchers (toBeInTheDocument, etc.)
 * - Polyfills Blob.prototype.arrayBuffer / .text — jsdom 26 (used by
 *   jest-environment-jsdom 30) does not implement these, but the GLL loader
 *   relies on File.prototype.arrayBuffer().
 * - Stubs ResizeObserver, which jsdom does not implement at all. Several
 *   WordPress components construct one on mount and throw without it. The stub
 *   is inert: nothing under test depends on observed sizes, and the components
 *   that do use it fall back to their unmeasured layout.
 *
 * Kept as plain CommonJS so it does not need babel transformation.
 */

require( '@testing-library/jest-dom' );

if (
	typeof Blob !== 'undefined' &&
	typeof Blob.prototype.arrayBuffer !== 'function'
) {
	Blob.prototype.arrayBuffer = function arrayBuffer() {
		return new Promise( ( resolve, reject ) => {
			const reader = new FileReader();
			reader.onload = () => resolve( reader.result );
			reader.onerror = () => reject( reader.error );
			reader.readAsArrayBuffer( this );
		} );
	};
}

if ( typeof global.ResizeObserver === 'undefined' ) {
	global.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
