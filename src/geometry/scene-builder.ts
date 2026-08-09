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
import {
	sourcePlacementOrientation,
	transformGeometryPoint,
} from '../shared/geometry-utils';
import type {
	GeometryAngleUnits,
	GeometryBuildResult,
	GeometryMarker,
	GeometryVertex,
} from '../shared/geometry-utils';
// Imported from the modules rather than the `../shared` barrel: the barrel also
// pulls in `three-wrapper`, whose `three/addons` import is untransformed ESM
// and cannot be loaded by Jest.
import { parseColor, withAlpha } from '../shared/resolve-theme';
import type { GllTheme } from '../shared/resolve-theme';

/**
 * Everything needed to assemble the acoustic source cones.
 *
 * The cone sizes are literal world units. The geometry group is never scaled —
 * the model scale factor is baked into the vertices by the `transform` callback
 * at the call sites — so a `height` of 0.14 against the 1.2-unit normalization
 * is roughly 12% of the cabinet's longest axis.
 */
export interface SourceConeOptions {
	/** Normalized `SourcePlacements[]` of the case geometry. */
	placements: any[];
	/** Normalized `Database.SourceDefinitions[]`, for rated angles and color. */
	sourceDefinitions?: any[];
	/** Per-box opening angles in degrees, used when a source has no rated pair. */
	boxOpeningAngles?: { horizontal?: number; vertical?: number };
	/** Model center, as handed to `transformGeometryPoint`. */
	center: GeometryVertex;
	/** Model scale factor, as handed to `transformGeometryPoint`. */
	scale: number;
	/** Resolved block theme. */
	theme: GllTheme;
	/** Cone length in world units. Defaults to 0.14. */
	height?: number;
	/** Draw the sprite labels. Defaults to true. */
	showLabels?: boolean;
	/** How to read the placement rotation triple. Defaults to 'auto'. */
	angleUnits?: GeometryAngleUnits;
}

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
	/** Acoustic source cones, or null/undefined to draw none. */
	sources?: SourceConeOptions | null;
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
	// Wrapped explicitly rather than handed over raw: `setIndex` only converts
	// a plain Array into a BufferAttribute and assigns anything else straight
	// through, so passing the Uint32Array would leave `geometry.index` as a
	// bare typed array that the renderer cannot read. No case geometry in the
	// reference corpus carries a face list, so this path has never run against
	// real data and the mistake stayed invisible until tsc flagged the type.
	geometry.setIndex(
		new THREE.BufferAttribute( geometryData.indices as Uint32Array, 1 )
	);
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
 * Default cone length in world units: ~12% of the 1.2-unit normalized model.
 */
const DEFAULT_CONE_HEIGHT = 0.14;

/**
 * Half-angle used when neither the source nor the box declares a coverage
 * angle. `atan( 0.06 / 0.14 )` reproduces the silhouette of the reference
 * viewer's fixed 0.06-radius, 0.14-long cone: ~46.4 degrees total.
 */
const FALLBACK_HALF_ANGLE = Math.atan( 0.06 / DEFAULT_CONE_HEIGHT );

/**
 * Largest total opening angle accepted, in degrees.
 *
 * A cone approaches a plane as the total angle approaches 180, and `tan` of the
 * half-angle runs away with it. 170 keeps the radius finite and the mesh sane.
 */
const MAX_OPENING_DEGREES = 170;

/**
 * Base hues for the first eight source definitions, in degrees.
 *
 * Hand-picked so adjacent drivers in a typical two- to four-way cabinet stay
 * distinguishable; beyond eight, a golden-angle walk takes over.
 */
const SOURCE_HUES = [ 210, 25, 145, 350, 275, 45, 190, 310 ];

/** Sprite label height in world units. */
const LABEL_WORLD_HEIGHT = 0.055;

/** Label type size on the backing canvas, in CSS pixels. */
const LABEL_FONT_SIZE = 28;

/** Label box padding on the backing canvas, in CSS pixels. */
const LABEL_PADDING_X = 12;
const LABEL_PADDING_Y = 7;

/**
 * Read an opening angle candidate, in degrees.
 *
 * Every underlying Go field is `omitempty`, so a literal `0` is indistinguishable
 * from an absent one and must be treated as absent. Values at or beyond a
 * half-space are meaningless for a cone, so the accepted range is the open
 * interval (0, 180); what survives is clamped so `tan` stays finite.
 *
 * @param value Raw candidate.
 * @return Total opening angle in degrees, or null when the value is unusable.
 */
