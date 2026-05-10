import {
	buildGeometryMarkers,
	computeBounds,
	computeScaleFactor,
	eulerHvrToQuaternion,
	getCenterOfMassPoint,
	getEulerHvr,
	getNextPivotPoint,
	toViewPoint,
} from './geometry-utils';

describe( 'geometry marker utilities', () => {
	it( 'resolves center of mass and next pivot marker points from geometry aliases', () => {
		const geometry = {
			CenterOfMass: { X: 1, Y: 2, Z: 3 },
			NextPivot: [ 4, 5, 6 ],
		};

		expect( getCenterOfMassPoint( geometry ) ).toEqual( {
			x: 1,
			y: 2,
			z: 3,
		} );
		expect( getNextPivotPoint( geometry ) ).toEqual( {
			x: 4,
			y: 5,
			z: 6,
		} );
	} );

	it( 'builds visible markers in normalized world coordinates', () => {
		const geometry = {
			Vertices: [
				{ X: 0, Y: 0, Z: 0 },
				{ X: 10, Y: 0, Z: 0 },
			],
			ReferencePoint: { X: 2, Y: 3, Z: 4 },
			CenterOfMass: { X: 3, Y: 4, Z: 5 },
			NextPivot: { X: 4, Y: 5, Z: 6 },
		};
		const viewVertices = geometry.Vertices.map( toViewPoint );
		const bounds = computeBounds( viewVertices );
		const scale = computeScaleFactor( bounds, 1.2 );

		const markers = buildGeometryMarkers( geometry, {
			center: bounds.center,
			scale,
			visibility: { ref: true, com: true, pivot: false },
		} );

		expect( markers ).toHaveLength( 2 );
		expect( markers.map( ( marker ) => marker.key ) ).toEqual( [
			'ref',
			'com',
		] );
		expect( markers[ 0 ] ).toMatchObject( {
			label: 'Reference Point',
			color: '#ef4444',
			radius: 0.01,
			position: {
				x: ( 2 - 5 ) * scale,
				y: ( 4 - 0 ) * scale,
				z: ( 3 - 0 ) * scale,
			},
		} );
		expect( markers[ 1 ] ).toMatchObject( {
			label: 'Center of Mass',
			color: '#22c55e',
			radius: 0.01,
			position: {
				x: ( 3 - 5 ) * scale,
				y: ( 5 - 0 ) * scale,
				z: ( 4 - 0 ) * scale,
			},
		} );
	} );
} );

describe( 'geometry orientation utilities', () => {
	it( 'resolves HVR values from placement rotation aliases', () => {
		expect(
			getEulerHvr( {
				Yaw: 10,
				Elevation: 20,
				R: 30,
			} )
		).toEqual( {
			heading: 10,
			vertical: 20,
			roll: 30,
		} );
	} );

	it( 'returns null when a rotation object has no HVR values', () => {
		expect( getEulerHvr( { X: 10, Y: 20, Z: 30 } ) ).toBeNull();
	} );

	it( 'converts identity HVR rotation to an identity quaternion', () => {
		expect(
			eulerHvrToQuaternion( { H: 0, V: 0, R: 0 } )
		).toMatchObject( {
			x: 0,
			y: 0,
			z: 0,
			w: 1,
		} );
	} );

	it( 'maps positive GLL heading to negative Three.js Y-axis rotation', () => {
		const quaternion = eulerHvrToQuaternion( { H: 90, V: 0, R: 0 } );
		const half = Math.sqrt( 0.5 );

		expect( quaternion ).toEqual( {
			x: expect.closeTo( 0 ),
			y: expect.closeTo( -half ),
			z: expect.closeTo( 0 ),
			w: expect.closeTo( half ),
		} );
	} );

	it( 'maps positive GLL vertical and roll rotations to converted view axes', () => {
		const vertical = eulerHvrToQuaternion( { H: 0, V: 90, R: 0 } );
		const roll = eulerHvrToQuaternion( { H: 0, V: 0, R: 90 } );
		const half = Math.sqrt( 0.5 );

		expect( vertical ).toEqual( {
			x: expect.closeTo( 0 ),
			y: expect.closeTo( 0 ),
			z: expect.closeTo( -half ),
			w: expect.closeTo( half ),
		} );
		expect( roll ).toEqual( {
			x: expect.closeTo( -half ),
			y: expect.closeTo( 0 ),
			z: expect.closeTo( 0 ),
			w: expect.closeTo( half ),
		} );
	} );
} );
