/**
 * GLL WASM Loader
 *
 * Singleton module for loading and managing the GLL WebAssembly parser.
 * Uses the Go WASM runtime to parse GLL files entirely in the browser.
 *
 * @package GllInfo
 */

// Module state
let wasmInstance = null;
let wasmReady = false;
let wasmError = null;
let loadPromise = null;

/**
 * Check if WebAssembly is supported in the current browser.
 *
 * @return {boolean} True if WASM is supported.
 */
export function isWasmSupported() {
	return (
		typeof WebAssembly === 'object' &&
		typeof WebAssembly.instantiate === 'function' &&
		typeof WebAssembly.instantiateStreaming === 'function'
	);
}

/**
 * Get the URL for the WASM file.
 *
 * @return {string} WASM file URL.
 */
function getWasmUrl() {
	// In WordPress, we need to use the plugin URL which is set globally.
	if (
		typeof window.gllInfoSettings !== 'undefined' &&
		window.gllInfoSettings.wasmUrl
	) {
		return window.gllInfoSettings.wasmUrl;
	}
	// Fallback for development.
	return '/wp-content/plugins/gll-info/assets/wasm/gll.wasm';
}

/**
 * Get the URL for the wasm_exec.js file.
 *
 * @return {string} wasm_exec.js URL.
 */
function getWasmExecUrl() {
	if (
		typeof window.gllInfoSettings !== 'undefined' &&
		window.gllInfoSettings.wasmExecUrl
	) {
		return window.gllInfoSettings.wasmExecUrl;
	}
	return '/wp-content/plugins/gll-info/assets/wasm/wasm_exec.js';
}

/**
 * Load the wasm_exec.js Go runtime script.
 *
 * @return {Promise<void>} Promise that resolves when script is loaded.
 */
function loadWasmExec() {
	return new Promise( ( resolve, reject ) => {
		// Check if already loaded.
		if ( typeof window.Go !== 'undefined' ) {
			resolve();
			return;
		}

		const script = document.createElement( 'script' );
		script.src = getWasmExecUrl();
		script.onload = resolve;
		script.onerror = () =>
			reject( new Error( 'Failed to load wasm_exec.js' ) );
		document.head.appendChild( script );
	} );
}

/**
 * Initialize the WASM module.
 * This is a singleton - calling it multiple times returns the same promise.
 *
 * @return {Promise<void>} Promise that resolves when WASM is ready.
 */
export async function initWasm() {
	// Return existing promise if already loading.
	if ( loadPromise ) {
		return loadPromise;
	}

	// Return immediately if already ready.
	if ( wasmReady ) {
		return Promise.resolve();
	}

	// Return error if previous attempt failed.
	if ( wasmError ) {
		return Promise.reject( wasmError );
	}

	loadPromise = ( async () => {
		try {
			// Check browser support.
			if ( ! isWasmSupported() ) {
				throw new Error(
					'WebAssembly is not supported in this browser'
				);
			}

			// Load the Go runtime.
			await loadWasmExec();

			// Initialize Go WASM.
			const go = new window.Go();

			// Fetch and instantiate the WASM module.
			const response = await fetch( getWasmUrl() );
			if ( ! response.ok ) {
				throw new Error(
					`Failed to fetch WASM: ${ response.status } ${ response.statusText }`
				);
			}

			const result = await WebAssembly.instantiateStreaming(
				response,
				go.importObject
			);
			wasmInstance = result.instance;

			// Run the Go program (this sets up the parseGLL function).
			go.run( wasmInstance );

			// Verify the parseGLL function is available.
			if ( typeof window.parseGLL !== 'function' ) {
				throw new Error(
					'WASM module did not export parseGLL function'
				);
			}

			wasmReady = true;
		} catch ( error ) {
			wasmError = error;
			throw error;
		}
	} )();

	return loadPromise;
}

/**
 * Check if WASM is ready to use.
 *
 * @return {boolean} True if WASM is initialized and ready.
 */
export function isWasmReady() {
	return wasmReady;
}

/**
 * Get any WASM initialization error.
 *
 * @return {Error|null} Error if initialization failed, null otherwise.
 */
export function getWasmError() {
	return wasmError;
}

/**
 * Parse a GLL file using the WASM module.
 *
 * @param {ArrayBuffer|Uint8Array} data The GLL file data.
 * @return {Promise<Object>} Promise resolving to parsed GLL data.
 */
export async function parseGLL( data ) {
	// Ensure WASM is initialized.
	if ( ! wasmReady ) {
		await initWasm();
	}

	// Convert to Uint8Array if needed.
	const uint8Array =
		data instanceof Uint8Array ? data : new Uint8Array( data );

	// Call the WASM parseGLL function.
	const resultJson = window.parseGLL( uint8Array );
	const result = JSON.parse( resultJson );

	if ( ! result.success ) {
		throw new Error( result.error || 'Failed to parse GLL file' );
	}

	return result.data;
}

/**
 * Parse a GLL file from a File object.
 *
 * @param {File} file The GLL file.
 * @return {Promise<Object>} Promise resolving to parsed GLL data.
 */
export async function parseGLLFile( file ) {
	if ( ! file.name.toLowerCase().endsWith( '.gll' ) ) {
		throw new Error( 'Invalid file type. Please select a .gll file.' );
	}

	const arrayBuffer = await file.arrayBuffer();
	return parseGLL( arrayBuffer );
}

/**
 * Parse a GLL file from a URL.
 *
 * @param {string} url The URL to the GLL file.
 * @return {Promise<Object>} Promise resolving to parsed GLL data.
 */
export async function parseGLLFromUrl( url ) {
	const response = await fetch( url );
	if ( ! response.ok ) {
		throw new Error(
			`Failed to fetch GLL file: ${ response.status } ${ response.statusText }`
		);
	}

	const arrayBuffer = await response.arrayBuffer();
	return parseGLL( arrayBuffer );
}

// Export default initialization function.
export default initWasm;