function readOpeningDegrees( value: unknown ): number | null {
	const numeric = Number( value );
	if ( ! Number.isFinite( numeric ) || numeric <= 0 || numeric >= 180 ) {
		return null;
	}
	return Math.min( numeric, MAX_OPENING_DEGREES );
}

/**
 * Resolve the half-angles of one placement's cone, in radians.
 *
 * Precedence, per axis, is: the source definition's rated angle (the only
 * per-source figure, and the correct one), then the owning box's opening angle
 * (right only when the box holds a single source), then the fixed fallback.
 *
 * @param definition Resolved source definition, or undefined.
 * @param box        Per-box opening angles in degrees.
 * @return Horizontal and vertical half-angles in radians.
 */
function resolveHalfAngles(
	definition: any,
	box: { horizontal?: number; vertical?: number } | undefined
): { horizontal: number; vertical: number } {
	const rated = ( definition && definition.Definition ) || {};

	const pick = ( ratedValue: unknown, boxValue: unknown ): number => {
		const degrees =
			readOpeningDegrees( ratedValue ) ?? readOpeningDegrees( boxValue );
		if ( degrees === null ) {
			return FALLBACK_HALF_ANGLE;
		}
		return ( degrees * Math.PI ) / 360;
	};

	return {
		horizontal: pick( rated.RatedHorizontalAngle, box && box.horizontal ),
		vertical: pick( rated.RatedVerticalAngle, box && box.vertical ),
	};
}

/**
 * Convert HSL to a hex string.
 *
 * The cone palette is generated in HSL, but both `THREE.Color` and the label
 * canvas are happier with a plain hex literal — and going through hex keeps a
 * single normalization path for the theme-derived colors too.
 *
 * @param hue        Hue in degrees.
 * @param saturation Saturation 0-100.
 * @param lightness  Lightness 0-100.
 * @return `#rrggbb`.
 */
function hslToHex(
	hue: number,
	saturation: number,
	lightness: number
): string {
	const s = saturation / 100;
	const l = lightness / 100;
	const a = s * Math.min( l, 1 - l );
	const channel = ( n: number ) => {
		const k = ( n + hue / 30 ) % 12;
		const value =
			l - a * Math.max( -1, Math.min( k - 3, Math.min( 9 - k, 1 ) ) );
		return Math.round( value * 255 )
			.toString( 16 )
			.padStart( 2, '0' );
	};
	return `#${ channel( 0 ) }${ channel( 8 ) }${ channel( 4 ) }`;
}

/**
 * Normalize an arbitrary CSS color to a hex literal.
 *
 * `THREE.Color.setStyle` warns to the console on anything it cannot parse — and
 * a theme token is free to resolve to `color-mix()` — so exotic values are
 * turned into the supplied fallback instead.
 *
 * @param value    CSS color string.
 * @param fallback Hex literal to use when the value does not parse.
 * @return `#rrggbb`.
 */
function toHex( value: string, fallback: string ): string {
	const rgb = parseColor( value );
	if ( ! rgb ) {
		return fallback;
	}
	return `#${ rgb
		.map( ( part ) =>
			Math.round( Math.min( Math.max( part, 0 ), 255 ) )
				.toString( 16 )
				.padStart( 2, '0' )
		)
		.join( '' ) }`;
}

/**
 * The color of one source, keyed on its definition.
 *
 * Keying on the source definition rather than the placement index keeps a
 * driver's hue stable across geometries and across rebuilds, which is the whole
 * point of coloring the cones at all.
 *
 * @param index Position of the definition in `sourceDefinitions`, or -1.
 * @param theme Resolved theme.
 * @return `#rrggbb`.
 */
function sourceColor( index: number, theme: GllTheme ): string {
	if ( index < 0 ) {
		return toHex( theme.accent, '#667eea' );
	}
	const hue =
		index < SOURCE_HUES.length
			? SOURCE_HUES[ index ]
			: ( index * 137.508 ) % 360;
	return theme.isDark ? hslToHex( hue, 70, 62 ) : hslToHex( hue, 65, 45 );
}

/**
 * Build the unit cone shared by every cone in one group.
 *
 * The apex ends up at the local origin with the nose pointing down local +Z,
 * and the base sits at z = 1 with unit radius in x and y. Local (X, Y, Z) then
 * lines up with the columns of `sourcePlacementOrientation`'s quaternion, so
 * the mesh takes that quaternion directly with no correction term, and the
 * per-axis scale turns the circular cross-section into the elliptical one the
 * coverage angles describe.
 *
 * @return The unit cone geometry.
 */
