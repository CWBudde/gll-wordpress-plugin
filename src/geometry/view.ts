/**
 * Geometry Viewer Block - Frontend Script
 *
 * @package GllInfo
 */

import * as THREE from 'three';
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

	blocks.forEach( ( block ) => {
		initializeBlock( block as HTMLElement );
	} );
} );

function initializeBlock( block: HTMLElement ) {
	const canvasContainer = block.querySelector( '.gll-geometry-canvas' );
	if ( ! canvasContainer ) {
		return;
	}

	const autoRotate = block.dataset.autoRotate === 'true';
	const canvasHeight = parseInt( block.dataset.canvasHeight || '500', 10 );

	const loadingEl = block.querySelector( '.gll-geometry-loading' );
	if ( loadingEl ) {
		( loadingEl as HTMLElement ).style.display = 'none';
	}

	const threeContainer = document.createElement( 'div' );
	threeContainer.className = 'gll-three-container';
	threeContainer.style.minHeight = canvasHeight + 'px';
	canvasContainer.appendChild( threeContainer );

	initThreeScene( threeContainer, {
		canvasHeight,
		autoRotate,
	} );
}

function initThreeScene(
	container: HTMLElement,
	options: { canvasHeight: number; autoRotate: boolean }
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

		if ( options.autoRotate ) {
			scene.rotation.y += 0.0035;
		}

		renderer.render( scene, camera );
	};
	animate();

	window.addEventListener( 'beforeunload', () => {
		cancelAnimationFrame( animationId );
		resizeObserver.disconnect();
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
