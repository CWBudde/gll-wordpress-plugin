/**
 * Geometry Viewer Block - Frontend Script
 *
 * @package
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { escapeHtml } from '../shared/escape-html';
import {
	buildCaseGeometryData,
	buildGeometryMarkers,
	getCaseGeometryVertices,
	getReferencePoint,
	toViewPoint,
	computeBounds,
	computeScaleFactor,
} from '../shared/geometry-utils';
import { isWebGLSupported } from '../shared/three-wrapper';
import {
	attachManualOrbitControls,
	type ManualOrbitControls,
} from '../shared/manual-orbit-controls';
import { applyHelperTheme } from './helper-theme';
import { buildGeometryGroup, disposeSceneObject } from './scene-builder';

document.addEventListener( 'DOMContentLoaded', () => {
	const blocks = document.querySelectorAll( '.gll-geometry-block' );

	if ( blocks.length === 0 ) {
		return;
	}

	if ( ! isWebGLSupported() ) {
		blocks.forEach( ( block ) => {
			showError(
				block as HTMLElement,
				'WebGL is not supported in your browser. Please use a modern browser to view 3D content.'
			);
		} );
		return;
	}

	ensureWasmReady()
		.then( () => {
			blocks.forEach( ( block ) => {
				initializeBlock( block as HTMLElement );
			} );
		} )
		.catch( ( error ) => {
			console.error( 'Failed to initialize WASM:', error );
			blocks.forEach( ( block ) => {
				showError(
					block as HTMLElement,
					'Failed to initialize WASM parser'
				);
			} );
		} );
} );

async function initializeBlock( block: HTMLElement ) {
	const fileUrl = block.dataset.fileUrl;
	if ( ! fileUrl ) {
		showError( block, 'No file URL specified' );
		return;
	}

	const canvasContainer = block.querySelector( '.gll-geometry-canvas' );
	if ( ! canvasContainer ) {
		return;
	}

	const autoRotate = block.dataset.autoRotate === 'true';
	const geometryIndex = parseInt( block.dataset.geometryIndex || '0', 10 );
	const showFaces = block.dataset.showFaces !== 'false';
	const showEdges = block.dataset.showEdges !== 'false';
	const showMarkers = {
		ref: block.dataset.showMarkersRef !== 'false',
		com: block.dataset.showMarkersCom !== 'false',
		pivot: block.dataset.showMarkersPivot === 'true',
	};
	const centerReference = block.dataset.centerReference === 'true';

	const loadingEl = block.querySelector( '.gll-geometry-loading' );
	if ( loadingEl ) {
		( loadingEl as HTMLElement ).style.display = 'none';
	}

	try {
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error( `Failed to fetch file: ${ response.statusText }` );
		}

		const arrayBuffer = await response.arrayBuffer();
		const data = await parseGLL( arrayBuffer );
		setBlockHeaderLabel( block, data );
		const geometries = data?.Database?.CaseGeometries || [];
		const geometry =
			geometries[ Math.min( geometryIndex, geometries.length - 1 ) ];
		let geometryData = null;
		let markerData: ReturnType< typeof buildGeometryMarkers > = [];
		if ( geometry ) {
			const vertices = getCaseGeometryVertices( geometry );
			if ( vertices.length > 0 ) {
				const viewVertices = vertices.map( toViewPoint );
				const bounds = computeBounds( viewVertices );
				const reference = centerReference
					? getReferencePoint( geometry )
					: null;
				const center = reference
					? toViewPoint( reference )
					: bounds.center;
				const scale = computeScaleFactor( bounds, 1.2 );
				geometryData = buildCaseGeometryData( geometry, {
					transform: ( vertex ) => {
						const viewPoint = toViewPoint( vertex );
						return {
							x: ( viewPoint.x - center.x ) * scale,
							y: ( viewPoint.y - center.y ) * scale,
							z: ( viewPoint.z - center.z ) * scale,
						};
					},
				} );
				markerData = buildGeometryMarkers( geometry, {
					center,
					scale,
					visibility: showMarkers,
				} );
			}
		}

		if ( ! geometryData ) {
			showError( block, 'No geometry data available in this file.' );
			return;
		}

		const canvasHeight = parseInt(
			block.dataset.canvasHeight || '500',
			10
		);
		const threeContainer = document.createElement( 'div' );
		threeContainer.className = 'gll-three-container';
		threeContainer.style.minHeight = canvasHeight + 'px';
		canvasContainer.appendChild( threeContainer );

		initThreeScene( threeContainer, {
			canvasHeight,
			autoRotate,
			showFaces,
			showEdges,
			markerData,
			geometryData,
		} );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, ( error as Error ).message );
	}
}

function initThreeScene(
	container: HTMLElement,
	options: {
		canvasHeight: number;
		autoRotate: boolean;
		showFaces: boolean;
		showEdges: boolean;
		markerData: ReturnType< typeof buildGeometryMarkers >;
		geometryData: ReturnType< typeof buildCaseGeometryData >;
	}
) {
	const width = container.clientWidth;
	const height = options.canvasHeight;

	const scene = new THREE.Scene();

	const camera = new THREE.PerspectiveCamera( 42, width / height, 0.1, 100 );
	camera.position.set( 0, 0.4, 2.2 );
	camera.lookAt( 0, 0, 0 );

	const renderer = new THREE.WebGLRenderer( {
		antialias: true,
		alpha: true,
	} );
	renderer.setSize( width, height );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setClearColor( 0x000000, 0 );
	container.appendChild( renderer.domElement );

	const ambientLight = new THREE.AmbientLight( 0xffffff, 0.7 );
	scene.add( ambientLight );

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.85 );
	directionalLight.position.set( 2.5, 2.5, 2 );
	scene.add( directionalLight );

	const gridHelper = new THREE.GridHelper( 2, 12 );
	scene.add( gridHelper );

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

	// Helpers are chrome, so they follow the block's theme tokens. The lights
	// stay white and the clear color stays transparent.
	applyHelperTheme( scene, container );

	const geometryGroup = buildGeometryGroup( {
		geometryData: options.geometryData,
		markers: options.markerData,
		showFaces: options.showFaces,
		showEdges: options.showEdges,
	} );
	if ( geometryGroup ) {
		scene.add( geometryGroup );
	}

	let controls: OrbitControls | null = null;
	let fallbackControls: ManualOrbitControls | null = null;
	try {
		controls = new OrbitControls( camera, renderer.domElement );
		controls.enableDamping = true;
		controls.dampingFactor = 0.08;
		controls.screenSpacePanning = true;
		controls.enableZoom = true;
		controls.enablePan = true;
		controls.enableRotate = true;
		controls.enableKeys = true;
		controls.minDistance = 0.25;
		controls.maxDistance = 25;
		controls.rotateSpeed = 0.6;
		controls.panSpeed = 0.9;
		controls.autoRotate = options.autoRotate;
		controls.mouseButtons = {
			LEFT: THREE.MOUSE.ROTATE,
			MIDDLE: THREE.MOUSE.DOLLY,
			RIGHT: THREE.MOUSE.PAN,
		};
	} catch ( error ) {
		console.warn(
			'OrbitControls unavailable, using manual orbit fallback.'
		);
		fallbackControls = attachManualOrbitControls(
			camera,
			renderer.domElement,
			{
				minDistance: 0.25,
				maxDistance: 25,
				rotateSpeed: 0.6,
				panSpeed: 0.9,
				dampingFactor: 0.08,
				autoRotate: options.autoRotate,
			}
		);
	}

	const resizeObserver = new ResizeObserver( () => {
		const newWidth = container.clientWidth;
		camera.aspect = newWidth / height;
		camera.updateProjectionMatrix();
		renderer.setSize( newWidth, height );
		// A resize is the cheapest signal we get that the surrounding styling
		// may have changed, so re-resolve the tokens here.
		applyHelperTheme( scene, container );
	} );
	resizeObserver.observe( container );

	let animationId: number;
	let lastFrameTime = performance.now();
	const animate = () => {
		animationId = requestAnimationFrame( animate );

		const now = performance.now();
		const deltaTime = ( now - lastFrameTime ) / 1000;
		lastFrameTime = now;

		if ( controls ) {
			controls.autoRotate = options.autoRotate;
			controls.update();
		} else if ( fallbackControls ) {
			fallbackControls.autoRotate = options.autoRotate;
			fallbackControls.update( deltaTime );
		}

		renderer.render( scene, camera );
	};
	animate();

	window.addEventListener( 'beforeunload', () => {
		cancelAnimationFrame( animationId );
		resizeObserver.disconnect();
		if ( controls ) {
			controls.dispose();
			controls = null;
		}
		if ( fallbackControls ) {
			fallbackControls.dispose();
			fallbackControls = null;
		}
		if ( geometryGroup ) {
			disposeSceneObject( geometryGroup );
		}
		renderer.dispose();
		gridHelper.geometry.dispose();
		disposeMaterial( gridHelper.material );
		axesHelper.geometry.dispose();
		disposeMaterial( axesHelper.material );
	} );
}

/**
 * Dispose a material, or every material of a multi-material object.
 *
 * Kept local: the geometry group is disposed by `disposeSceneObject`, but the
 * grid and axes helpers this file creates itself are not part of that group and
 * still need tearing down by hand.
 *
 * @param material Material or material array.
 */
function disposeMaterial( material: THREE.Material | THREE.Material[] ) {
	if ( Array.isArray( material ) ) {
		material.forEach( ( item ) => item.dispose() );
		return;
	}
	material.dispose();
}

function showError( block: HTMLElement, message: string ) {
	const loadingEl = block.querySelector( '.gll-geometry-loading' );
	if ( loadingEl ) {
		( loadingEl as HTMLElement ).style.display = 'none';
	}

	const canvasContainer = block.querySelector( '.gll-geometry-canvas' );
	if ( canvasContainer ) {
		canvasContainer.innerHTML = `
			<div class="gll-error" style="padding: 20px; color: #d63638; border: 1px solid #d63638; border-radius: 4px; background: #fff8f8;">
				<strong>Error:</strong> ${ escapeHtml( message ) }
			</div>
		`;
	}
}
