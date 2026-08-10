/**
 * 3D Balloon Block - Frontend Script
 *
 * Handles WASM loading, GLL parsing, and Three.js rendering on the frontend.
 *
 * @package
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { __, sprintf } from '@wordpress/i18n';
import { ensureWasmReady, parseGLL } from '../shared/wasm-loader';
import { setBlockHeaderLabel } from '../shared/gll-normalize';
import { formatFrequency } from '../shared/charting-utils';
import { isWebGLSupported } from '../shared/three-wrapper';
import {
	getBalloonGrid,
	buildBalloonGeometryData,
	computeGlobalMaxLevel,
} from '../shared/balloon-utils';
import type { BalloonGridInfo } from '../shared/balloon-utils';
import { resolveTheme } from '../shared/resolve-theme';
import {
	attachKeyboardOrbit,
	describeCanvas,
	initBlockLiveRegions,
	renderErrorPanel,
} from '../shared/a11y';
import { describeFetchFailure, isSafeFileUrl } from '../shared/file-source';
import { applySceneTheme } from './theme-three';
import {
	buildCanvasLabel,
	buildColorbarHtml,
	buildMetadataHtml,
	readBlockOptions,
	resolveQuality,
} from './balloon-render';
import type { BlockOptions, QualitySettings } from './balloon-render';

/**
 * Per-block teardown callbacks, keyed by the block element. Used so that
 * single-page-app navigations and `beforeunload` can release every Three.js
 * scene that was lazily initialized.
 */
const blockCleanups = new WeakMap< HTMLElement, () => void >();
const liveBlocks = new Set< HTMLElement >();

/**
 * Initialize all 3D balloon blocks on the page (lazily).
 */
document.addEventListener( 'DOMContentLoaded', async () => {
	const blocks = document.querySelectorAll< HTMLElement >(
		'.gll-balloon-3d-block'
	);

	if ( blocks.length === 0 ) {
		return;
	}

	// Check WebGL support
	if ( ! isWebGLSupported() ) {
		blocks.forEach( ( block ) => {
			showError(
				block,
				__(
					'WebGL is not supported in your browser. Please use a modern browser to view 3D content.',
					'gll-info'
				)
			);
		} );
		return;
	}

	const initializedBlocks = new WeakSet< HTMLElement >();

	const initOnce = async ( block: HTMLElement ) => {
		if ( initializedBlocks.has( block ) ) {
			return;
		}
		initializedBlocks.add( block );

		try {
			await ensureWasmReady();
		} catch ( error ) {
			console.error( 'Failed to initialize WASM:', error );
			showError(
				block,
				__( 'Failed to initialize WASM parser', 'gll-info' )
			);
			return;
		}

		await initializeBlock( block );
	};

	if ( typeof IntersectionObserver === 'undefined' ) {
		// Fallback: initialize eagerly when IntersectionObserver isn't available.
		blocks.forEach( ( block ) => {
			liveBlocks.add( block );
			void initOnce( block );
		} );
	} else {
		const observer = new IntersectionObserver(
			( entries ) => {
				for ( const entry of entries ) {
					if ( entry.isIntersecting ) {
						const target = entry.target as HTMLElement;
						observer.unobserve( target );
						void initOnce( target );
					}
				}
			},
			{ rootMargin: '200px' }
		);
		blocks.forEach( ( block ) => {
			liveBlocks.add( block );
			observer.observe( block );
		} );
	}

	// Tear down every initialized scene on page unload so that a back/forward
	// navigation does not leak detached canvases.
	window.addEventListener( 'beforeunload', () => {
		for ( const block of liveBlocks ) {
			const cleanup = blockCleanups.get( block );
			if ( cleanup ) {
				cleanup();
			}
		}
	} );
} );

/**
 * Initialize a single 3D balloon block.
 * @param block
 */
