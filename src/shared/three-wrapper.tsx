/**
 * Three.js wrapper for Gutenberg blocks.
 *
 * Provides a React component that manages Three.js scene lifecycle,
 * WebGL context, and animation loop with proper cleanup.
 *
 * @package GllInfo
 */

import {
	useEffect,
	useRef,
	useState,
	useCallback,
	forwardRef,
	useImperativeHandle,
} from '@wordpress/element';
import * as THREE from 'three';
import './three.scss';

/**
 * Check if WebGL is supported in the browser.
 */
export function isWebGLSupported(): boolean {
	try {
		const canvas = document.createElement( 'canvas' );
		return !!(
			window.WebGLRenderingContext &&
			( canvas.getContext( 'webgl' ) ||
				canvas.getContext( 'experimental-webgl' ) )
		);
	} catch ( e ) {
		return false;
	}
}

/**
 * Check if WebGL2 is supported in the browser.
 */
export function isWebGL2Supported(): boolean {
	try {
		const canvas = document.createElement( 'canvas' );
		return !! ( window.WebGL2RenderingContext && canvas.getContext( 'webgl2' ) );
	} catch ( e ) {
		return false;
	}
}

/**
 * Scene configuration for the Three.js wrapper.
 */
export interface ThreeSceneConfig {
	/** Camera field of view (default: 45) */
	fov?: number;
	/** Camera near clipping plane (default: 0.1) */
	near?: number;
	/** Camera far clipping plane (default: 100) */
	far?: number;
	/** Initial camera position (default: [0, 0.6, 2.6]) */
	cameraPosition?: [ number, number, number ];
	/** Ambient light color (default: 0xffffff) */
	ambientLightColor?: number;
	/** Ambient light intensity (default: 0.65) */
	ambientLightIntensity?: number;
	/** Directional light color (default: 0xffffff) */
	directionalLightColor?: number;
	/** Directional light intensity (default: 0.85) */
	directionalLightIntensity?: number;
	/** Directional light position (default: [2.5, 2.5, 2]) */
	directionalLightPosition?: [ number, number, number ];
	/** Show reference wireframe sphere (default: false) */
	showReferenceSphere?: boolean;
	/** Reference sphere opacity (default: 0.28) */
	referenceSphereOpacity?: number;
	/** Show axes helper (default: false) */
	showAxesHelper?: boolean;
	/** Axes helper size (default: 1) */
	axesHelperSize?: number;
	/** Renderer clear color (default: undefined = transparent) */
	clearColor?: number;
	/** Renderer clear alpha (default: 0 = transparent) */
	clearAlpha?: number;
	/** Pixel ratio limit (default: 2) */
	maxPixelRatio?: number;
	/** Enable antialiasing (default: true) */
	antialias?: boolean;
	/** Enable auto-rotation (default: false) */
	autoRotate?: boolean;
	/** Auto-rotation speed in radians per frame (default: 0.0035) */
	autoRotateSpeed?: number;
}

/**
 * Ref handle exposed by the ThreeWrapper component.
 */
export interface ThreeWrapperRef {
	/** The Three.js scene */
	scene: THREE.Scene | null;
	/** The Three.js camera */
	camera: THREE.PerspectiveCamera | null;
	/** The Three.js renderer */
	renderer: THREE.WebGLRenderer | null;
	/** Request a render (useful for static scenes) */
	requestRender: () => void;
	/** Get container dimensions */
	getSize: () => { width: number; height: number };
}

/**
 * Props for the ThreeWrapper component.
 */
export interface ThreeWrapperProps {
	/** Scene configuration */
	config?: ThreeSceneConfig;
	/** Additional CSS class name */
	className?: string;
	/** Container height in pixels (default: 500) */
	height?: number;
	/** Callback fired when the scene is ready */
	onSceneReady?: (
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		renderer: THREE.WebGLRenderer
	) => void;
	/** Callback fired on each animation frame */
	onAnimate?: (
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		deltaTime: number
	) => void;
	/** Callback fired on container resize */
	onResize?: ( width: number, height: number ) => void;
	/** Custom fallback content when WebGL is not supported */
	fallback?: React.ReactNode;
	/** Whether to pause the animation loop (default: false) */
	paused?: boolean;
}

