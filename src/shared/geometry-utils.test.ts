import {
	buildGeometryMarkers,
	computeBounds,
	computeScaleFactor,
	getCaseGeometryVertices,
	getCenterOfMassPoint,
	getEulerHvr,
	getNextPivotPoint,
	sourcePlacementOrientation,
	toViewPoint,
} from './geometry-utils';
import type { GeometryVertex } from './geometry-utils';

const HALF = Math.sqrt( 0.5 );

function expectVertex( actual: GeometryVertex, expected: GeometryVertex ) {
	expect( actual.x ).toBeCloseTo( expected.x, 12 );
	expect( actual.y ).toBeCloseTo( expected.y, 12 );
	expect( actual.z ).toBeCloseTo( expected.z, 12 );
}

function dot( a: GeometryVertex, b: GeometryVertex ): number {
	return a.x * b.x + a.y * b.y + a.z * b.z;
}

/**
 * Determinant of the matrix whose columns are the given vectors.
 *
 * @param a First column.
 * @param b Second column.
 * @param c Third column.
 * @return The determinant.
 */
function determinant(
	a: GeometryVertex,
	b: GeometryVertex,
	c: GeometryVertex
): number {
	return (
		a.x * ( b.y * c.z - b.z * c.y ) -
		b.x * ( a.y * c.z - a.z * c.y ) +
		c.x * ( a.y * b.z - a.z * b.y )
	);
}

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
		// Through the case-tolerant extractor, not straight off `Vertices`:
		// `toViewPoint` reads lowercase x/y/z, so handing it the PascalCase
		// records the normalizer emits yields undefined on every axis. That
		// made the bounds NaN and every position assertion below a vacuous
		// NaN-to-NaN comparison, which is how it passed while testing nothing.
		const viewVertices =
			getCaseGeometryVertices( geometry ).map( toViewPoint );
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

	it( 'returns null for missing or unusable rotation input', () => {
		expect( sourcePlacementOrientation( null ) ).toBeNull();
		expect( sourcePlacementOrientation( undefined ) ).toBeNull();
		expect( sourcePlacementOrientation( 'not a rotation' ) ).toBeNull();
		expect( sourcePlacementOrientation( { X: 1, Y: 2, Z: 3 } ) ).toBeNull();
	} );

	it( 'maps identity HVR to an identity quaternion aiming along view +Z', () => {
		const orientation = sourcePlacementOrientation( { H: 0, V: 0, R: 0 } );

		expect( orientation ).not.toBeNull();
		// GLL aims along local +Y; the (x, y, z) -> (x, z, y) view swap sends
		// (0, 1, 0) to (0, 0, 1), so the aim vector is view +Z, not view +Y.
		expectVertex( orientation!.forward, { x: 0, y: 0, z: 1 } );
		expectVertex( orientation!.right, { x: 1, y: 0, z: 0 } );
		expectVertex( orientation!.up, { x: 0, y: 1, z: 0 } );
		expect( orientation!.quaternion ).toEqual( {
			x: 0,
			y: 0,
			z: 0,
			w: 1,
		} );
	} );

	it( 'maps H = PI/2 to a positive 90 degree rotation about view Y', () => {
		// Deliberately contradicts the removed eulerHvrToQuaternion test, which
		// asserted a NEGATIVE Y rotation for H = 90. That test read the angle as
		// degrees and inverted the sign of the authoritative rotation matrix.
		// GLL placement angles are radians: gll-tools docs/format.md:175.
		const orientation = sourcePlacementOrientation( {
			H: Math.PI / 2,
			V: 0,
			R: 0,
		} );

		expect( orientation ).not.toBeNull();
		// In GLL space H = PI/2 turns local +Y onto +X; the view swap keeps
		// (1, 0, 0) as (1, 0, 0).
		expectVertex( orientation!.forward, { x: 1, y: 0, z: 0 } );
		expectVertex( orientation!.up, { x: 0, y: 1, z: 0 } );
		expectVertex( orientation!.right, { x: 0, y: 0, z: -1 } );
		// Basis columns ( right, up, forward ) form the +90 degree view-Y matrix.
		expect( orientation!.quaternion.x ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.y ).toBeCloseTo( HALF, 12 );
		expect( orientation!.quaternion.z ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.w ).toBeCloseTo( HALF, 12 );
	} );

	it( 'maps V = PI/2 to a negative 90 degree rotation about view X', () => {
		const orientation = sourcePlacementOrientation( {
			H: 0,
			V: Math.PI / 2,
			R: 0,
		} );

		expect( orientation ).not.toBeNull();
		// GLL local +Y tilts onto GLL +Z ( up ), which the swap sends to view +Y.
		expectVertex( orientation!.forward, { x: 0, y: 1, z: 0 } );
		expectVertex( orientation!.right, { x: 1, y: 0, z: 0 } );
		expectVertex( orientation!.up, { x: 0, y: 0, z: -1 } );
		expect( orientation!.quaternion.x ).toBeCloseTo( -HALF, 12 );
		expect( orientation!.quaternion.y ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.z ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.w ).toBeCloseTo( HALF, 12 );
	} );

	it( 'rolls about the aim axis without moving the forward vector', () => {
		const orientation = sourcePlacementOrientation( {
			H: 0,
			V: 0,
			R: Math.PI / 2,
		} );

		expect( orientation ).not.toBeNull();
		expectVertex( orientation!.forward, { x: 0, y: 0, z: 1 } );
		// Right and up spin a quarter turn around that unchanged aim axis.
		expectVertex( orientation!.right, { x: 0, y: -1, z: 0 } );
		expectVertex( orientation!.up, { x: 1, y: 0, z: 0 } );
		// A -90 degree rotation about view Z, i.e. about the forward axis.
		expect( orientation!.quaternion.x ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.y ).toBeCloseTo( 0, 12 );
		expect( orientation!.quaternion.z ).toBeCloseTo( -HALF, 12 );
		expect( orientation!.quaternion.w ).toBeCloseTo( HALF, 12 );
	} );

	it( 'auto-detects degrees only for angles too large to be radians', () => {
		const asDegrees = sourcePlacementOrientation( { H: 90, V: 0, R: 0 } );
		const asRadians = sourcePlacementOrientation( {
			H: Math.PI / 2,
			V: 0,
			R: 0,
		} );

		expect( asDegrees ).not.toBeNull();
		expect( asRadians ).not.toBeNull();
		expectVertex( asDegrees!.forward, asRadians!.forward );
		expectVertex( asDegrees!.right, asRadians!.right );
		expectVertex( asDegrees!.up, asRadians!.up );

		// 1.57 stays radians, and forcing units overrides the heuristic.
		const small = sourcePlacementOrientation( { H: 1.57, V: 0, R: 0 } );
		expect( small!.forward.x ).toBeCloseTo( Math.sin( 1.57 ), 12 );
		expect( small!.forward.z ).toBeCloseTo( Math.cos( 1.57 ), 12 );

		const forcedDegrees = sourcePlacementOrientation(
			{ H: 1.57, V: 0, R: 0 },
			{ units: 'degrees' }
		);
		expect( forcedDegrees!.forward.x ).toBeCloseTo(
			Math.sin( ( 1.57 * Math.PI ) / 180 ),
			12
		);

		const forcedRadians = sourcePlacementOrientation(
			{ H: 90, V: 0, R: 0 },
			{ units: 'radians' }
		);
		expect( forcedRadians!.forward.x ).toBeCloseTo( Math.sin( 90 ), 12 );
	} );

	it( 'produces a right-handed orthonormal basis for an arbitrary HVR triple', () => {
		const orientation = sourcePlacementOrientation( {
			H: 0.3,
			V: -0.7,
			R: 1.1,
		} );

		expect( orientation ).not.toBeNull();
		const { right, up, forward } = orientation!;

		[ right, up, forward ].forEach( ( axis ) => {
			expect( Math.hypot( axis.x, axis.y, axis.z ) ).toBeCloseTo( 1, 12 );
		} );

		expect( dot( right, up ) ).toBeCloseTo( 0, 12 );
		expect( dot( right, forward ) ).toBeCloseTo( 0, 12 );
		expect( dot( up, forward ) ).toBeCloseTo( 0, 12 );
		expect( determinant( right, up, forward ) ).toBeCloseTo( 1, 12 );

		const { x, y, z, w } = orientation!.quaternion;
		expect( Math.hypot( x, y, z, w ) ).toBeCloseTo( 1, 12 );
	} );
} );
