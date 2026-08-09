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

// Cacheable display subset
export {
	SUBSET_VERSION,
	buildDisplaySubset,
	geometryCounts,
	hydrateSubsetLabels,
	sourceResponseCount,
} from './gll-subset';

// Cached-subset REST client, and the editor hook that keeps it warm
export {
	deleteCachedSubset,
	fetchCachedSubset,
	publishSubset,
} from './gll-cache';
export { useCachePublisher } from './use-cache-publisher';
export { default as CacheRebuildControl } from './cache-rebuild-control';

// GLL Context
export { GLLContext, GLLProvider, useGLL, useGLLLoader } from './gll-context';

// Theme token resolution (CSS custom properties -> canvas colors)
export {
	resolveTheme,
	parseColor,
	relativeLuminance,
	withAlpha,
	THEME_FALLBACKS,
} from './resolve-theme';
export type { GllTheme } from './resolve-theme';

// Chart.js theming
export { applyChartTheme, applyChartThemeFrom } from './chart-theme';

// Appearance attribute (auto | plain | transparent)
export {
	default as AppearanceControl,
	appearanceClass,
	APPEARANCE_VALUES,
	DEFAULT_APPEARANCE,
} from './appearance-control';
export type { GllAppearance } from './appearance-control';

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
	sourcePlacementOrientation,
} from './geometry-utils';
export type {
	GeometryAngleUnits,
	GeometryBounds,
	GeometryEulerHvr,
	GeometryMarker,
	GeometryMarkerVisibility,
	GeometryQuaternion,
	GeometrySourceOrientation,
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
