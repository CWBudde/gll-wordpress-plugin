/**
 * 3D Balloon Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Three.js rendering on the frontend.
 *
 * @package GllInfo
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ensureWasmReady, parseGLLFile } from '../shared/wasm-loader';
import { formatFrequency } from '../shared/charting-utils';
import { isWebGLSupported } from '../shared/three-wrapper';
import {
	getBalloonGrid,
	buildBalloonGeometryData,
	computeGlobalMaxLevel,
} from '../shared/balloon-utils';
import type { BalloonGridInfo } from '../shared/balloon-utils';

interface BlockOptions {
	fileName: string;
	sourceIndex: number;
	frequencyIndex: number;
	dbRange: number;
	scale: number;
	wireframe: boolean;
	autoRotate: boolean;
	showReferenceSphere: boolean;
	showAxesHelper: boolean;
	canvasHeight: number;
}

/**
 * Initialize all 3D balloon blocks on the page.
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll( '.gll-balloon-3d-block' );

	if ( blocks.length === 0 ) {
		return;
	}

	// Check WebGL support
	if ( ! isWebGLSupported() ) {
		blocks.forEach( ( block ) => {
			showError( block as HTMLElement, 'WebGL is not supported in your browser. Please use a modern browser to view 3D content.' );
		} );
		return;
	}

	try {
		await ensureWasmReady();
	} catch ( error ) {
		console.error( 'Failed to initialize WASM:', error );
		blocks.forEach( ( block ) => {
			showError( block as HTMLElement, 'Failed to initialize WASM parser' );
		} );
		return;
	}

	blocks.forEach( ( block ) => {
		initializeBlock( block as HTMLElement );
	} );
} );

/**
 * Initialize a single 3D balloon block.
 */
async function initializeBlock( block: HTMLElement ) {
	const fileUrl = block.dataset.fileUrl;
	const fileName = block.dataset.fileName || 'GLL File';
	const sourceIndex = parseInt( block.dataset.sourceIndex || '0', 10 );
	const frequencyIndex = parseInt( block.dataset.frequencyIndex || '0', 10 );
	const dbRange = parseInt( block.dataset.dbRange || '40', 10 );
	const scale = parseFloat( block.dataset.scale || '1.0' );
	const wireframe = block.dataset.wireframe === 'true';
	const autoRotate = block.dataset.autoRotate === 'true';
	const showReferenceSphere = block.dataset.showReferenceSphere !== 'false';
	const showAxesHelper = block.dataset.showAxesHelper !== 'false';
	const canvasHeight = parseInt( block.dataset.canvasHeight || '500', 10 );

	if ( ! fileUrl ) {
		showError( block, 'No file URL specified' );
		return;
	}

	try {
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error( `Failed to fetch file: ${ response.statusText }` );
		}

		const arrayBuffer = await response.arrayBuffer();
		const uint8Array = new Uint8Array( arrayBuffer );
		const data = await parseGLLFile( uint8Array );

		const loadingEl = block.querySelector( '.gll-balloon-3d-loading' );
		if ( loadingEl ) {
			( loadingEl as HTMLElement ).style.display = 'none';
		}

		render3DBalloon( block, data, {
			fileName,
			sourceIndex,
			frequencyIndex,
			dbRange,
			scale,
			wireframe,
			autoRotate,
			showReferenceSphere,
			showAxesHelper,
			canvasHeight,
		} );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, ( error as Error ).message );
	}
}

/**
 * Render 3D balloon visualization.
 */
