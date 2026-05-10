/**
 * Manual orbit controls — fallback for `three/examples/jsm/controls/OrbitControls`.
 *
 * Implements spherical-coordinate orbit camera math (theta, phi, radius, target)
 * with rotate / pan / zoom / autoRotate / damping. Used when the upstream
 * OrbitControls module fails to load (e.g. tree-shaking edge cases or build
 * environments where the addon path is unavailable).
 *
 * @package
 */

import * as THREE from 'three';

export interface ManualOrbitControlsOptions {
	target?: THREE.Vector3;
	minDistance?: number;
	maxDistance?: number;
	minPolarAngle?: number;
	maxPolarAngle?: number;
	rotateSpeed?: number;
	panSpeed?: number;
	zoomSpeed?: number;
	dampingFactor?: number;
	autoRotate?: boolean;
	autoRotateSpeed?: number;
}

export interface ManualOrbitControls {
	readonly target: THREE.Vector3;
	autoRotate: boolean;
	update: ( deltaTime?: number ) => void;
	dispose: () => void;
	setTarget: ( x: number, y: number, z: number ) => void;
}

const TWO_PI = Math.PI * 2;
const EPS = 0.000001;

/**
 * Attach manual orbit-style pointer controls to an HTML element.
 *
 * @param camera  Perspective camera to drive.
 * @param element DOM element used as input source.
 * @param options Behavioural overrides.
 * @return Controls handle with `update` / `dispose`.
 */