function buildUnitCone(): THREE.ConeGeometry {
	const cone = new THREE.ConeGeometry( 1, 1, 24, 1, true );
	// Apex from +0.5Y to -0.5Y, then up to the origin, then the axis to +Z.
	cone.rotateX( Math.PI );
	cone.translate( 0, 0.5, 0 );
	cone.rotateX( Math.PI / 2 );
	return cone;
}

/**
 * Background fill for a label box.
 *
 * `withAlpha` hands back the input untouched when it cannot parse it, which is
 * exactly what a `transparent` surface does — and a transparent plate would
 * leave the text unreadable over the case — so that case gets an explicit
 * neutral instead.
 *
 * @param theme Resolved theme.
 * @return CSS color string.
 */
function labelBackground( theme: GllTheme ): string {
	const mixed = withAlpha( theme.surface, 0.78 );
	if ( mixed === theme.surface ) {
		return theme.isDark
			? 'rgba(20, 20, 20, 0.78)'
			: 'rgba(255, 255, 255, 0.82)';
	}
	return mixed;
}

/**
 * Trace a rounded rectangle.
 *
 * Hand-rolled rather than `CanvasRenderingContext2D.roundRect`, which is recent
 * enough that a supported browser may still lack it.
 *
 * @param ctx    Canvas context.
 * @param width  Box width.
 * @param height Box height.
 * @param radius Corner radius.
 */
function roundedRectPath(
	ctx: CanvasRenderingContext2D,
	width: number,
	height: number,
	radius: number
) {
	const r = Math.min( radius, width / 2, height / 2 );
	ctx.beginPath();
	ctx.moveTo( r, 0 );
	ctx.lineTo( width - r, 0 );
	ctx.quadraticCurveTo( width, 0, width, r );
	ctx.lineTo( width, height - r );
	ctx.quadraticCurveTo( width, height, width - r, height );
	ctx.lineTo( r, height );
	ctx.quadraticCurveTo( 0, height, 0, height - r );
	ctx.lineTo( 0, r );
	ctx.quadraticCurveTo( 0, 0, r, 0 );
	ctx.closePath();
}

/**
 * Render a source label into a camera-facing sprite.
 *
 * Returns null rather than throwing when there is no usable 2D canvas: this
 * runs from the frontend view script as well as the editor, and a missing
 * canvas must cost the labels, not the whole scene.
 *
 * @param text  Label text.
 * @param color Source color, used for the border.
 * @param theme Resolved theme.
 * @return The sprite, or null when no canvas is available.
 */
function createLabelSprite(
	text: string,
	color: string,
	theme: GllTheme
): THREE.Sprite | null {
	if ( typeof document === 'undefined' ) {
		return null;
	}

	const canvas = document.createElement( 'canvas' );
	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) {
		return null;
	}

	const ratio = Math.min(
		( typeof window !== 'undefined' && window.devicePixelRatio ) || 1,
		2
	);
	const font = `600 ${ LABEL_FONT_SIZE }px system-ui, -apple-system, "Segoe UI", sans-serif`;

	ctx.font = font;
	const measured = ctx.measureText( text ).width;
	const textWidth =
		Number.isFinite( measured ) && measured > 0
			? measured
			: text.length * LABEL_FONT_SIZE * 0.6;

	const boxWidth = Math.ceil( textWidth + LABEL_PADDING_X * 2 );
	const boxHeight = Math.ceil( LABEL_FONT_SIZE + LABEL_PADDING_Y * 2 );

	// Assigning width/height resets the context, transform and font included,
	// so everything below has to be (re)applied after this point.
	canvas.width = Math.max( 1, Math.round( boxWidth * ratio ) );
	canvas.height = Math.max( 1, Math.round( boxHeight * ratio ) );
	ctx.scale( ratio, ratio );
	ctx.font = font;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	roundedRectPath( ctx, boxWidth, boxHeight, 8 );
	ctx.fillStyle = labelBackground( theme );
	ctx.fill();
	ctx.lineWidth = 1;
	ctx.strokeStyle = color;
	ctx.stroke();

	ctx.fillStyle = toHex( theme.text, theme.isDark ? '#e5e5e5' : '#333333' );
	ctx.fillText( text, boxWidth / 2, boxHeight / 2 );

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	// The canvas is non-power-of-two, so mipmaps are not an option anyway.
	texture.minFilter = THREE.LinearFilter;
	texture.generateMipmaps = false;

	const material = new THREE.SpriteMaterial( {
		map: texture,
		transparent: true,
		depthTest: false,
		depthWrite: false,
	} );

	const sprite = new THREE.Sprite( material );
	sprite.renderOrder = 10;
	sprite.scale.set(
		LABEL_WORLD_HEIGHT * ( boxWidth / boxHeight ),
		LABEL_WORLD_HEIGHT,
		1
	);

	return sprite;
}

