/**
 * Tests for the geometry scene builder.
 *
 * `three` is imported directly rather than through the `../shared` barrel: the
 * barrel pulls in `three-wrapper`, whose `three/addons` import is untransformed
 * ESM and cannot be parsed by Jest.
 *
 * jsdom has no 2D canvas backend, and merely calling `getContext( '2d' )` makes
 * it emit a "not implemented" jsdomError that `@wordpress/jest-console` turns
 * into a test failure. The label tests therefore install a hand-rolled context
 * stub; the un-stubbed case is covered separately by forcing `getContext` to
 * return null, which is the same signal a real browser gives when a context
 * cannot be created.
 *
 * @package
 */

import * as THREE from 'three';
import {
	buildGeometryGroup,
	buildSourceCones,
	disposeSceneObject,
} from './scene-builder';
import type { SourceConeOptions } from './scene-builder';
import { sourcePlacementOrientation } from '../shared/geometry-utils';
import type { GllTheme } from '../shared/resolve-theme';

const THEME: GllTheme = {
	text: '#333333',
	textMuted: '#666666',
	border: '#e0e0e0',
	accent: '#667eea',
	surface: '#ffffff',
	isDark: false,
};

const CENTER = { x: 0, y: 0, z: 0 };

/**
 * Minimal source cone options with no labels, for the pure geometry tests.
 *
 * @param placements Placements to draw.
 * @param extra      Overrides.
 * @return Options.
 */
function coneOptions(
	placements: any[],
	extra: Partial< SourceConeOptions > = {}
): SourceConeOptions {
	return {
		placements,
		center: CENTER,
		scale: 1,
		theme: THEME,
		showLabels: false,
		...extra,
	};
}

/**
 * A placement at the origin, aimed straight ahead unless told otherwise.
 *
 * @param overrides Fields to replace.
 * @return Placement.
 */
function placement( overrides: any = {} ) {
	return {
		Label: 'LF',
		Key: 'p1',
		SourceDefinitionKey: 'src-1',
		Position: { x: 0, y: 0, z: 0 },
		Rotation: { Heading: 0, Vertical: 0, Roll: 0 },
		...overrides,
	};
}

/**
 * Every solid (non-wireframe) cone mesh of a group.
 *
 * @param group Cone group.
 * @return Meshes.
 */
function fillMeshes( group: THREE.Group ): THREE.Mesh[] {
	return group.children.filter(
		( child ) =>
			( child as any ).isMesh &&
			child.userData.gllSourceWireframe === false
	) as THREE.Mesh[];
}

/**
 * Install a 2D context stub on HTMLCanvasElement.
 *
 * @return The jest spy, for restoration.
 */
function stubCanvasContext() {
	const context = {
		font: '',
		textAlign: '',
		textBaseline: '',
		fillStyle: '',
		strokeStyle: '',
		lineWidth: 1,
		measureText: () => ( { width: 48 } ),
		scale: () => undefined,
		beginPath: () => undefined,
		moveTo: () => undefined,
		lineTo: () => undefined,
		quadraticCurveTo: () => undefined,
		closePath: () => undefined,
		fill: () => undefined,
		stroke: () => undefined,
		fillText: () => undefined,
	};

	return jest
		.spyOn( window.HTMLCanvasElement.prototype, 'getContext' )
		.mockReturnValue( context as any );
}

afterEach( () => {
	jest.restoreAllMocks();
} );