async function initializeBlock( block: HTMLElement ) {
	const fileUrl = block.dataset.fileUrl;

	if ( ! fileUrl ) {
		showError( block, __( 'No file URL specified', 'gll-info' ) );
		return;
	}

	// Saved markup, but nothing had ever checked it. A scheme test is cheap and
	// is the whole of what a view script can usefully say about an address.
	if ( ! isSafeFileUrl( fileUrl ) ) {
		showError(
			block,
			__( 'This block has an address it cannot load.', 'gll-info' )
		);
		return;
	}

	// Before the fetch, not after it: this block's save() carries a
	// `.gll-loading-text` paragraph, which the helper turns into the live
	// region and which `setBlockHeaderLabel` later rewrites from
	// "Loading 3D balloon…" to the parsed system label. The region has to be in
	// the document before that rewrite happens, or assistive technology reads
	// the new text as the region's initial content and says nothing at all.
	initBlockLiveRegions( block );

	const options = readBlockOptions( block.dataset );

	try {
		const response = await fetch( fileUrl );
		if ( ! response.ok ) {
			throw new Error(
				sprintf(
					// translators: %s: HTTP status text returned by the server.
					__( 'Failed to fetch file: %s', 'gll-info' ),
					response.statusText
				)
			);
		}

		const arrayBuffer = await response.arrayBuffer();
		const data = await parseGLL( arrayBuffer );
		setBlockHeaderLabel( block, data );

		const loadingEl = block.querySelector( '.gll-balloon-3d-loading' );
		if ( loadingEl ) {
			( loadingEl as HTMLElement ).style.display = 'none';
		}

		render3DBalloon( block, data, options );
	} catch ( error ) {
		console.error( 'Error loading GLL file:', error );
		showError( block, describeFetchFailure( error, fileUrl ) );
	}
}

/**
 * Render 3D balloon visualization.
 * @param block
 * @param data
 * @param options
 */
function render3DBalloon(
	block: HTMLElement,
	data: any,
	options: BlockOptions
) {
	const canvasContainer = block.querySelector( '.gll-balloon-3d-canvas' );
	if ( ! canvasContainer ) {
		return;
	}

	// Get sources with responses
	const sources = ( data?.Database?.SourceDefinitions || [] ).filter(
		( s: any ) => ( s.Responses || [] ).length > 0
	);

	const source = sources[ options.sourceIndex ];
	if ( ! source ) {
		showError( block, __( 'Source not found', 'gll-info' ) );
		return;
	}

	const frequencies = source.Responses?.[ 0 ]?.Frequencies || [];
	if ( frequencies.length === 0 ) {
		showError( block, __( 'No frequency data available', 'gll-info' ) );
		return;
	}

	const balloonGrid = getBalloonGrid( source ) as BalloonGridInfo | null;
	if ( ! balloonGrid ) {
		showError(
			block,
			__( 'No directivity data available for this source', 'gll-info' )
		);
		return;
	}

	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );
	const frequency = frequencies[ freqIdx ];

	// Get global max level (cached)
	const globalMax = computeGlobalMaxLevel( source );
	const displayMax = globalMax;
	const displayMin = globalMax - options.dbRange;

	const freqLabel = formatFrequency( frequency );

	const metadataHtml = buildMetadataHtml( {
		freqLabel,
		displayMin,
		displayMax,
		balloonGrid,
		source,
		options,
	} );

	const colorbarHtml = buildColorbarHtml( displayMin, displayMax );

	// Create Three.js container
	const threeContainer = document.createElement( 'div' );
	threeContainer.className = 'gll-three-container';
	threeContainer.style.minHeight = options.canvasHeight + 'px';

	canvasContainer.innerHTML = metadataHtml + colorbarHtml;
	canvasContainer.appendChild( threeContainer );
	( canvasContainer as HTMLElement ).style.display = 'block';

	// The renderer canvas is opaque to assistive technology, so it gets a text
	// alternative describing what is plotted — the frequency, the level range
	// and the grid the balloon is built from — rather than the word "chart".
	// The second sentence is the only place the keyboard bindings are stated;
	// they are invisible chrome otherwise.
	const canvasLabel = buildCanvasLabel( {
		freqLabel,
		displayMin,
		displayMax,
		balloonGrid,
	} );

	// Initialize Three.js scene
	initThreeScene(
		block,
		threeContainer,
		source,
		balloonGrid,
		frequencies,
		options,
		canvasLabel
	);
}

/**
 * Initialize Three.js scene with balloon mesh.
 * @param block
 * @param container
 * @param source
 * @param balloonGrid
 * @param frequencies
 * @param options
 * @param canvasLabel Text alternative for the renderer canvas.
 */