/**
 * Build the group of acoustic source cones.
 *
 * One unit cone geometry and one material per distinct source color are shared
 * by every cone in the group and recorded in `userData.gllOwnedResources`, so
 * `disposeSceneObject` releases each exactly once.
 *
 * Placements without a usable position are skipped; placements without a
 * readable rotation are drawn along view +Z, the identity orientation.
 *
 * @param options What to build.
 * @return The group, or null when there is nothing to draw.
 */
export function buildSourceCones(
	options: SourceConeOptions
): THREE.Group | null {
	const placements = Array.isArray( options.placements )
		? options.placements
		: [];
	if ( placements.length === 0 ) {
		return null;
	}

	const definitions = Array.isArray( options.sourceDefinitions )
		? options.sourceDefinitions
		: [];
	const definitionIndex = new Map< string, number >();
	definitions.forEach( ( definition, index ) => {
		const key = definition && definition.Key;
		if (
			key !== undefined &&
			key !== null &&
			! definitionIndex.has( key )
		) {
			definitionIndex.set( key, index );
		}
	} );

	const height =
		Number.isFinite( options.height ) && ( options.height as number ) > 0
			? ( options.height as number )
			: DEFAULT_CONE_HEIGHT;
	const showLabels = options.showLabels !== false;

	const group = new THREE.Group();
	group.name = 'gll-source-cones';

	const coneGeometry = buildUnitCone();
	const materials = new Map< string, THREE.Material >();
	const owned: Array< { dispose: () => void } > = [ coneGeometry ];

	const materialFor = ( color: string, wireframe: boolean ) => {
		const key = `${ wireframe ? 'wire' : 'fill' }:${ color }`;
		const existing = materials.get( key );
		if ( existing ) {
			return existing;
		}
		// Unlit on purpose: the scene lights are tuned for the cabinet, and a
		// lit translucent cone reads as mud on a dark theme.
		const material = new THREE.MeshBasicMaterial( {
			color: new THREE.Color( color ),
			transparent: true,
			opacity: wireframe ? 0.6 : 0.22,
			side: THREE.DoubleSide,
			depthWrite: false,
			wireframe,
		} );
		materials.set( key, material );
		owned.push( material );
		return material;
	};

	let placed = 0;

	placements.forEach( ( placement ) => {
		if ( ! placement || ! placement.Position ) {
			return;
		}

		const position = transformGeometryPoint(
			placement.Position,
			options.center,
			options.scale
		);
		if (
			! Number.isFinite( position.x ) ||
			! Number.isFinite( position.y ) ||
			! Number.isFinite( position.z )
		) {
			return;
		}

		const index = definitionIndex.has( placement.SourceDefinitionKey )
			? ( definitionIndex.get( placement.SourceDefinitionKey ) as number )
			: -1;
		const definition = index >= 0 ? definitions[ index ] : undefined;
		const color = sourceColor( index, options.theme );
		const half = resolveHalfAngles( definition, options.boxOpeningAngles );

		const orientation = sourcePlacementOrientation( placement.Rotation, {
			units: options.angleUnits || 'auto',
		} );
		const quaternion = orientation
			? orientation.quaternion
			: { x: 0, y: 0, z: 0, w: 1 };
		const forward = orientation
			? orientation.forward
			: { x: 0, y: 0, z: 1 };

		const scale = new THREE.Vector3(
			height * Math.tan( half.horizontal ),
			height * Math.tan( half.vertical ),
			height
		);

		[ false, true ].forEach( ( wireframe ) => {
			const mesh = new THREE.Mesh(
				coneGeometry,
				materialFor( color, wireframe )
			);
			mesh.name = `gll-source-cone-${ placement.Key ?? placed }${
				wireframe ? '-wire' : ''
			}`;
			mesh.userData = {
				gllSourceKey: placement.Key,
				gllSourceDefinitionKey: placement.SourceDefinitionKey,
				gllSourceLabel: placement.Label,
				gllSourceColor: color,
				gllSourceWireframe: wireframe,
			};
			mesh.position.set( position.x, position.y, position.z );
			mesh.quaternion.set(
				quaternion.x,
				quaternion.y,
				quaternion.z,
				quaternion.w
			);
			mesh.scale.copy( scale );
			mesh.renderOrder = 5;
			group.add( mesh );
		} );

		placed++;

		if ( ! showLabels ) {
			return;
		}

		const text =
			placement.Label ||
			( definition && definition.Label ) ||
			placement.Key ||
			'';
		if ( ! text ) {
			return;
		}

		const sprite = createLabelSprite(
			String( text ),
			color,
			options.theme
		);
		if ( ! sprite ) {
			return;
		}
		const offset = height * 1.25;
		sprite.position.set(
			position.x + forward.x * offset,
			position.y + forward.y * offset,
			position.z + forward.z * offset
		);
		sprite.userData = { gllSourceKey: placement.Key };
		group.add( sprite );
	} );

	if ( placed === 0 ) {
		coneGeometry.dispose();
		return null;
	}

	group.userData.gllOwnedResources = owned;

	return group;
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
	const { geometryData, markers, showFaces, showEdges, sources } = options;

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

	if ( sources ) {
		const cones = buildSourceCones( sources );
		if ( cones ) {
			group.add( cones );
		}
	}

	return group;
}

