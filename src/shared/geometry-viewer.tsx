/**
 * Geometry viewer scene setup for Three.js.
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
import { isWebGLSupported } from './three-wrapper';
import './three.scss';

export interface GeometryViewerRef {
	scene: THREE.Scene | null;
	camera: THREE.PerspectiveCamera | null;
	renderer: THREE.WebGLRenderer | null;
	gridHelper: THREE.GridHelper | null;
	axesHelper: THREE.AxesHelper | null;
	requestRender: () => void;
	getSize: () => { width: number; height: number };
}

export interface GeometryViewerProps {
	className?: string;
	height?: number;
	onSceneReady?: (
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		renderer: THREE.WebGLRenderer
	) => void;
	onAnimate?: (
		scene: THREE.Scene,
		camera: THREE.PerspectiveCamera,
		deltaTime: number
	) => void;
	onResize?: ( width: number, height: number ) => void;
	fallback?: React.ReactNode;
}

const GeometryViewer = forwardRef< GeometryViewerRef, GeometryViewerProps >(
	function GeometryViewer(
		{ className = '', height = 500, onSceneReady, onAnimate, onResize, fallback },
		ref
	) {
		const containerRef = useRef< HTMLDivElement >( null );
		const canvasRef = useRef< HTMLCanvasElement >( null );
		const sceneRef = useRef< THREE.Scene | null >( null );
		const cameraRef = useRef< THREE.PerspectiveCamera | null >( null );
		const rendererRef = useRef< THREE.WebGLRenderer | null >( null );
		const gridHelperRef = useRef< THREE.GridHelper | null >( null );
		const axesHelperRef = useRef< THREE.AxesHelper | null >( null );
		const animationIdRef = useRef< number | null >( null );
		const lastTimeRef = useRef< number >( 0 );

		const [ webGLSupported, setWebGLSupported ] = useState< boolean | null >(
			null
		);

		const requestRender = useCallback( () => {
			if ( rendererRef.current && sceneRef.current && cameraRef.current ) {
				rendererRef.current.render(
					sceneRef.current,
					cameraRef.current
				);
			}
		}, [] );

		const getSize = useCallback( () => {
			if ( containerRef.current ) {
				return {
					width: containerRef.current.clientWidth,
					height: containerRef.current.clientHeight,
				};
			}
			return { width: 0, height: 0 };
		}, [] );

		useImperativeHandle(
			ref,
			() => ( {
				scene: sceneRef.current,
				camera: cameraRef.current,
				renderer: rendererRef.current,
				gridHelper: gridHelperRef.current,
				axesHelper: axesHelperRef.current,
				requestRender,
				getSize,
			} ),
			[ requestRender, getSize ]
		);

		useEffect( () => {
			const supported = isWebGLSupported();
			setWebGLSupported( supported );

			if ( ! supported || ! containerRef.current || ! canvasRef.current ) {
				return;
			}

			if ( sceneRef.current ) {
				return;
			}

			const container = containerRef.current;
			const canvas = canvasRef.current;
			const width = container.clientWidth;
			const height_ = container.clientHeight;

			const scene = new THREE.Scene();
			sceneRef.current = scene;

			const camera = new THREE.PerspectiveCamera( 42, width / height_, 0.1, 100 );
			camera.position.set( 0, 0.4, 2.2 );
			camera.lookAt( 0, 0, 0 );
			cameraRef.current = camera;

			const renderer = new THREE.WebGLRenderer( {
				canvas,
				antialias: true,
				alpha: true,
			} );
			renderer.setSize( width, height_ );
			renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
			renderer.setClearColor( 0x000000, 0 );
			rendererRef.current = renderer;

			const ambientLight = new THREE.AmbientLight( 0xffffff, 0.7 );
			scene.add( ambientLight );

			const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.85 );
			directionalLight.position.set( 2.5, 2.5, 2 );
			scene.add( directionalLight );

			const gridHelper = new THREE.GridHelper( 2, 12 );
			scene.add( gridHelper );
			gridHelperRef.current = gridHelper;

			const axesHelper = new THREE.AxesHelper( 0.8 );
			if ( Array.isArray( axesHelper.material ) ) {
				axesHelper.material.forEach( ( material ) => {
					material.transparent = true;
					material.opacity = 0.5;
				} );
			} else {
				axesHelper.material.transparent = true;
				axesHelper.material.opacity = 0.5;
			}
			scene.add( axesHelper );
			axesHelperRef.current = axesHelper;

			if ( onSceneReady ) {
				onSceneReady( scene, camera, renderer );
			}

			return () => {
				if ( animationIdRef.current !== null ) {
					cancelAnimationFrame( animationIdRef.current );
					animationIdRef.current = null;
				}

				if ( gridHelperRef.current ) {
					scene.remove( gridHelperRef.current );
					gridHelperRef.current.geometry.dispose();
					disposeMaterial( gridHelperRef.current.material );
					gridHelperRef.current = null;
				}

				if ( axesHelperRef.current ) {
					scene.remove( axesHelperRef.current );
					axesHelperRef.current.geometry.dispose();
					disposeMaterial( axesHelperRef.current.material );
					axesHelperRef.current = null;
				}

				if ( rendererRef.current ) {
					rendererRef.current.dispose();
					rendererRef.current = null;
				}

				sceneRef.current = null;
				cameraRef.current = null;
			};
		}, [ onSceneReady ] );

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
				const deltaTime = ( time - lastTimeRef.current ) / 1000;
				lastTimeRef.current = time;

				if ( onAnimate ) {
					onAnimate( scene, camera, deltaTime );
				}

				renderer.render( scene, camera );
				animationIdRef.current = requestAnimationFrame( animate );
			};

			lastTimeRef.current = performance.now();
			animationIdRef.current = requestAnimationFrame( animate );

			return () => {
				if ( animationIdRef.current !== null ) {
					cancelAnimationFrame( animationIdRef.current );
					animationIdRef.current = null;
				}
			};
		}, [ onAnimate ] );

		useEffect( () => {
			if (
				! containerRef.current ||
				typeof ResizeObserver === 'undefined'
			) {
				return undefined;
			}

			const container = containerRef.current;
			const handleResize = () => {
				if ( ! cameraRef.current || ! rendererRef.current ) {
					return;
				}

				const width = container.clientWidth;
				const height_ = container.clientHeight;

				cameraRef.current.aspect = width / height_;
				cameraRef.current.updateProjectionMatrix();
				rendererRef.current.setSize( width, height_ );

				if ( onResize ) {
					onResize( width, height_ );
				}
			};

			const observer = new ResizeObserver( handleResize );
			observer.observe( container );

			return () => observer.disconnect();
		}, [ onResize ] );

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

function disposeMaterial( material: THREE.Material | THREE.Material[] ) {
	if ( Array.isArray( material ) ) {
		material.forEach( ( item ) => item.dispose() );
		return;
	}
	material.dispose();
}

export default GeometryViewer;