describe( 'buildSourceCones', () => {
	it( 'returns null without placements', () => {
		expect( buildSourceCones( coneOptions( [] ) ) ).toBeNull();
	} );

	it( 'builds a fill and a wireframe cone per placement', () => {
		const group = buildSourceCones(
			coneOptions( [
				placement( { Key: 'a' } ),
				placement( { Key: 'b', Position: { x: 1, y: 2, z: 3 } } ),
			] )
		);

		expect( group ).not.toBeNull();
		expect( fillMeshes( group as THREE.Group ) ).toHaveLength( 2 );
		expect( ( group as THREE.Group ).children ).toHaveLength( 4 );
	} );

	it( 'skips placements without a position', () => {
		const group = buildSourceCones(
			coneOptions( [
				placement( { Key: 'a' } ),
				placement( { Key: 'b', Position: null } ),
			] )
		);

		expect( fillMeshes( group as THREE.Group ) ).toHaveLength( 1 );
	} );

	it( 'shares one geometry across every cone', () => {
		const group = buildSourceCones(
			coneOptions( [
				placement( { Key: 'a' } ),
				placement( { Key: 'b' } ),
			] )
		) as THREE.Group;

		const geometries = new Set(
			group.children.map( ( child ) => ( child as THREE.Mesh ).geometry )
		);
		expect( geometries.size ).toBe( 1 );
	} );

	it( 'puts the apex of the unit cone at the local origin, nose along +Z', () => {
		const group = buildSourceCones(
			coneOptions( [ placement() ] )
		) as THREE.Group;
		const geometry = ( group.children[ 0 ] as THREE.Mesh ).geometry;
		const position = geometry.getAttribute( 'position' );

		let minZ = Infinity;
		let maxZ = -Infinity;
		let apexOffAxis = 0;
		for ( let i = 0; i < position.count; i++ ) {
			const x = position.getX( i );
			const y = position.getY( i );
			const z = position.getZ( i );
			minZ = Math.min( minZ, z );
			maxZ = Math.max( maxZ, z );
			if ( Math.abs( z ) < 1e-6 ) {
				apexOffAxis = Math.max( apexOffAxis, Math.hypot( x, y ) );
			}
		}

		expect( minZ ).toBeCloseTo( 0, 6 );
		expect( maxZ ).toBeCloseTo( 1, 6 );
		// Everything at the tip sits exactly on the axis.
		expect( apexOffAxis ).toBeCloseTo( 0, 6 );
	} );

	it( 'lands the apex on the transformed position and aims along forward', () => {
		const rotation = { Heading: Math.PI / 3, Vertical: 0.4, Roll: 0.2 };
		const raw = { x: 0.3, y: -0.2, z: 0.5 };
		const height = 0.2;

		const group = buildSourceCones(
			coneOptions(
				[ placement( { Position: raw, Rotation: rotation } ) ],
				{
					center: { x: 0.1, y: 0.05, z: -0.2 },
					scale: 2,
					height,
				}
			)
		) as THREE.Group;

		const mesh = fillMeshes( group )[ 0 ];
		mesh.updateMatrixWorld( true );

		const apex = new THREE.Vector3( 0, 0, 0 ).applyMatrix4(
			mesh.matrixWorld
		);
		// transformGeometryPoint: view swap (x, y, z) -> (x, z, y), then
		// (point - center) * scale.
		expect( apex.x ).toBeCloseTo( ( 0.3 - 0.1 ) * 2, 6 );
		expect( apex.y ).toBeCloseTo( ( 0.5 - 0.05 ) * 2, 6 );
		expect( apex.z ).toBeCloseTo( ( -0.2 - -0.2 ) * 2, 6 );

		const baseCenter = new THREE.Vector3( 0, 0, 1 ).applyMatrix4(
			mesh.matrixWorld
		);
		const axis = baseCenter.clone().sub( apex );
		expect( axis.length() ).toBeCloseTo( height, 6 );

		const orientation = sourcePlacementOrientation( rotation );
		const forward = axis.normalize();
		expect( forward.x ).toBeCloseTo( orientation!.forward.x, 6 );
		expect( forward.y ).toBeCloseTo( orientation!.forward.y, 6 );
		expect( forward.z ).toBeCloseTo( orientation!.forward.z, 6 );
	} );

	it( 'falls back to view +Z when the placement has no rotation', () => {
		const group = buildSourceCones(
			coneOptions( [ placement( { Rotation: null } ) ] )
		) as THREE.Group;

		const mesh = fillMeshes( group )[ 0 ];
		expect( mesh.quaternion.equals( new THREE.Quaternion() ) ).toBe( true );
	} );
} );

