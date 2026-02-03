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
export { GLLContext, GLLProvider, useGLL, useGLLLoader } from './gll-context';

// Chart.js wrapper
export { default as ChartWrapper } from './chart-wrapper';

// Charting utilities
export {
	buildFrequencyPoints,
	buildLogFrequencyScale,
	getPhaseSeries,
	unwrapPhase,
	wrapPhase,
	computeGroupDelayMs,
	buildLogTicks,
	formatFrequency,
} from './charting-utils';

// Polar plot utilities
export {
	computePolarSlices,
	computeLevelRange,
	getBalloonGrid,
	buildPolarAngles,
	formatPolarLabel,
	buildLogFrequencies,
} from './polar-utils';

// Polar compass Chart.js plugin
export { default as polarCompassPlugin } from './polar-compass-plugin';

// Three.js wrapper
export {
	default as ThreeWrapper,
	isWebGLSupported,
	isWebGL2Supported,
} from './three-wrapper';
export type {
	ThreeSceneConfig,
	ThreeWrapperRef,
	ThreeWrapperProps,
} from './three-wrapper';

// Geometry viewer
export { default as GeometryViewer } from './geometry-viewer';
export type { GeometryViewerRef, GeometryViewerProps } from './geometry-viewer';

// Geometry utilities
export {
	buildCaseGeometryData,
	resolveGeometryVertex,
} from './geometry-utils';
export type { GeometryBounds } from './geometry-utils';
export {
	getCaseGeometryVertices,
	resolveGeometryPoint,
	getReferencePoint,
	toViewPoint,
	computeBounds,
	computeScaleFactor,
} from './geometry-utils';

// Balloon 3D utilities
export {
	SYMMETRY,
	MISSING_DATA_COLOR,
	MISSING_LEVEL_MARKER,
	getResponseWithSymmetry,
	computeGlobalMaxLevel,
	clearGlobalMaxCache,
	buildFullSphereLevels,
	sphericalToCartesian,
	levelToColor,
	levelToColorWithMissing,
	buildBalloonGeometryData,
} from './balloon-utils';
export type {
	BalloonGridInfo,
	BalloonBuildOptions,
	BalloonGeometryData,
} from './balloon-utils';