/**
 * Anything holding GPU memory: geometry, material or texture.
 */
interface Disposable {
	dispose: () => void;
}

/**
 * Normalize `Object3D.material` to a list.
 *
 * @param material Material, material array, or nothing.
 * @return A list of materials.
 */
function materialList( material: unknown ): any[] {
	if ( Array.isArray( material ) ) {
		return material.filter( Boolean );
	}
	return material ? [ material ] : [];
}

/**
 * Queue a resource for disposal, if it is one and is not queued already.
 *
 * The set does double duty as an order-preserving queue and as the guard that
 * keeps a shared geometry or material — the cone group shares one of each
 * across all its meshes — from being disposed once per user.
 *
 * @param resource Candidate resource.
 * @param queue    Resources collected so far.
 */
function queueDisposable( resource: unknown, queue: Set< Disposable > ) {
	const candidate = resource as Disposable | null;
	if ( ! candidate || typeof candidate.dispose !== 'function' ) {
		return;
	}
	queue.add( candidate );
}

/**
 * Queue a node's materials, and the textures hanging off them.
 *
 * Maps go in before their material so a driver that reads the material during
 * `dispose` still sees a live texture.
 *
 * @param materials Materials of one node.
 * @param queue     Resources collected so far.
 * @param withMaps  Also queue each material's `map`.
 */
function queueMaterials(
	materials: any[],
	queue: Set< Disposable >,
	withMaps: boolean
) {
	materials.forEach( ( material ) => {
		if ( withMaps && material.map ) {
			queueDisposable( material.map, queue );
		}
		queueDisposable( material, queue );
	} );
}

/**
 * Release the GPU resources an object graph holds and detach it from its
 * parent.
 *
 * Three rules earn their keep here:
 *
 * - Resources shared across nodes are declared once in
 *   `userData.gllOwnedResources` and drained from there — the array is emptied
 *   as it is read. Within one call, a set de-duplicates the queue, so the cone
 *   group's single geometry and its handful of materials are released once
 *   rather than once per mesh that references them.
 * - Nodes are duck-typed on `.geometry` / `.material` rather than matched
 *   against `Mesh` and `LineSegments`, which silently skipped `Points`, `Line`
 *   and — the leak that prompted this — `Sprite` materials and their canvas
 *   textures, on every editor attribute change.
 * - A sprite's geometry is a module-level singleton inside three.js. Disposing
 *   it breaks every other sprite in the process, so it is never touched.
 *
 * @param object Root of the graph to dispose.
 */
export function disposeSceneObject( object: THREE.Object3D ) {
	const queue = new Set< Disposable >();

	object.traverse( ( child ) => {
		const owned = child.userData && child.userData.gllOwnedResources;
		if ( Array.isArray( owned ) ) {
			owned.forEach( ( resource ) => queueDisposable( resource, queue ) );
			owned.length = 0;
		}

		const node = child as any;

		if ( node.isSprite ) {
			queueMaterials( materialList( node.material ), queue, true );
			return;
		}

		queueDisposable( node.geometry, queue );
		queueMaterials( materialList( node.material ), queue, false );
	} );

	queue.forEach( ( resource ) => resource.dispose() );

	if ( object.parent ) {
		object.parent.remove( object );
	}
}