function initThreeScene(
	block: HTMLElement,
	container: HTMLElement,
	source: any,
	balloonGrid: BalloonGridInfo,
	frequencies: number[],
	options: BlockOptions,
	canvasLabel: string
) {
	const quality = resolveQuality( options.qualityPreset );
	const width = container.clientWidth;
	const height = options.canvasHeight;

	// Resolve the block's theme tokens once. Custom properties inherit, so the
	// canvas container reports the same values as the `.gll-block` wrapper.
	let theme = resolveTheme( container );

	// Create scene
	const scene = new THREE.Scene();

	// Create camera
	const camera = new THREE.PerspectiveCamera( 45, width / height, 0.1, 100 );
	camera.position.set( 0, 0.6, 2.6 );
	camera.lookAt( 0, 0, 0 );

	// Create renderer
	const renderer = new THREE.WebGLRenderer( {
		antialias: quality.antialias,
		alpha: true,
	} );
	renderer.setSize( width, height );
	renderer.setPixelRatio(
		Math.min( window.devicePixelRatio, quality.maxPixelRatio )
	);
	renderer.setClearColor( 0x000000, 0 );
	describeCanvas( renderer.domElement, canvasLabel );
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

	// No `controls.enableKeys` here: the flag was removed from OrbitControls in
	// three r132 and package.json pins ^0.159.0, so setting it would bind
	// nothing. Keyboard operation is provided below by moving the camera
	// ourselves and letting `controls.update()` re-derive its spherical state on
	// the next frame — exactly what the pointer path does, so the two cannot
	// disagree about where the camera is.
	const orbitTarget = new THREE.Vector3();
	const spherical = new THREE.Spherical();
	const detachKeyboard = attachKeyboardOrbit( renderer.domElement, {
		orbit: ( deltaAzimuth, deltaPolar ) => {
			orbitTarget.copy( controls.target );
			spherical.setFromVector3(
				camera.position.clone().sub( orbitTarget )
			);
			spherical.theta += deltaAzimuth;
			// The same poles OrbitControls clamps to above; straight overhead
			// flips the up vector and the balloon appears to jump.
			spherical.phi = Math.max(
				0.05,
				Math.min( Math.PI - 0.05, spherical.phi + deltaPolar )
			);
			camera.position.setFromSpherical( spherical ).add( orbitTarget );
			camera.lookAt( orbitTarget );
		},
		zoom: ( factor ) => {
			orbitTarget.copy( controls.target );
			spherical.setFromVector3(
				camera.position.clone().sub( orbitTarget )
			);
			// The same bounds the pointer wheel obeys.
			spherical.radius = Math.max(
				0.5,
				Math.min( 10, spherical.radius * factor )
			);
			camera.position.setFromSpherical( spherical ).add( orbitTarget );
		},
	} );

	// Add lights
	const ambientLight = new THREE.AmbientLight( 0xffffff, 0.65 );
	scene.add( ambientLight );

	let directionalLight: THREE.DirectionalLight | null = null;
	if ( quality.directionalLightIntensity > 0 ) {
		directionalLight = new THREE.DirectionalLight(
			0xffffff,
			quality.directionalLightIntensity
		);
		directionalLight.position.set( 2.5, 2.5, 2 );
		scene.add( directionalLight );
	}

	let fillLight: THREE.DirectionalLight | null = null;
	if ( quality.fillLight ) {
		fillLight = new THREE.DirectionalLight( 0xffffff, 0.4 );
		fillLight.position.set( -2, -1, -2 );
		scene.add( fillLight );
	}

	// Add reference sphere if enabled
	let referenceSphere: THREE.Mesh | null = null;
	if ( options.showReferenceSphere ) {
		const sphereGeometry = new THREE.SphereGeometry( 1, 32, 32 );
		const sphereMaterial = new THREE.MeshBasicMaterial( {
			// Muted text, not the border color: at opacity 0.28 the default
			// light-grey border would be all but invisible on a light theme.
			color: new THREE.Color( theme.textMuted ),
			wireframe: true,
			transparent: true,
			opacity: 0.28,
		} );
		referenceSphere = new THREE.Mesh( sphereGeometry, sphereMaterial );
		scene.add( referenceSphere );
	}

	// Add axes helper if enabled
	let axesHelper: THREE.AxesHelper | null = null;
	if ( options.showAxesHelper ) {
		axesHelper = new THREE.AxesHelper( 1 );
		scene.add( axesHelper );
	}

	// Recolor the helpers that were just added (the axes helper's per-vertex
	// R/G/B is replaced with the theme's border color).
	applySceneTheme( scene, theme );

	// Build balloon mesh using new utilities with symmetry handling
	const balloonMesh = buildBalloonMesh(
		source,
		frequencies,
		options,
		quality
	);
	if ( balloonMesh ) {
		scene.add( balloonMesh );
	}

	// Handle resize
	const resizeObserver = new ResizeObserver( () => {
		const newWidth = container.clientWidth;
		camera.aspect = newWidth / height;
		camera.updateProjectionMatrix();
		renderer.setSize( newWidth, height );

		// A resize is the cheapest hook we have for picking up a theme change
		// (a dark-mode toggle usually reflows the layout). Re-apply only when
		// the resolved colors actually differ.
		const next = resolveTheme( container );
		if (
			next.border !== theme.border ||
			next.textMuted !== theme.textMuted
		) {
			theme = next;
			applySceneTheme( scene, theme );
		}
	} );
	resizeObserver.observe( container );

	// Visibility tracking: pause animation work when the block is offscreen.
	let isVisible = true;
	let visibilityObserver: IntersectionObserver | null = null;
	if ( typeof IntersectionObserver !== 'undefined' ) {
		visibilityObserver = new IntersectionObserver(
			( entries ) => {
				for ( const entry of entries ) {
					isVisible = entry.isIntersecting;
				}
			},
			{ rootMargin: '0px' }
		);
		visibilityObserver.observe( block );
	}

	// Animation loop
	let animationId = 0;
	function animate() {
		animationId = requestAnimationFrame( animate );

		if ( ! isVisible ) {
			return;
		}

		// Update controls (required for damping and auto-rotate)
		controls.update();

		renderer.render( scene, camera );
	}
	animate();

	const cleanup = () => {
		cancelAnimationFrame( animationId );
		detachKeyboard();
		resizeObserver.disconnect();
		if ( visibilityObserver ) {
			visibilityObserver.disconnect();
		}
		controls.dispose();
		renderer.dispose();
		if ( balloonMesh ) {
			balloonMesh.geometry.dispose();
			if ( balloonMesh.material instanceof THREE.Material ) {
				balloonMesh.material.dispose();
			}
		}
		if ( referenceSphere ) {
			referenceSphere.geometry.dispose();
			if ( referenceSphere.material instanceof THREE.Material ) {
				referenceSphere.material.dispose();
			}
		}
		if ( axesHelper ) {
			axesHelper.dispose();
		}
		if ( directionalLight ) {
			directionalLight.dispose();
		}
		if ( fillLight ) {
			fillLight.dispose();
		}
	};

	blockCleanups.set( block, cleanup );
}

