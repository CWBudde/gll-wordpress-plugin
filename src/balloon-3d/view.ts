/**
 * 3D Balloon Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Three.js rendering on the frontend.
 *
 * @package GllInfo
 */

import * as THREE from 'three';
import { ensureWasmReady, parseGLLFile } from '../shared/wasm-loader';
import { formatFrequency } from '../shared/charting-utils';
import { getBalloonGrid } from '../shared/polar-utils';
import { isWebGLSupported } from '../shared/three-wrapper';

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

interface BalloonGrid {
	meridians: number;
	parallels: number;
	meridianStep: number;
	parallelStep: number;
	symmetry: number;
	symmetryName: string;
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

	const balloonGrid = getBalloonGrid( source ) as BalloonGrid | null;
	if ( ! balloonGrid ) {
		showError( block, 'No directivity data available for this source' );
		return;
	}

	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );
	const frequency = frequencies[ freqIdx ];

	// Build metadata HTML
	const badges = [];
	badges.push( `<span class="gll-meta-badge"><strong>Frequency:</strong> ${ formatFrequency( frequency ) }</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>dB Range:</strong> ${ options.dbRange } dB</span>` );
	badges.push( `<span class="gll-meta-badge"><strong>Resolution:</strong> ${ balloonGrid.meridianStep }\u00b0 \u00d7 ${ balloonGrid.parallelStep }\u00b0</span>` );
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

	// Create Three.js container
	const threeContainer = document.createElement( 'div' );
	threeContainer.className = 'gll-three-container';
	threeContainer.style.minHeight = options.canvasHeight + 'px';

	canvasContainer.innerHTML = metadataHtml;
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
	balloonGrid: BalloonGrid,
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

	// Build balloon mesh
	const balloonMesh = buildBalloonMesh( source, balloonGrid, frequencies, options );
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

		if ( options.autoRotate && balloonMesh ) {
			scene.rotation.y += 0.0035;
		}

		renderer.render( scene, camera );
	}
	animate();

	// Cleanup on page unload
	window.addEventListener( 'beforeunload', () => {
		cancelAnimationFrame( animationId );
		resizeObserver.disconnect();
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
 * Build the balloon mesh geometry.
 */
function buildBalloonMesh(
	source: any,
	balloonGrid: BalloonGrid,
	frequencies: number[],
	options: BlockOptions
): THREE.Mesh | null {
	const { meridians, parallels, meridianStep, parallelStep } = balloonGrid;
	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );

	// Get levels for the selected frequency
	const levels: number[][] = [];

	// Build full sphere grid from balloon data
	for ( let p = 0; p < parallels; p++ ) {
		const parallelLevels: number[] = [];
		for ( let m = 0; m < meridians; m++ ) {
			// Get response for this direction
			const responseIdx = p * meridians + m;
			const response = source?.Responses?.[ responseIdx ];
			const level = response?.Levels?.[ freqIdx ] ?? null;
			parallelLevels.push( level ?? -100 );
		}
		levels.push( parallelLevels );
	}

	// Find global max level
	let globalMax = -Infinity;
	for ( const row of levels ) {
		for ( const level of row ) {
			if ( level !== null && level > globalMax ) {
				globalMax = level;
			}
		}
	}

	if ( globalMax === -Infinity ) {
		globalMax = 0;
	}

	const displayMin = globalMax - options.dbRange;
	const baseRadius = 0.3 * options.scale;
	const amplitude = 0.9 * options.scale;

	// Build geometry
	const geometry = new THREE.BufferGeometry();
	const vertices: number[] = [];
	const colors: number[] = [];
	const indices: number[] = [];

	// Create sphere vertices with radius based on level
	for ( let p = 0; p <= parallels; p++ ) {
		const phi = ( p / parallels ) * Math.PI; // 0 to PI (top to bottom)

		for ( let m = 0; m <= meridians; m++ ) {
			const theta = ( m / meridians ) * Math.PI * 2; // 0 to 2PI

			// Get level for this point
			const pIdx = Math.min( p, parallels - 1 );
			const mIdx = m % meridians;
			const level = levels[ pIdx ]?.[ mIdx ] ?? displayMin;

			// Calculate normalized value and radius
			const normalized = Math.max( 0, Math.min( 1, ( level - displayMin ) / options.dbRange ) );
			const radius = baseRadius + amplitude * normalized;

			// Convert spherical to cartesian (GLL Z-up to Three.js Y-up)
			const x = radius * Math.sin( phi ) * Math.cos( theta );
			const z = radius * Math.sin( phi ) * Math.sin( theta ); // GLL Y -> Three.js Z
			const y = radius * Math.cos( phi ); // GLL Z -> Three.js Y

			vertices.push( x, y, z );

			// Color based on level (HSL: red=max to blue=min)
			const hue = ( 1 - normalized ) * 0.66; // 0 (red) to 0.66 (blue)
			const color = new THREE.Color();
			color.setHSL( hue, 0.75, 0.5 );
			colors.push( color.r, color.g, color.b );
		}
	}

	// Create triangle indices
	for ( let p = 0; p < parallels; p++ ) {
		for ( let m = 0; m < meridians; m++ ) {
			const current = p * ( meridians + 1 ) + m;
			const next = current + meridians + 1;

			// Two triangles per quad
			indices.push( current, next, current + 1 );
			indices.push( current + 1, next, next + 1 );
		}
	}

	geometry.setAttribute( 'position', new THREE.Float32BufferAttribute( vertices, 3 ) );
	geometry.setAttribute( 'color', new THREE.Float32BufferAttribute( colors, 3 ) );
	geometry.setIndex( indices );
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
