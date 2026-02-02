/**
 * Global type declarations for GLL Info plugin
 */

// GLL Info plugin settings injected by WordPress
interface GllInfoSettings {
	wasmUrl: string;
	wasmExecUrl: string;
}

// Go WASM runtime
declare class Go {
	importObject: WebAssembly.Imports;
	run(instance: WebAssembly.Instance): Promise<void>;
}

// Extend Window interface for globals
declare global {
	interface Window {
		gllInfoSettings?: GllInfoSettings;
		Go: typeof Go;
		parseGLL: (data: Uint8Array) => string;
	}

	// Chart.js global (loaded via WordPress enqueue, not imported in view scripts)
	const Chart: typeof import('chart.js').Chart;
}

// Allow importing JSON files
declare module '*.json' {
	const value: Record<string, unknown>;
	export default value;
}

// Allow importing SCSS files
declare module '*.scss' {
	const content: Record<string, string>;
	export default content;
}

export {};
