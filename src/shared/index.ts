/**
 * Shared GLL Info exports.
 *
 * @package
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

// Parser output normalization
export { normalizeGllData } from './gll-normalize';

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
	applyDelayToPhase,
	buildLogTicks,
	buildSourceResponseSeries,
	buildSourceResponseChartConfig,
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
	frequenciesMatch,
	computeResponseAngles,
	responseIndexToBalloonIndices,
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

// Manual orbit controls (fallback for OrbitControls addon)
export { attachManualOrbitControls } from './manual-orbit-controls';
export type {
	ManualOrbitControls,
	ManualOrbitControlsOptions,
} from './manual-orbit-controls';

// Geometry utilities
export {
	buildCaseGeometryData,
	resolveGeometryVertex,
	buildGeometryMarkers,
	transformGeometryPoint,
	eulerHvrToQuaternion,
} from './geometry-utils';
export type {
	GeometryBounds,
	GeometryEulerHvr,
	GeometryMarker,
	GeometryMarkerVisibility,
	GeometryQuaternion,
} from './geometry-utils';
export {
	getCaseGeometryVertices,
	resolveGeometryPoint,
	getReferencePoint,
	getCenterOfMassPoint,
	getNextPivotPoint,
	getEulerHvr,
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