function render3DBalloon( block: HTMLElement, data: any, options: BlockOptions ) {
	const canvasContainer = block.querySelector( '.gll-balloon-3d-canvas' );
	if ( ! canvasContainer ) {
		return;
	}

	// Get sources with responses
	const sources = ( data?.Database?.SourceDefinitions || [] )
		.filter( ( s: any ) => ( s.Responses || [] ).length > 0 );

	const source = sources[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, 'Source not found' );
		return;
	}

	const frequencies = source.Responses?.[ 0 ]?.Frequencies || [];
	if ( frequencies.length === 0 ) {
		showError( block, 'No frequency data available' );
		return;
	}

	const balloonGrid = getBalloonGrid( source ) as BalloonGridInfo | null;
	if ( ! balloonGrid ) {
		showError( block, 'No directivity data available for this source' );
		return;
	}

	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );
	const frequency = frequencies[ freqIdx ];

	// Get global max level (cached)
	const globalMax = computeGlobalMaxLevel( source );
	const displayMax = globalMax;
	const displayMin = globalMax - options.dbRange;
	const midLevel = ( displayMin + displayMax ) / 2;

	// Build metadata HTML
	const badges = [];
	badges.push( `<span class="gll-meta-badge"><strong>Frequency:</strong> ${ formatFrequency( frequency ) }</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Display Range:</strong> ${ displayMin.toFixed( 1 ) } &ndash; ${ displayMax.toFixed( 1 ) } dB</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Grid:</strong> ${ balloonGrid.fullMeridianCount } &times; ${ balloonGrid.fullParallelCount }</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Resolution:</strong> ${ balloonGrid.meridianStep }\u00b0 \u00d7 ${ balloonGrid.parallelStep }\u00b0</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Symmetry:</strong> ${ balloonGrid.symmetryName }</span>` );
	if ( options.wireframe ) {
		badges.push( '<span class="gll-meta-badge gll-meta-badge-highlight">Wireframe</span>' );
	}
	if ( options.autoRotate ) {
		badges.push( '<span class="gll-meta-badge gll-meta-badge-highlight">Auto-Rotate</span>' );
	}
	const sourceLabel = source.Definition?.Label || source.Label || '';
	if ( sourceLabel ) {
		badges.push( `<span class="gll-meta-badge"><strong>Source:</strong> ${ sourceLabel }</span>` );
	}

	const metadataHtml = `<div class="gll-balloon-3d-metadata">${ badges.join( '' ) }</div>`;

	// Build color bar legend HTML
	const colorbarHtml = `
		<div class="gll-balloon-3d-colorbar">
			<div class="gll-colorbar-gradient"></div>
			<div class="gll-colorbar-labels">
				<span>${ displayMin.toFixed( 0 ) } dB</span>
				<span>${ midLevel.toFixed( 0 ) } dB</span>
				<span>${ displayMax.toFixed( 0 ) } dB</span>
			</div>
		</div>
	`;

	// Create Three.js container
	const threeContainer = document.createElement( 'div' );
	threeContainer.className = 'gll-three-container';
	threeContainer.style.minHeight = options.canvasHeight + 'px';

	canvasContainer.innerHTML = metadataHtml + colorbarHtml;
	canvasContainer.appendChild( threeContainer );
	( canvasContainer as HTMLElement ).style.display = 'block';

	// Initialize Three.js scene
	initThreeScene( threeContainer, source, balloonGrid, frequencies, options );
}

/**
 * Initialize Three.js scene with balloon mesh.
 */