export function attachManualOrbitControls(
	camera: THREE.PerspectiveCamera,
	element: HTMLElement,
	options: ManualOrbitControlsOptions = {}
): ManualOrbitControls {
	const target = options.target
		? options.target.clone()
		: new THREE.Vector3( 0, 0, 0 );
	const minDistance = options.minDistance ?? 0.25;
	const maxDistance = options.maxDistance ?? 25;
	const minPolarAngle = options.minPolarAngle ?? EPS;
	const maxPolarAngle = options.maxPolarAngle ?? Math.PI - EPS;
	const rotateSpeed = options.rotateSpeed ?? 0.6;
	const panSpeed = options.panSpeed ?? 0.9;
	const zoomSpeed = options.zoomSpeed ?? 0.95;
	const dampingFactor = Math.min(
		Math.max( options.dampingFactor ?? 0.08, 0 ),
		1
	);
	const autoRotateSpeed = options.autoRotateSpeed ?? 0.5;

	const offset = camera.position.clone().sub( target );
	let radius = clamp( offset.length() || 2.2, minDistance, maxDistance );
	let theta = Math.atan2( offset.x, offset.z );
	let phi = Math.acos( clamp( offset.y / radius, -1, 1 ) );

	let thetaDelta = 0;
	let phiDelta = 0;
	let radiusDelta = 0;
	const panOffset = new THREE.Vector3();

	const state = {
		autoRotate: options.autoRotate ?? false,
		activeButton: -1,
		lastX: 0,
		lastY: 0,
		lastTime: performance.now(),
	};

	const onPointerDown = ( event: PointerEvent ) => {
		state.activeButton = event.button;
		state.lastX = event.clientX;
		state.lastY = event.clientY;
		try {
			element.setPointerCapture( event.pointerId );
		} catch ( _e ) {
			// pointer capture is best-effort; ignore failures (e.g. test envs).
		}
	};

	const onPointerMove = ( event: PointerEvent ) => {
		if ( state.activeButton < 0 ) {
			return;
		}
		const deltaX = event.clientX - state.lastX;
		const deltaY = event.clientY - state.lastY;
		state.lastX = event.clientX;
		state.lastY = event.clientY;

		const sizeY = element.clientHeight || 1;

		if ( state.activeButton === 2 ) {
			panFromScreenDelta( deltaX, deltaY, sizeY );
			return;
		}

		// Treat any non-right button (incl. middle) as rotate, matching the
		// fallback intent — we lose true middle-button dolly but keep the
		// primary rotate UX intact when OrbitControls is unavailable.
		thetaDelta -= ( TWO_PI * deltaX * rotateSpeed ) / sizeY;
		phiDelta -= ( TWO_PI * deltaY * rotateSpeed ) / sizeY;
	};

	const onPointerUp = ( event: PointerEvent ) => {
		state.activeButton = -1;
		try {
			element.releasePointerCapture( event.pointerId );
		} catch ( _e ) {
			// see onPointerDown
		}
	};

	const onWheel = ( event: WheelEvent ) => {
		event.preventDefault();
		const direction = event.deltaY > 0 ? 1 : -1;
		const scale = Math.pow( zoomSpeed, direction );
		radiusDelta += radius * ( scale - 1 );
	};

	const onContextMenu = ( event: Event ) => {
		event.preventDefault();
	};

	function panFromScreenDelta( dx: number, dy: number, sizeY: number ) {
		const fovFactor =
			2 * Math.tan( ( camera.fov * Math.PI ) / 360 ) * radius;
		const panX = -( dx * fovFactor * panSpeed ) / sizeY;
		const panY = ( dy * fovFactor * panSpeed ) / sizeY;

		const m = camera.matrix.elements;
		panOffset.x += m[ 0 ] * panX + m[ 4 ] * panY;
		panOffset.y += m[ 1 ] * panX + m[ 5 ] * panY;
		panOffset.z += m[ 2 ] * panX + m[ 6 ] * panY;
	}

	element.addEventListener( 'pointerdown', onPointerDown );
	element.addEventListener( 'pointermove', onPointerMove );
	element.addEventListener( 'pointerup', onPointerUp );
	element.addEventListener( 'pointerleave', onPointerUp );
	element.addEventListener( 'pointercancel', onPointerUp );
	element.addEventListener( 'wheel', onWheel, { passive: false } );
	element.addEventListener( 'contextmenu', onContextMenu );

	const controls: ManualOrbitControls = {
		target,
		get autoRotate() {
			return state.autoRotate;
		},
		set autoRotate( value: boolean ) {
			state.autoRotate = value;
		},
		setTarget( x: number, y: number, z: number ) {
			target.set( x, y, z );
		},
		update( deltaTime?: number ) {
			let dt = deltaTime;
			if ( dt === undefined ) {
				const now = performance.now();
				dt = ( now - state.lastTime ) / 1000;
				state.lastTime = now;
			}

			if ( state.autoRotate ) {
				thetaDelta -= autoRotateSpeed * dt;
			}

			theta += thetaDelta;
			phi += phiDelta;
			radius += radiusDelta;
			target.add( panOffset );

			phi = clamp( phi, minPolarAngle, maxPolarAngle );
			radius = clamp( radius, minDistance, maxDistance );

			const damp = 1 - dampingFactor;
			thetaDelta *= damp;
			phiDelta *= damp;
			radiusDelta *= damp;
			panOffset.multiplyScalar( damp );

			const sinPhiRadius = Math.sin( phi ) * radius;
			camera.position.set(
				target.x + sinPhiRadius * Math.sin( theta ),
				target.y + Math.cos( phi ) * radius,
				target.z + sinPhiRadius * Math.cos( theta )
			);
			camera.lookAt( target );
		},
		dispose() {
			element.removeEventListener( 'pointerdown', onPointerDown );
			element.removeEventListener( 'pointermove', onPointerMove );
			element.removeEventListener( 'pointerup', onPointerUp );
			element.removeEventListener( 'pointerleave', onPointerUp );
			element.removeEventListener( 'pointercancel', onPointerUp );
			element.removeEventListener( 'wheel', onWheel );
			element.removeEventListener( 'contextmenu', onContextMenu );
		},
	};

	return controls;
}

function clamp( value: number, min: number, max: number ): number {
	return Math.max( min, Math.min( max, value ) );
}