describe( 'source cone apertures', () => {
	const height = 0.14;

	/**
	 * The half-widths of the first cone's base.
	 *
	 * @param options Cone options.
	 * @return Mesh scale.
	 */
	function scaleOf( options: SourceConeOptions ): THREE.Vector3 {
		const group = buildSourceCones( options ) as THREE.Group;
		return fillMeshes( group )[ 0 ].scale;
	}

	it( 'prefers the rated angles of the source definition', () => {
		const scale = scaleOf(
			coneOptions( [ placement() ], {
				sourceDefinitions: [
					{
						Key: 'src-1',
						Definition: {
							RatedHorizontalAngle: 90,
							RatedVerticalAngle: 60,
						},
					},
				],
				boxOpeningAngles: { horizontal: 120, vertical: 120 },
				height,
			} )
		);

		expect( scale.x ).toBeCloseTo( height * Math.tan( Math.PI / 4 ), 9 );
		expect( scale.y ).toBeCloseTo( height * Math.tan( Math.PI / 6 ), 9 );
		expect( scale.z ).toBeCloseTo( height, 9 );
	} );

	it( 'falls back to the box opening angles', () => {
		const scale = scaleOf(
			coneOptions( [ placement() ], {
				sourceDefinitions: [ { Key: 'src-1', Definition: {} } ],
				boxOpeningAngles: { horizontal: 90, vertical: 90 },
				height,
			} )
		);

		expect( scale.x ).toBeCloseTo( height * Math.tan( Math.PI / 4 ), 9 );
		expect( scale.y ).toBeCloseTo( height * Math.tan( Math.PI / 4 ), 9 );
	} );

	it( 'treats a literal zero as absent, in both rules', () => {
		const withZeroRated = scaleOf(
			coneOptions( [ placement() ], {
				sourceDefinitions: [
					{
						Key: 'src-1',
						Definition: {
							RatedHorizontalAngle: 0,
							RatedVerticalAngle: 0,
						},
					},
				],
				boxOpeningAngles: { horizontal: 90, vertical: 90 },
				height,
			} )
		);
		expect( withZeroRated.x ).toBeCloseTo(
			height * Math.tan( Math.PI / 4 ),
			9
		);

		const fallback = height * Math.tan( Math.atan( 0.06 / 0.14 ) );
		const withZeroBox = scaleOf(
			coneOptions( [ placement() ], {
				boxOpeningAngles: { horizontal: 0, vertical: 0 },
				height,
			} )
		);
		expect( withZeroBox.x ).toBeCloseTo( fallback, 9 );
		expect( withZeroBox.y ).toBeCloseTo( fallback, 9 );
	} );

	it( 'uses the reference silhouette when nothing declares an angle', () => {
		const scale = scaleOf( coneOptions( [ placement() ], { height } ) );
		expect( scale.x ).toBeCloseTo( 0.06, 9 );
		expect( scale.y ).toBeCloseTo( 0.06, 9 );
		expect( scale.z ).toBeCloseTo( 0.14, 9 );
	} );

	it( 'ignores out-of-range angles and clamps wide ones', () => {
		const outOfRange = scaleOf(
			coneOptions( [ placement() ], {
				sourceDefinitions: [
					{
						Key: 'src-1',
						Definition: {
							RatedHorizontalAngle: 180,
							RatedVerticalAngle: -30,
						},
					},
				],
				height,
			} )
		);
		expect( outOfRange.x ).toBeCloseTo( 0.06, 9 );
		expect( outOfRange.y ).toBeCloseTo( 0.06, 9 );

		const clamped = scaleOf(
			coneOptions( [ placement() ], {
				sourceDefinitions: [
					{
						Key: 'src-1',
						Definition: {
							RatedHorizontalAngle: 179,
							RatedVerticalAngle: 179,
						},
					},
				],
				height,
			} )
		);
		const max = height * Math.tan( ( 170 * Math.PI ) / 360 );
		expect( clamped.x ).toBeCloseTo( max, 9 );
		expect( Number.isFinite( clamped.x ) ).toBe( true );
	} );

	it( 'scales non-uniformly only when the two angles differ', () => {
		const elliptical = scaleOf(
			coneOptions( [ placement() ], {
				boxOpeningAngles: { horizontal: 90, vertical: 40 },
				height,
			} )
		);
		expect( elliptical.x ).not.toBeCloseTo( elliptical.y, 6 );

		const circular = scaleOf(
			coneOptions( [ placement() ], {
				boxOpeningAngles: { horizontal: 90, vertical: 90 },
				height,
			} )
		);
		expect( circular.x ).toBeCloseTo( circular.y, 9 );
	} );

	it( 'resolves an unknown source key through the box angles', () => {
		const scale = scaleOf(
			coneOptions( [ placement( { SourceDefinitionKey: 'nope' } ) ], {
				sourceDefinitions: [
					{
						Key: 'src-1',
						Definition: { RatedHorizontalAngle: 120 },
					},
				],
				boxOpeningAngles: { horizontal: 90, vertical: 90 },
				height,
			} )
		);
		expect( scale.x ).toBeCloseTo( height * Math.tan( Math.PI / 4 ), 9 );
	} );
} );

