/**
 * Unit tests for manual orbit controls (theta/phi/radius/target math).
 *
 * @package
 */

import * as THREE from 'three';
import { attachManualOrbitControls } from './manual-orbit-controls';

function makeElement(): HTMLElement {
	const el = document.createElement( 'div' );
	Object.defineProperty( el, 'clientHeight', {
		configurable: true,
		value: 500,
	} );
	Object.defineProperty( el, 'clientWidth', {
		configurable: true,
		value: 500,
	} );
	// jsdom does not implement these on Element; stub no-ops keep capture calls safe.
	el.setPointerCapture = () => undefined;
	el.releasePointerCapture = () => undefined;
	return el;
}

function makeCamera(): THREE.PerspectiveCamera {
	const camera = new THREE.PerspectiveCamera( 42, 1, 0.1, 100 );
	camera.position.set( 0, 0, 2 );
	camera.lookAt( 0, 0, 0 );
	return camera;
}

describe( 'attachManualOrbitControls', () => {
	it( 'preserves camera distance from target on initial update', () => {
		const camera = makeCamera();
		const element = makeElement();
		const controls = attachManualOrbitControls( camera, element, {
			dampingFactor: 0,
		} );

		controls.update( 0 );

		const distance = camera.position.distanceTo( controls.target );
		expect( distance ).toBeCloseTo( 2, 5 );

		controls.dispose();
	} );

	it( 'auto-rotates around the Y axis while keeping radius constant', () => {
		const camera = makeCamera();
		const element = makeElement();
		const controls = attachManualOrbitControls( camera, element, {
			autoRotate: true,
			autoRotateSpeed: Math.PI, // 180°/sec — large to make drift obvious.
			dampingFactor: 0,
		} );

		const startAzimuth = Math.atan2(
			camera.position.x - controls.target.x,
			camera.position.z - controls.target.z
		);

		controls.update( 1 );

		const endAzimuth = Math.atan2(
			camera.position.x - controls.target.x,
			camera.position.z - controls.target.z
		);
		const distance = camera.position.distanceTo( controls.target );

		expect( distance ).toBeCloseTo( 2, 5 );
		expect( endAzimuth ).not.toBeCloseTo( startAzimuth, 3 );

		controls.dispose();
	} );

	it( 'clamps radius to [minDistance, maxDistance] under wheel zoom', () => {
		const camera = makeCamera();
		const element = makeElement();
		const controls = attachManualOrbitControls( camera, element, {
			minDistance: 1.5,
			maxDistance: 4,
			dampingFactor: 0,
			zoomSpeed: 0.5,
		} );

		// Zoom out aggressively (wheel down → larger radius).
		for ( let i = 0; i < 50; i++ ) {
			element.dispatchEvent(
				new WheelEvent( 'wheel', { deltaY: 100, cancelable: true } )
			);
			controls.update( 0 );
		}
		expect(
			camera.position.distanceTo( controls.target )
		).toBeLessThanOrEqual( 4 + 1e-6 );

		// Zoom in aggressively (wheel up → smaller radius).
		for ( let i = 0; i < 50; i++ ) {
			element.dispatchEvent(
				new WheelEvent( 'wheel', { deltaY: -100, cancelable: true } )
			);
			controls.update( 0 );
		}
		expect(
			camera.position.distanceTo( controls.target )
		).toBeGreaterThanOrEqual( 1.5 - 1e-6 );

		controls.dispose();
	} );

	it( 'cleans up event listeners on dispose', () => {
		const camera = makeCamera();
		const element = makeElement();
		const removeSpy = jest.spyOn( element, 'removeEventListener' );

		const controls = attachManualOrbitControls( camera, element );
		controls.dispose();

		const eventNames = removeSpy.mock.calls.map( ( call ) => call[ 0 ] );
		expect( eventNames ).toEqual(
			expect.arrayContaining( [
				'pointerdown',
				'pointermove',
				'pointerup',
				'wheel',
				'contextmenu',
			] )
		);
	} );
} );