/**
 * Build the balloon mesh geometry using the new balloon utilities.
 * Handles symmetry-based data mirroring and uses cached global max levels.
 * @param source
 * @param frequencies
 * @param options
 * @param quality
 */
function buildBalloonMesh(
	source: any,
	frequencies: number[],
	options: BlockOptions,
	quality: QualitySettings
): THREE.Mesh | null {
	const freqIdx = Math.min( options.frequencyIndex, frequencies.length - 1 );

	// Build geometry data using new utilities with symmetry handling
	const geometryData = buildBalloonGeometryData( source, {
		frequencyIndex: freqIdx,
		dbRange: options.dbRange,
		scale: options.scale,
		subsampleStride: quality.subsampleStride,
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
 * @param block
 * @param message
 */
function showError( block: HTMLElement, message: string ) {
	const loadingEl = block.querySelector( '.gll-balloon-3d-loading' );
	if ( loadingEl ) {
		( loadingEl as HTMLElement ).style.display = 'none';
	}

	const canvasContainer = block.querySelector( '.gll-balloon-3d-canvas' );
	if ( canvasContainer ) {
		// The inline styles this used to carry duplicated `.gll-error` in
		// style.scss and produced a white-on-white panel under a dark theme.
		// The shared panel is also a `role="alert"` live region, so the failure
		// is spoken instead of silently replacing the viewer.
		renderErrorPanel( canvasContainer, message );
		( canvasContainer as HTMLElement ).style.display = 'block';
	}
}