/**
 * Default scene configuration.
 */
const defaultConfig: Required< ThreeSceneConfig > = {
	fov: 45,
	near: 0.1,
	far: 100,
	cameraPosition: [ 0, 0.6, 2.6 ],
	ambientLightColor: 0xffffff,
	ambientLightIntensity: 0.65,
	directionalLightColor: 0xffffff,
	directionalLightIntensity: 0.85,
	directionalLightPosition: [ 2.5, 2.5, 2 ],
	showReferenceSphere: false,
	referenceSphereOpacity: 0.28,
	showAxesHelper: false,
	axesHelperSize: 1,
	clearColor: 0x000000,
	clearAlpha: 0,
	maxPixelRatio: 2,
	antialias: true,
	autoRotate: false,
	autoRotateSpeed: 0.0035,
};

/**
 * Three.js wrapper component.
 *
 * Provides a React-friendly wrapper around Three.js that handles:
 * - WebGL context lifecycle (mount/unmount)
 * - Animation loop with pause/resume
 * - Proper resource cleanup
 * - Responsive resizing
 * - WebGL support detection with fallback UI
 */
const ThreeWrapper = forwardRef< ThreeWrapperRef, ThreeWrapperProps >(
	function ThreeWrapper(
		{
			config = {},
			className = '',
			height = 500,
			onSceneReady,
			onAnimate,
			onResize,
			fallback,
			paused = false,
		},
		ref
	) {
		const containerRef = useRef< HTMLDivElement >( null );
		const canvasRef = useRef< HTMLCanvasElement >( null );
		const sceneRef = useRef< THREE.Scene | null >( null );
		const cameraRef = useRef< THREE.PerspectiveCamera | null >( null );
		const rendererRef = useRef< THREE.WebGLRenderer | null >( null );
		const animationIdRef = useRef< number | null >( null );
		const lastTimeRef = useRef< number >( 0 );
		const referenceSphereRef = useRef< THREE.Mesh | null >( null );
		const axesHelperRef = useRef< THREE.AxesHelper | null >( null );
		const isInitializedRef = useRef< boolean >( false );

		const [ webGLSupported, setWebGLSupported ] = useState< boolean | null >(
			null
		);

		// Merge config with defaults
		const mergedConfig: Required< ThreeSceneConfig > = {
			...defaultConfig,
			...config,
		};

		/**
		 * Request a render frame.
		 */
		const requestRender = useCallback( () => {
			if ( rendererRef.current && sceneRef.current && cameraRef.current ) {
				rendererRef.current.render(
					sceneRef.current,
					cameraRef.current
				);
			}
		}, [] );

		/**
		 * Get the container size.
		 */
		const getSize = useCallback( () => {
			if ( containerRef.current ) {
				return {
					width: containerRef.current.clientWidth,
					height: containerRef.current.clientHeight,
				};
			}
			return { width: 0, height: 0 };
		}, [] );

		// Expose ref handle
		useImperativeHandle(
			ref,
			() => ( {
				scene: sceneRef.current,
				camera: cameraRef.current,
				renderer: rendererRef.current,
				requestRender,
				getSize,
			} ),
			[ requestRender, getSize ]
		);

		/**
		 * Initialize the Three.js scene.
		 */
		useEffect( () => {
			// Check WebGL support
			const supported = isWebGLSupported();
			setWebGLSupported( supported );

			if ( ! supported || ! canvasRef.current || ! containerRef.current ) {
				return;
			}

			// Prevent double initialization
			if ( isInitializedRef.current ) {
				return;
			}
			isInitializedRef.current = true;

			const container = containerRef.current;
			const canvas = canvasRef.current;
			const width = container.clientWidth;
			const height_ = container.clientHeight;

			// Create scene
			const scene = new THREE.Scene();
			sceneRef.current = scene;

			// Create camera
			const camera = new THREE.PerspectiveCamera(
				mergedConfig.fov,
				width / height_,
				mergedConfig.near,
				mergedConfig.far
			);
			camera.position.set( ...mergedConfig.cameraPosition );
			camera.lookAt( 0, 0, 0 );
			cameraRef.current = camera;

			// Create renderer
			const renderer = new THREE.WebGLRenderer( {
				canvas,
				antialias: mergedConfig.antialias,
				alpha: true,
			} );
			renderer.setSize( width, height_ );
			renderer.setPixelRatio(
				Math.min(
					window.devicePixelRatio,
					mergedConfig.maxPixelRatio
				)
			);
			renderer.setClearColor(
				mergedConfig.clearColor,
				mergedConfig.clearAlpha
			);
			rendererRef.current = renderer;

			// Add ambient light
			const ambientLight = new THREE.AmbientLight(
				mergedConfig.ambientLightColor,
				mergedConfig.ambientLightIntensity
			);
			scene.add( ambientLight );

			// Add directional light
			const directionalLight = new THREE.DirectionalLight(
				mergedConfig.directionalLightColor,
				mergedConfig.directionalLightIntensity
			);
			directionalLight.position.set(
				...mergedConfig.directionalLightPosition
			);
			scene.add( directionalLight );

			// Add reference sphere if enabled
			if ( mergedConfig.showReferenceSphere ) {
				const sphereGeometry = new THREE.SphereGeometry( 1, 32, 32 );
				const sphereMaterial = new THREE.MeshBasicMaterial( {
					color: 0x888888,
					wireframe: true,
					transparent: true,
					opacity: mergedConfig.referenceSphereOpacity,
				} );
				const sphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
				scene.add( sphere );
				referenceSphereRef.current = sphere;
			}

			// Add axes helper if enabled
			if ( mergedConfig.showAxesHelper ) {
				const axesHelper = new THREE.AxesHelper(
					mergedConfig.axesHelperSize
				);
				scene.add( axesHelper );
				axesHelperRef.current = axesHelper;
			}

			// Notify that scene is ready
			if ( onSceneReady ) {
				onSceneReady( scene, camera, renderer );
			}

			// Cleanup function
			return () => {
				// Cancel animation frame
				if ( animationIdRef.current !== null ) {
					cancelAnimationFrame( animationIdRef.current );
					animationIdRef.current = null;
				}

				// Dispose reference sphere
				if ( referenceSphereRef.current ) {
					const sphereMesh = referenceSphereRef.current;
					sphereMesh.geometry.dispose();
					if ( sphereMesh.material instanceof THREE.Material ) {
						sphereMesh.material.dispose();
					}
					scene.remove( sphereMesh );
					referenceSphereRef.current = null;
				}

				// Dispose axes helper
				if ( axesHelperRef.current ) {
					scene.remove( axesHelperRef.current );
					axesHelperRef.current.dispose();
					axesHelperRef.current = null;
				}

				// Dispose renderer
				if ( rendererRef.current ) {
					rendererRef.current.dispose();
					rendererRef.current = null;
				}

				// Clear scene references
				sceneRef.current = null;
				cameraRef.current = null;
				isInitializedRef.current = false;
			};
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [] ); // Initialize only once on mount

		/**
		 * Animation loop effect.
		 */
		useEffect( () => {
			if (
				! sceneRef.current ||
				! cameraRef.current ||
				! rendererRef.current
			) {
				return;
			}

			const scene = sceneRef.current;
			const camera = cameraRef.current;
			const renderer = rendererRef.current;

			const animate = ( time: number ) => {
				if ( paused ) {
					animationIdRef.current = requestAnimationFrame( animate );
					return;
				}

				const deltaTime = ( time - lastTimeRef.current ) / 1000;
				lastTimeRef.current = time;

				// Auto-rotation
				if ( mergedConfig.autoRotate && scene.children.length > 0 ) {
					scene.rotation.y += mergedConfig.autoRotateSpeed;
				}

				// Call onAnimate callback
				if ( onAnimate ) {
					onAnimate( scene, camera, deltaTime );
				}

				// Render scene
				renderer.render( scene, camera );

				animationIdRef.current = requestAnimationFrame( animate );
			};

			// Start animation loop
			lastTimeRef.current = performance.now();
			animationIdRef.current = requestAnimationFrame( animate );

			return () => {
				if ( animationIdRef.current !== null ) {
					cancelAnimationFrame( animationIdRef.current );
					animationIdRef.current = null;
				}
			};
		}, [ paused, mergedConfig.autoRotate, mergedConfig.autoRotateSpeed, onAnimate ] );

		/**
		 * Handle container resize.
		 */
		useEffect( () => {
			if (
				! containerRef.current ||
				typeof ResizeObserver === 'undefined'
			) {
				return undefined;
			}

			const container = containerRef.current;

			const handleResize = () => {
				if (
					! cameraRef.current ||
					! rendererRef.current ||
					! container
				) {
					return;
				}

				const width = container.clientWidth;
				const height_ = container.clientHeight;

				// Update camera aspect ratio
				cameraRef.current.aspect = width / height_;
				cameraRef.current.updateProjectionMatrix();

				// Update renderer size
				rendererRef.current.setSize( width, height_ );

				// Notify resize callback
				if ( onResize ) {
					onResize( width, height_ );
				}
			};

			const observer = new ResizeObserver( handleResize );
			observer.observe( container );

			return () => observer.disconnect();
		}, [ onResize ] );

		/**
		 * Update config-dependent properties.
		 */
		useEffect( () => {
			// Update reference sphere visibility
			if ( referenceSphereRef.current ) {
				referenceSphereRef.current.visible =
					mergedConfig.showReferenceSphere;
			}

			// Update axes helper visibility
			if ( axesHelperRef.current ) {
				axesHelperRef.current.visible = mergedConfig.showAxesHelper;
			}
		}, [ mergedConfig.showReferenceSphere, mergedConfig.showAxesHelper ] );

		// Render fallback if WebGL is not supported
		if ( webGLSupported === false ) {
			return (
				<div
					className={ `gll-three-wrapper gll-three-wrapper--no-webgl ${ className }` }
					style={ { minHeight: height } }
				>
					{ fallback || (
						<div className="gll-three-fallback">
							<div className="gll-three-fallback__icon">
								<svg
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
								>
									<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
									<line x1="12" y1="9" x2="12" y2="13" />
									<line x1="12" y1="17" x2="12.01" y2="17" />
								</svg>
							</div>
							<div className="gll-three-fallback__title">
								WebGL Not Available
							</div>
							<div className="gll-three-fallback__message">
								Your browser does not support WebGL, which is
								required for 3D visualization. Please try a
								modern browser like Chrome, Firefox, or Edge.
							</div>
						</div>
					) }
				</div>
			);
		}

		// Render loading state while checking WebGL support
		if ( webGLSupported === null ) {
			return (
				<div
					className={ `gll-three-wrapper gll-three-wrapper--loading ${ className }` }
					style={ { minHeight: height } }
				>
					<div className="gll-three-loading">
						<div className="gll-three-loading__spinner" />
						<div className="gll-three-loading__text">
							Initializing 3D view...
						</div>
					</div>
				</div>
			);
		}

		return (
			<div
				ref={ containerRef }
				className={ `gll-three-wrapper ${ className }` }
				style={ { minHeight: height } }
			>
				<canvas ref={ canvasRef } className="gll-three-canvas" />
			</div>
		);
	}
);

export default ThreeWrapper;
