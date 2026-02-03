/**
 * Geometry Viewer Block - Frontend Script
 *
 * @package GllInfo
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { buildCaseGeometryData } from '../shared/geometry-utils';
import { isWebGLSupported } from '../shared/three-wrapper';

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
	const canvasHeight = parseInt( block.dataset.canvasHeight || '500', 10 );
	const geometryIndex = parseInt( block.dataset.geometryIndex || '0', 10 );
	const showFaces = block.dataset.showFaces !== 'false';
	const showEdges = block.dataset.showEdges !== 'false';

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
		const geometries = data?.Database?.CaseGeometries || [];
		const geometry = geometries[ Math.min( geometryIndex, geometries.length - 1 ) ];
		const geometryData = geometry ? buildCaseGeometryData( geometry ) : null;

		if ( ! geometryData ) {
			showError( block, 'No geometry data available in this file.' );
			return;
		}

		const threeContainer = document.createElement( 'div' );
		threeContainer.className = 'gll-three-container';
		threeContainer.style.minHeight = canvasHeight + 'px';
		canvasContainer.appendChild( threeContainer );

		initThreeScene( threeContainer, {
			canvasHeight,
			autoRotate,
			showFaces,
			showEdges,
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

	const geometryGroup = buildGeometryGroup(
		options.geometryData,
		options.showFaces,
		options.showEdges
	);
	if ( geometryGroup ) {
		scene.add( geometryGroup );
	}

	let controls: OrbitControls | null = null;
	let fallbackCleanup: ( () => void ) | null = null;
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
		console.warn( 'OrbitControls unavailable, using fallback controls.' );
		fallbackCleanup = attachFallbackControls( renderer.domElement, scene );
	}

	const resizeObserver = new ResizeObserver( () => {
		const newWidth = container.clientWidth;
		camera.aspect = newWidth / height;
		camera.updateProjectionMatrix();
		renderer.setSize( newWidth, height );
	} );
	resizeObserver.observe( container );

	let animationId: number;
	const animate = () => {
		animationId = requestAnimationFrame( animate );

		if ( controls ) {
			controls.autoRotate = options.autoRotate;
			controls.update();
		} else if ( options.autoRotate ) {
			scene.rotation.y += 0.0035;
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
		if ( fallbackCleanup ) {
			fallbackCleanup();
			fallbackCleanup = null;
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

function disposeMaterial( material: THREE.Material | THREE.Material[] ) {
	if ( Array.isArray( material ) ) {
		material.forEach( ( item ) => item.dispose() );
		return;
	}
	material.dispose();
}

function buildGeometryGroup(
	geometryData: ReturnType< typeof buildCaseGeometryData >,
	showFaces: boolean,
	showEdges: boolean
) {
	if ( ! geometryData ) {
		return null;
	}

	const group = new THREE.Group();

	if ( showFaces && geometryData.indices.length > 0 ) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute( geometryData.positions, 3 )
		);
		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute( geometryData.colors, 3 )
		);
		geometry.setIndex( geometryData.indices );
		geometry.computeVertexNormals();

		const material = new THREE.MeshStandardMaterial( {
			vertexColors: true,
			flatShading: true,
			metalness: 0.05,
			roughness: 0.75,
			side: THREE.DoubleSide,
		} );

		const mesh = new THREE.Mesh( geometry, material );
		group.add( mesh );
	}

	if ( showEdges && geometryData.edgePositions.length > 0 ) {
		const edgeGeometry = new THREE.BufferGeometry();
		edgeGeometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute( geometryData.edgePositions, 3 )
		);
		edgeGeometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute( geometryData.edgeColors, 3 )
		);

		const edgeMaterial = new THREE.LineBasicMaterial( {
			vertexColors: true,
			transparent: true,
			opacity: 0.9,
		} );

		const edges = new THREE.LineSegments( edgeGeometry, edgeMaterial );
		group.add( edges );
	}

	return group;
}

function disposeSceneObject( object: THREE.Object3D ) {
	object.traverse( ( child ) => {
		if ( child instanceof THREE.Mesh ) {
			child.geometry.dispose();
			disposeMaterial( child.material );
		}
		if ( child instanceof THREE.LineSegments ) {
			child.geometry.dispose();
			disposeMaterial( child.material );
		}
	} );
	if ( object.parent ) {
		object.parent.remove( object );
	}
}

function attachFallbackControls(
	element: HTMLElement,
	scene: THREE.Scene
): () => void {
	let isDragging = false;
	let lastX = 0;
	let lastY = 0;

	const onPointerDown = ( event: PointerEvent ) => {
		isDragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		element.setPointerCapture( event.pointerId );
	};

	const onPointerMove = ( event: PointerEvent ) => {
		if ( ! isDragging ) {
			return;
		}
		const deltaX = event.clientX - lastX;
		const deltaY = event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;

		scene.rotation.y += deltaX * 0.005;
		scene.rotation.x += deltaY * 0.005;
	};

	const onPointerUp = ( event: PointerEvent ) => {
		isDragging = false;
		element.releasePointerCapture( event.pointerId );
	};

	element.addEventListener( 'pointerdown', onPointerDown );
	element.addEventListener( 'pointermove', onPointerMove );
	element.addEventListener( 'pointerup', onPointerUp );
	element.addEventListener( 'pointerleave', onPointerUp );

	return () => {
		element.removeEventListener( 'pointerdown', onPointerDown );
		element.removeEventListener( 'pointermove', onPointerMove );
		element.removeEventListener( 'pointerup', onPointerUp );
		element.removeEventListener( 'pointerleave', onPointerUp );
	};
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
				<strong>Error:</strong> ${ message }
			</div>
		`;
	}
}
