/**
 * Shared GLL Info exports.
 *
 * @package GllInfo
 */

// WASM Loader
export {
	initWasm,
	isWasmSupported,
	isWasmReady,
	getWasmError,
	parseGLL,
	parseGLLFile,
	parseGLLFromUrl,
} from './wasm-loader';

// GLL Context
export {
	GLLContext,
	GLLProvider,
	useGLL,
	useGLLLoader,
} from './gll-context';
