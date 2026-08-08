/**
 * Build the Three.js object graph for the geometry scene.
 *
 * The editor and the frontend view script render the same case geometry through
 * different hosts — the editor via the shared `GeometryViewer` React component,
 * the frontend via its own hand-rolled renderer — but the objects they put in
 * the scene must be identical, or a block would look different once published.
 * They therefore share this builder rather than each assembling meshes their
 * own way.
 *
 * This lives next to the block instead of in `src/shared/` on purpose.
 * `src/shared/geometry-utils.ts` is deliberately free of any `three` import,
 * which is what keeps it testable under jsdom; the numbers it produces are
 * turned into scene objects only here. `helper-theme.ts` sits here for the same
 * reason, and the only consumers of either are this block's two entry points.
 *
 * @package
 */

import * as THREE from 'three';
import type {
	GeometryBuildResult,
	GeometryMarker,
} from '../shared/geometry-utils';

/**
 * Everything needed to assemble the geometry group.
 */
export interface GeometrySceneOptions {
	/** Mesh buffers produced by `buildCaseGeometryData`, already transformed. */
	geometryData: GeometryBuildResult | null;
	/**
	 * Marker spheres produced by `buildGeometryMarkers`. Read-only so callers
	 * can pass a shared frozen empty array as their stable "no markers" value.
	 */
	markers: readonly GeometryMarker[];
	/** Render the solid case faces. */
	showFaces: boolean;
	/** Render the case edge overlay. */
	showEdges: boolean;
}

/**
 * Add the solid case mesh to a group.
 *
 * @param group        Group to add to.
 * @param geometryData Transformed mesh buffers.
 */
function addFaces( group: THREE.Group, geometryData: GeometryBuildResult ) {
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

	group.add( new THREE.Mesh( geometry, material ) );
}

/**
 * Add the case edge overlay to a group.
 *
 * @param group        Group to add to.
 * @param geometryData Transformed mesh buffers.
 */
function addEdges( group: THREE.Group, geometryData: GeometryBuildResult ) {
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

	group.add( new THREE.LineSegments( edgeGeometry, edgeMaterial ) );
}

/**
 * Add the reference / center-of-mass / pivot marker spheres to a group.
 *
 * Each sphere carries its key and label in `userData` so a picker can identify
 * what was clicked without matching on the mesh name.
 *
 * @param group   Group to add to.
 * @param markers Markers to place.
 */
function addMarkers( group: THREE.Group, markers: readonly GeometryMarker[] ) {
	markers.forEach( ( marker ) => {
		const markerGeometry = new THREE.SphereGeometry(
			marker.radius,
			16,
			12
		);
		const markerMaterial = new THREE.MeshBasicMaterial( {
			color: marker.color,
		} );
		const markerMesh = new THREE.Mesh( markerGeometry, markerMaterial );
		markerMesh.name = `gll-marker-${ marker.key }`;
		markerMesh.userData = {
			gllMarkerKey: marker.key,
			gllMarkerLabel: marker.label,
		};
		markerMesh.position.set(
			marker.position.x,
			marker.position.y,
			marker.position.z
		);
		group.add( markerMesh );
	} );
}

/**
 * Build the group holding the case mesh, its edges and the markers.
 *
 * The caller owns the returned group: add it to a scene, and hand it back to
 * `disposeSceneObject` when the geometry changes or the viewer goes away.
 *
 * @param options What to build.
 * @return The group, or null when there is no geometry to show.
 */
export function buildGeometryGroup(
	options: GeometrySceneOptions
): THREE.Group | null {
	const { geometryData, markers, showFaces, showEdges } = options;

	if ( ! geometryData ) {
		return null;
	}

	const group = new THREE.Group();

	if ( showFaces && geometryData.indices.length > 0 ) {
		addFaces( group, geometryData );
	}

	if ( showEdges && geometryData.edgePositions.length > 0 ) {
		addEdges( group, geometryData );
	}

	addMarkers( group, markers );

	return group;
}

/**
 * Dispose a material, or every material of a multi-material object.
 *
 * @param material Material or material array.
 */
function disposeMaterial( material: THREE.Material | THREE.Material[] ) {
	if ( Array.isArray( material ) ) {
		material.forEach( ( item ) => item.dispose() );
		return;
	}
	material.dispose();
}

/**
 * Release the GPU resources an object graph holds and detach it from its
 * parent.
 *
 * @param object Root of the graph to dispose.
 */
export function disposeSceneObject( object: THREE.Object3D ) {
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
