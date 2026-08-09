/**
 * Global type declarations for GLL Info plugin
 */

// GLL Info plugin settings injected by WordPress.
//
// PHP localizes this onto every block's editor and view script. The two payloads
// differ: `restUrl` reaches both, but `nonce` is editor-only, because the write
// routes need one and the public read route does not. Everything past the two
// WASM URLs is therefore optional here rather than required.
interface GllInfoSettings {
	wasmUrl: string;
	wasmExecUrl: string;
	pluginUrl?: string;
	restUrl?: string;
	nonce?: string;
}

// Go WASM runtime
declare class Go {
	importObject: WebAssembly.Imports;
	run( instance: WebAssembly.Instance ): Promise< void >;
}

// Extend Window interface for globals
declare global {
	interface Window {
		gllInfoSettings?: GllInfoSettings;
		Go: typeof Go;
		parseGLL: ( data: Uint8Array ) => string;
	}

	// Chart.js global (loaded via WordPress enqueue, not imported in view scripts)
	const Chart: typeof import('chart.js').Chart;
}

// Allow importing JSON files
declare module '*.json' {
	const value: Record< string, unknown >;
	export default value;
}

// Allow importing SCSS files
declare module '*.scss' {
	const content: Record< string, string >;
	export default content;
}

export {};