function initThreeScene(
	container: HTMLElement,
	source: any,
	balloonGrid: BalloonGridInfo,
	frequencies: number[],
	options: BlockOptions
) {
	const width = container.clientWidth;
	const height = options.canvasHeight;

	// Create scene
	const scene = new THREE.Scene();

	// Create camera
	const camera = new THREE.PerspectiveCamera( 45, width / height, 0.1, 100 );
	camera.position.set( 0, 0.6, 2.6 );
	camera.lookAt( 0, 0, 0 );

	// Create renderer
	const renderer = new THREE.WebGLRenderer( {
		antialias: true,
		alpha: true,
	} );
	renderer.setSize( width, height );
	renderer.setPixelRatio( Math.min( window.devicePixelRatio, 2 ) );
	renderer.setClearColor( 0x000000, 0 );
	container.appendChild( renderer.domElement );

	// Create orbit controls
	const controls = new OrbitControls( camera, renderer.domElement );

	// Configure rotation
	controls.enableRotate = true;
	controls.rotateSpeed = 0.8;

	// Configure pan
	controls.enablePan = true;
	controls.panSpeed = 0.8;
	controls.screenSpacePanning = true;

	// Configure zoom
	controls.enableZoom = true;
	controls.minDistance = 0.5;
	controls.maxDistance = 10;

	// Configure damping for smooth movement
	controls.enableDamping = true;
	controls.dampingFactor = 0.08;

	// Bound polar angles to avoid gimbal lock
	controls.minPolarAngle = 0.05;
	controls.maxPolarAngle = Math.PI - 0.05;

	// Configure auto-rotate
	controls.autoRotate = options.autoRotate;
	controls.autoRotateSpeed = 0.0035 * 60; // Convert from rad/frame to deg/sec

	// Mouse button configuration
	controls.mouseButtons = {
		LEFT: THREE.MOUSE.ROTATE,
		MIDDLE: THREE.MOUSE.DOLLY,
		RIGHT: THREE.MOUSE.PAN,
	};

	// Touch configuration
	controls.touches = {
		ONE: THREE.TOUCH.ROTATE,
		TWO: THREE.TOUCH.DOLLY_PAN,
	};

	// Add lights
	const ambientLight = new THREE.AmbientLight( 0xffffff, 0.65 );
	scene.add( ambientLight );

	const directionalLight = new THREE.DirectionalLight( 0xffffff, 0.85 );
	directionalLight.position.set( 2.5, 2.5, 2 );
	scene.add( directionalLight );

	// Add reference sphere if enabled
	if ( options.showReferenceSphere ) {
		const sphereGeometry = new THREE.SphereGeometry( 1, 32, 32 );
		const sphereMaterial = new THREE.MeshBasicMaterial( {
			color: 0x888888,
			wireframe: true,
			transparent: true,
			opacity: 0.28,
		} );
		const sphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
		scene.add( sphere );
	}

	// Add axes helper if enabled
	if ( options.showAxesHelper ) {
		const axesHelper = new THREE.AxesHelper( 1 );
		scene.add( axesHelper );
	}

	// Build balloon mesh using new utilities with symmetry handling
	const balloonMesh = buildBalloonMesh( source, frequencies, options );
	if ( balloonMesh ) {
		scene.add( balloonMesh );
	}

	// Handle resize
	const resizeObserver = new ResizeObserver( () => {
		const newWidth = container.clientWidth;
		camera.aspect = newWidth / height;
		camera.updateProjectionMatrix();
		renderer.setSize( newWidth, height );
	} );
	resizeObserver.observe( container );

	// Animation loop
	let animationId: number;
	function animate() {
		animationId = requestAnimationFrame( animate );

		// Update controls (required for damping and auto-rotate)
		controls.update();

		renderer.render( scene, camera );
	}
	animate();

	// Cleanup on page unload
	window.addEventListener( 'beforeunload', () => {
		cancelAnimationFrame( animationId );
		resizeObserver.disconnect();
		controls.dispose();
		renderer.dispose();
		if ( balloonMesh ) {
			balloonMesh.geometry.dispose();
			if ( balloonMesh.material instanceof THREE.Material ) {
				balloonMesh.material.dispose();
			}
		}
	} );
}

/**
 * Build the balloon mesh geometry using the new balloon utilities.
 * Handles symmetry-based data mirroring and uses cached global max levels.
 */
function buildBalloonMesh(
	source: any,
	frequencies: number[],
	options: BlockOptions
): THREE.Mesh | null {
	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );

	// Build geometry data using new utilities with symmetry handling
	const geometryData = buildBalloonGeometryData( source, {
		frequencyIndex: freqIdx,
		dbRange: options.dbRange,
		scale: options.scale,
	} );

	if ( ! geometryData ) {
		return null;
	}

	// Create Three.js geometry
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute(
		'position',
		new THREE.Float32BufferAttribute( geometryData.vertices, 3 )
	);
	geometry.setAttribute(
		'color',
		new THREE.Float32BufferAttribute( geometryData.colors, 3 )
	);
	geometry.setIndex( geometryData.indices );
	geometry.computeVertexNormals();

	// Create material
	const material = new THREE.MeshStandardMaterial( {
		vertexColors: true,
		wireframe: options.wireframe,
		flatShading: true,
		metalness: 0.05,
		roughness: 0.75,
		side: THREE.DoubleSide,
	} );

	return new THREE.Mesh( geometry, material );
}

/**
 * Show error message in block.
 */
function showError( block: HTMLElement, message: string ) {
	const loadingEl = block.querySelector( '.gll-balloon-3d-loading' );
	if ( loadingEl ) {
		( loadingEl as HTMLElement ).style.display = 'none';
	}

	const canvasContainer = block.querySelector( '.gll-balloon-3d-canvas' );
	if ( canvasContainer ) {
		canvasContainer.innerHTML = `
			<div class="gll-error" style="padding: 20px; color: #d63638; border: 1px solid #d63638; border-radius: 4px; background: #fff8f8;">
				<strong>Error:</strong> ${ message }
			</div>
		`;
		( canvasContainer as HTMLElement ).style.display = 'block';
	}
}