describe( 'source cone materials', () => {
	it( 'shares one material per source definition key', () => {
		const group = buildSourceCones(
			coneOptions(
				[
					placement( { Key: 'a', SourceDefinitionKey: 'src-1' } ),
					placement( { Key: 'b', SourceDefinitionKey: 'src-1' } ),
					placement( { Key: 'c', SourceDefinitionKey: 'src-2' } ),
				],
				{
					sourceDefinitions: [
						{ Key: 'src-1', Definition: {} },
						{ Key: 'src-2', Definition: {} },
					],
				}
			)
		) as THREE.Group;

		const [ a, b, c ] = fillMeshes( group );
		expect( a.material ).toBe( b.material );
		expect( a.material ).not.toBe( c.material );
	} );

	it( 'gives an unresolvable placement the theme accent', () => {
		const group = buildSourceCones(
			coneOptions( [ placement( { SourceDefinitionKey: 'nope' } ) ] )
		) as THREE.Group;

		const mesh = fillMeshes( group )[ 0 ];
		expect( mesh.userData.gllSourceColor ).toBe( '#667eea' );
	} );

	it( 'keys the hue on the definition, not the placement order', () => {
		const definitions = [
			{ Key: 'src-1', Definition: {} },
			{ Key: 'src-2', Definition: {} },
		];
		const first = buildSourceCones(
			coneOptions( [ placement( { SourceDefinitionKey: 'src-2' } ) ], {
				sourceDefinitions: definitions,
			} )
		) as THREE.Group;
		const second = buildSourceCones(
			coneOptions(
				[
					placement( { Key: 'a', SourceDefinitionKey: 'src-1' } ),
					placement( { Key: 'b', SourceDefinitionKey: 'src-2' } ),
				],
				{ sourceDefinitions: definitions }
			)
		) as THREE.Group;

		expect( fillMeshes( first )[ 0 ].userData.gllSourceColor ).toBe(
			fillMeshes( second )[ 1 ].userData.gllSourceColor
		);
	} );

	it( 'uses unlit, translucent, double-sided materials', () => {
		const group = buildSourceCones(
			coneOptions( [ placement() ] )
		) as THREE.Group;
		const mesh = fillMeshes( group )[ 0 ];
		const material = mesh.material as THREE.MeshBasicMaterial;

		expect( material.type ).toBe( 'MeshBasicMaterial' );
		expect( material.transparent ).toBe( true );
		expect( material.opacity ).toBeCloseTo( 0.22, 6 );
		expect( material.side ).toBe( THREE.DoubleSide );
		expect( material.depthWrite ).toBe( false );
		expect( mesh.renderOrder ).toBe( 5 );

		const wire = group.children.find(
			( child ) => child.userData.gllSourceWireframe === true
		) as THREE.Mesh;
		const wireMaterial = wire.material as THREE.MeshBasicMaterial;
		expect( wireMaterial.wireframe ).toBe( true );
		expect( wireMaterial.opacity ).toBeCloseTo( 0.6, 6 );
	} );
} );

describe( 'source cone labels', () => {
	it( 'adds one sprite per labelled placement', () => {
		stubCanvasContext();

		const group = buildSourceCones(
			coneOptions( [ placement( { Label: 'LF' } ) ], {
				showLabels: true,
			} )
		) as THREE.Group;

		const sprites = group.children.filter(
			( child ) => ( child as any ).isSprite
		) as THREE.Sprite[];
		expect( sprites ).toHaveLength( 1 );

		const sprite = sprites[ 0 ];
		expect( sprite.renderOrder ).toBe( 10 );
		expect( sprite.scale.y ).toBeCloseTo( 0.055, 6 );
		// Width follows the canvas aspect, so the text is never stretched.
		expect( sprite.scale.x ).toBeGreaterThan( sprite.scale.y );

		const material = sprite.material as THREE.SpriteMaterial;
		expect( material.transparent ).toBe( true );
		expect( material.depthTest ).toBe( false );
		expect( material.depthWrite ).toBe( false );
		expect( material.map ).toBeInstanceOf( THREE.CanvasTexture );
		expect( material.map!.colorSpace ).toBe( THREE.SRGBColorSpace );
		expect( material.map!.minFilter ).toBe( THREE.LinearFilter );
		expect( material.map!.generateMipmaps ).toBe( false );
	} );

	it( 'places the label ahead of the apex along forward', () => {
		stubCanvasContext();

		const height = 0.2;
		const group = buildSourceCones(
			coneOptions(
				[
					placement( {
						Position: { x: 0, y: 0, z: 0 },
						Rotation: { Heading: 0, Vertical: 0, Roll: 0 },
					} ),
				],
				{ showLabels: true, height }
			)
		) as THREE.Group;

		const sprite = group.children.find(
			( child ) => ( child as any ).isSprite
		) as THREE.Sprite;
		expect( sprite.position.x ).toBeCloseTo( 0, 6 );
		expect( sprite.position.y ).toBeCloseTo( 0, 6 );
		expect( sprite.position.z ).toBeCloseTo( height * 1.25, 6 );
	} );

	it( 'falls back through label, definition label and key', () => {
		stubCanvasContext();

		const group = buildSourceCones(
			coneOptions(
				[
					placement( { Key: 'p1', Label: '' } ),
					placement( { Key: 'p2', Label: undefined } ),
				],
				{
					showLabels: true,
					sourceDefinitions: [
						{ Key: 'src-1', Label: 'Woofer', Definition: {} },
					],
				}
			)
		) as THREE.Group;

		expect(
			group.children.filter( ( child ) => ( child as any ).isSprite )
		).toHaveLength( 2 );
	} );

	it( 'draws no sprites when labels are off', () => {
		const group = buildSourceCones(
			coneOptions( [ placement() ], { showLabels: false } )
		) as THREE.Group;

		expect(
			group.children.some( ( child ) => ( child as any ).isSprite )
		).toBe( false );
	} );

	it( 'degrades to no labels when no 2D context is available', () => {
		jest.spyOn(
			window.HTMLCanvasElement.prototype,
			'getContext'
		).mockReturnValue( null );

		const group = buildSourceCones(
			coneOptions( [ placement() ], { showLabels: true } )
		) as THREE.Group;

		expect( group ).not.toBeNull();
		expect( fillMeshes( group ) ).toHaveLength( 1 );
		expect(
			group.children.some( ( child ) => ( child as any ).isSprite )
		).toBe( false );
	} );
} );

describe( 'buildGeometryGroup with sources', () => {
	const geometryData = {
		positions: new Float32Array( [ 0, 0, 0, 1, 0, 0, 0, 1, 0 ] ),
		colors: new Float32Array( [ 1, 1, 1, 1, 1, 1, 1, 1, 1 ] ),
		indices: new Uint32Array( [ 0, 1, 2 ] ),
		edgePositions: new Float32Array( [ 0, 0, 0, 1, 0, 0 ] ),
		edgeColors: new Float32Array( [ 1, 1, 1, 1, 1, 1 ] ),
		stats: { vertexCount: 3, faceCount: 1, edgeCount: 1 },
	};

	it( 'omits the cone group when no sources are given', () => {
		const group = buildGeometryGroup( {
			geometryData,
			markers: [],
			showFaces: true,
			showEdges: true,
		} ) as THREE.Group;

		expect( group.getObjectByName( 'gll-source-cones' ) ).toBeUndefined();
	} );

	it( 'adds the cone group when sources are given', () => {
		const group = buildGeometryGroup( {
			geometryData,
			markers: [],
			showFaces: true,
			showEdges: true,
			sources: coneOptions( [ placement() ] ),
		} ) as THREE.Group;

		const cones = group.getObjectByName( 'gll-source-cones' );
		expect( cones ).toBeDefined();
		expect( fillMeshes( cones as THREE.Group ) ).toHaveLength( 1 );
	} );

	it( 'tolerates a null sources option', () => {
		const group = buildGeometryGroup( {
			geometryData,
			markers: [],
			showFaces: true,
			showEdges: true,
			sources: null,
		} ) as THREE.Group;

		expect( group.getObjectByName( 'gll-source-cones' ) ).toBeUndefined();
	} );
} );

describe( 'disposeSceneObject', () => {
	it( 'disposes shared cone resources exactly once and drains the list', () => {
		const group = buildSourceCones(
			coneOptions( [
				placement( { Key: 'a' } ),
				placement( { Key: 'b' } ),
				placement( { Key: 'c' } ),
			] )
		) as THREE.Group;

		const owned = group.userData.gllOwnedResources as any[];
		// The shared cone geometry plus the fill and wireframe materials.
		expect( owned ).toHaveLength( 3 );
		const spies = owned.map( ( resource ) =>
			jest.spyOn( resource, 'dispose' )
		);

		const parent = new THREE.Group();
		parent.add( group );

		disposeSceneObject( group );

		spies.forEach( ( spy ) => expect( spy ).toHaveBeenCalledTimes( 1 ) );
		expect( owned ).toHaveLength( 0 );
		expect( group.parent ).toBeNull();
	} );

	it( 'disposes a sprite map before its material and never its geometry', () => {
		stubCanvasContext();

		const group = buildSourceCones(
			coneOptions( [ placement() ], { showLabels: true } )
		) as THREE.Group;

		const sprite = group.children.find(
			( child ) => ( child as any ).isSprite
		) as THREE.Sprite;
		const material = sprite.material as THREE.SpriteMaterial;
		const texture = material.map as THREE.CanvasTexture;

		const order: string[] = [];
		jest.spyOn( texture, 'dispose' ).mockImplementation( () => {
			order.push( 'map' );
		} );
		jest.spyOn( material, 'dispose' ).mockImplementation( () => {
			order.push( 'material' );
		} );
		const geometrySpy = jest.spyOn( sprite.geometry, 'dispose' );

		disposeSceneObject( group );

		expect( order ).toEqual( [ 'map', 'material' ] );
		expect( geometrySpy ).not.toHaveBeenCalled();
	} );

	it( 'disposes duck-typed nodes the instanceof chain missed', () => {
		const root = new THREE.Group();
		const geometry = new THREE.BufferGeometry();
		const material = new THREE.PointsMaterial();
		root.add( new THREE.Points( geometry, material ) );

		const geometrySpy = jest.spyOn( geometry, 'dispose' );
		const materialSpy = jest.spyOn( material, 'dispose' );

		disposeSceneObject( root );

		expect( geometrySpy ).toHaveBeenCalledTimes( 1 );
		expect( materialSpy ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'disposes every material of a multi-material mesh', () => {
		const root = new THREE.Group();
		const materials = [
			new THREE.MeshBasicMaterial(),
			new THREE.MeshBasicMaterial(),
		];
		root.add( new THREE.Mesh( new THREE.BufferGeometry(), materials ) );

		const spies = materials.map( ( item ) =>
			jest.spyOn( item, 'dispose' )
		);

		disposeSceneObject( root );

		spies.forEach( ( spy ) => expect( spy ).toHaveBeenCalledTimes( 1 ) );
	} );
} );
