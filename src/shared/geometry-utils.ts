/**
 * Geometry utilities for GLL case geometry.
 *
 * @package
 */

export interface GeometryVertex {
	x: number;
	y: number;
	z: number;
}

export interface GeometryFace {
	indices: number[];
	color?: unknown;
}

export interface GeometryEdge {
	indices: [ number, number ];
	color?: unknown;
}

export interface GeometryBuildOptions {
	faceColor?: [ number, number, number ];
	edgeColor?: [ number, number, number ];
	transform?: ( vertex: GeometryVertex ) => GeometryVertex;
}

export interface GeometryBuildResult {
	positions: Float32Array;
	colors: Float32Array;
	indices: Uint32Array;
	edgePositions: Float32Array;
	edgeColors: Float32Array;
	stats: {
		vertexCount: number;
		faceCount: number;
		edgeCount: number;
	};
}

export interface GeometryBounds {
	min: GeometryVertex;
	max: GeometryVertex;
	size: GeometryVertex;
	center: GeometryVertex;
}

export type GeometryMarkerKey = 'ref' | 'com' | 'pivot';

export interface GeometryMarkerVisibility {
	ref?: boolean;
	com?: boolean;
	pivot?: boolean;
}

export interface GeometryMarker {
	key: GeometryMarkerKey;
	label: string;
	color: string;
	radius: number;
	position: GeometryVertex;
}

export interface GeometryMarkerBuildOptions {
	center: GeometryVertex;
	scale: number;
	visibility?: GeometryMarkerVisibility;
}

export interface GeometryEulerHvr {
	heading: number;
	vertical: number;
	roll: number;
}

export interface GeometryQuaternion {
	x: number;
	y: number;
	z: number;
	w: number;
}

/**
 * How the raw H/V/R numbers of a source placement should be interpreted.
 *
 * GLL stores placement angles in radians (see gll-tools docs/format.md:175),
 * so 'radians' is the contract. 'auto' adds a rescue heuristic for malformed
 * files; 'degrees' forces the other reading.
 */
export type GeometryAngleUnits = 'radians' | 'degrees' | 'auto';

export interface GeometrySourceOrientation {
	/** View-space unit vector for the GLL local +X axis. */
	right: GeometryVertex;
	/** View-space unit vector for the GLL local +Z axis. */
	up: GeometryVertex;
	/** View-space unit vector for the GLL local +Y axis: where the source aims. */
	forward: GeometryVertex;
	/** Rotation taking local (X = right, Y = up, Z = forward) into view space. */
	quaternion: GeometryQuaternion;
}

const GEOMETRY_MARKER_RADIUS = 0.01;

export function buildCaseGeometryData(
	geometry: any,
	options: GeometryBuildOptions = {}
): GeometryBuildResult | null {
	const vertices = extractVertices( geometry, options.transform );
	if ( vertices.length === 0 ) {
		return null;
	}

	const faceColorDefault = options.faceColor || [ 0.72, 0.74, 0.78 ];
	const edgeColorDefault = options.edgeColor || [ 0.25, 0.3, 0.35 ];

	const faces = extractFaces( geometry );
	const colors = new Float32Array( vertices.length * 3 );

	for ( let i = 0; i < vertices.length; i++ ) {
		const baseIndex = i * 3;
		colors[ baseIndex ] = faceColorDefault[ 0 ];
		colors[ baseIndex + 1 ] = faceColorDefault[ 1 ];
		colors[ baseIndex + 2 ] = faceColorDefault[ 2 ];
	}

	const indices: number[] = [];
	faces.forEach( ( face ) => {
		const faceIndices = face.indices;
		if ( faceIndices.length < 3 ) {
			return;
		}

		const color = normalizeColor( face.color, faceColorDefault );
		faceIndices.forEach( ( index ) => {
			if ( index < 0 || index >= vertices.length ) {
				return;
			}
			const baseIndex = index * 3;
			colors[ baseIndex ] = color[ 0 ];
			colors[ baseIndex + 1 ] = color[ 1 ];
			colors[ baseIndex + 2 ] = color[ 2 ];
		} );

		if ( faceIndices.length === 3 ) {
			indices.push(
				faceIndices[ 0 ],
				faceIndices[ 1 ],
				faceIndices[ 2 ]
			);
			return;
		}

		for ( let i = 1; i < faceIndices.length - 1; i++ ) {
			indices.push(
				faceIndices[ 0 ],
				faceIndices[ i ],
				faceIndices[ i + 1 ]
			);
		}
	} );

	const positions = new Float32Array( vertices.length * 3 );
	vertices.forEach( ( vertex, index ) => {
		const baseIndex = index * 3;
		positions[ baseIndex ] = vertex.x;
		positions[ baseIndex + 1 ] = vertex.y;
		positions[ baseIndex + 2 ] = vertex.z;
	} );

	const edges = extractEdges( geometry, faces, vertices.length );
	const edgePositions: number[] = [];
	const edgeColors: number[] = [];

	edges.forEach( ( edge ) => {
		const [ a, b ] = edge.indices;
		if ( a < 0 || b < 0 || a >= vertices.length || b >= vertices.length ) {
			return;
		}

		const color = normalizeColor( edge.color, edgeColorDefault );
		const vertexA = vertices[ a ];
		const vertexB = vertices[ b ];

		edgePositions.push( vertexA.x, vertexA.y, vertexA.z );
		edgePositions.push( vertexB.x, vertexB.y, vertexB.z );
		edgeColors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
		edgeColors.push( color[ 0 ], color[ 1 ], color[ 2 ] );
	} );

	return {
		positions,
		colors,
		indices: new Uint32Array( indices ),
		edgePositions: new Float32Array( edgePositions ),
		edgeColors: new Float32Array( edgeColors ),
		stats: {
			vertexCount: vertices.length,
			faceCount: faces.length,
			edgeCount: edges.length,
		},
	};
}

export function resolveGeometryVertex(
	geometry: any,
	index: number
): GeometryVertex | null {
	const vertices = extractVertices( geometry );
	return vertices[ index ] || null;
}

export function getCaseGeometryVertices( geometry: any ): GeometryVertex[] {
	return extractVertices( geometry );
}

export function resolveGeometryPoint(
	geometry: any,
	keys: string[]
): GeometryVertex | null {
	for ( const key of keys ) {
		if ( geometry && geometry[ key ] ) {
			const parsed = parseVertex( geometry[ key ] );
			if ( parsed ) {
				return parsed;
			}
		}
	}
	return null;
}

export function getReferencePoint( geometry: any ): GeometryVertex | null {
	return resolveGeometryPoint( geometry, [
		'ReferencePoint',
		'RefPoint',
		'Reference',
		'ReferencePosition',
		'ReferenceCoordinates',
		'RefPosition',
	] );
}

export function getCenterOfMassPoint( geometry: any ): GeometryVertex | null {
	return resolveGeometryPoint( geometry, [
		'CenterOfMass',
		'CentreOfMass',
		'CenterOfGravity',
		'CentreOfGravity',
		'MassCenter',
		'MassCentre',
		'COM',
		'CenterMass',
		'CentreMass',
	] );
}

export function getNextPivotPoint( geometry: any ): GeometryVertex | null {
	return resolveGeometryPoint( geometry, [
		'NextPivot',
		'NextPivotPoint',
		'Pivot',
		'PivotPoint',
		'PivotPosition',
		'NextPivotPosition',
		'NextRotationPoint',
	] );
}

export function toViewPoint( point: GeometryVertex ): GeometryVertex {
	return { x: point.x, y: point.z, z: point.y };
}

export function transformGeometryPoint(
	point: GeometryVertex,
	center: GeometryVertex,
	scale: number
): GeometryVertex {
	const viewPoint = toViewPoint( point );
	return {
		x: ( viewPoint.x - center.x ) * scale,
		y: ( viewPoint.y - center.y ) * scale,
		z: ( viewPoint.z - center.z ) * scale,
	};
}

export function getEulerHvr( rotation: any ): GeometryEulerHvr | null {
	if ( ! rotation ) {
		return null;
	}

	const candidates = [
		rotation,
		rotation.HVR,
		rotation.Hvr,
		rotation.hvr,
		rotation.Euler,
		rotation.euler,
	];

	for ( const candidate of candidates ) {
		if ( ! candidate ) {
			continue;
		}

		if ( Array.isArray( candidate ) && candidate.length >= 3 ) {
			return {
				heading: Number( candidate[ 0 ] ) || 0,
				vertical: Number( candidate[ 1 ] ) || 0,
				roll: Number( candidate[ 2 ] ) || 0,
			};
		}

		const heading = pickNumber( candidate, [
			'Heading',
			'heading',
			'H',
			'h',
			'Yaw',
			'yaw',
			'Azimuth',
			'azimuth',
		] );
		const vertical = pickNumber( candidate, [
			'Vertical',
			'vertical',
			'V',
			'v',
			'Pitch',
			'pitch',
			'Elevation',
			'elevation',
		] );
		const roll = pickNumber( candidate, [ 'Roll', 'roll', 'R', 'r' ] );

		if ( heading !== null || vertical !== null || roll !== null ) {
			return {
				heading: heading || 0,
				vertical: vertical || 0,
				roll: roll || 0,
			};
		}
	}

	return null;
}

/**
 * Build the view-space orientation basis of a GLL source placement.
 *
 * GLL places sources with a heading/vertical/roll triple expressed in radians
 * (gll-tools docs/format.md:175, docs/acoustic-model.md:14). The local frame is
 * Z-up with the acoustic axis along local +Y, so the returned `forward` is the
 * image of local +Y. View space is Y-up, reached through the same
 * `(x, y, z) -> (x, z, y)` swap as `toViewPoint`.
 *
 * The full basis is returned (not just the aim vector) because roll about the
 * acoustic axis matters for non-circular coverage cones.
 *
 * @param rotation      Raw placement rotation, in any spelling `getEulerHvr` accepts.
 * @param options       Optional settings.
 * @param options.units Angle unit interpretation. Defaults to 'auto'.
 * @return The orientation, or null when no H/V/R triple could be read.
 */
export function sourcePlacementOrientation(
	rotation: unknown,
	options: { units?: GeometryAngleUnits } = {}
): GeometrySourceOrientation | null {
	const hvr = getEulerHvr( rotation );
	if ( ! hvr ) {
		return null;
	}

	const scale = resolveAngleScale( hvr, options.units || 'auto' );
	const h = hvr.heading * scale;
	const v = hvr.vertical * scale;
	const r = hvr.roll * scale;

	const sh = Math.sin( h );
	const ch = Math.cos( h );
	const sv = Math.sin( v );
	const cv = Math.cos( v );
	const sr = Math.sin( r );
	const cr = Math.cos( r );

	// Rotation matrix in GLL space, rows as in gll-tools web/modules/geometry.js:68.
	// Its columns are the local basis vectors: X = right, Y = forward, Z = up.
	const rightGll: GeometryVertex = {
		x: ch * cr - sv * sh * sr,
		y: -cv * sh,
		z: -ch * sr - sv * sh * cr,
	};
	const forwardGll: GeometryVertex = {
		x: sh * cr + sv * ch * sr,
		y: cv * ch,
		z: -sh * sr + sv * ch * cr,
	};
	const upGll: GeometryVertex = {
		x: cv * sr,
		y: -sv,
		z: cv * cr,
	};

	// R_view = S * R * S with S the involution (x, y, z) -> (x, z, y). Because
	// det( S ) = -1 appears twice, det( R_view ) = +1: still a proper rotation.
	const right = toViewPoint( rightGll );
	const up = toViewPoint( upGll );
	const forward = toViewPoint( forwardGll );

	return {
		right,
		up,
		forward,
		quaternion: quaternionFromBasis( right, up, forward ),
	};
}

export function buildGeometryMarkers(
	geometry: any,
	options: GeometryMarkerBuildOptions
): GeometryMarker[] {
	const visibility = options.visibility || {};
	const markerDefinitions: Array< {
		key: GeometryMarkerKey;
		label: string;
		color: string;
		point: GeometryVertex | null;
	} > = [
		{
			key: 'ref',
			label: 'Reference Point',
			color: '#ef4444',
			point: getReferencePoint( geometry ),
		},
		{
			key: 'com',
			label: 'Center of Mass',
			color: '#22c55e',
			point: getCenterOfMassPoint( geometry ),
		},
		{
			key: 'pivot',
			label: 'Next Pivot',
			color: '#f59e0b',
			point: getNextPivotPoint( geometry ),
		},
	];

	return markerDefinitions
		.filter( ( marker ) => visibility[ marker.key ] !== false )
		.filter(
			( marker ): marker is typeof marker & { point: GeometryVertex } =>
				marker.point !== null
		)
		.map( ( marker ) => ( {
			key: marker.key,
			label: marker.label,
			color: marker.color,
			radius: GEOMETRY_MARKER_RADIUS,
			position: transformGeometryPoint(
				marker.point,
				options.center,
				options.scale
			),
		} ) );
}

export function computeBounds( vertices: GeometryVertex[] ): GeometryBounds {
	const min: GeometryVertex = { x: Infinity, y: Infinity, z: Infinity };
	const max: GeometryVertex = { x: -Infinity, y: -Infinity, z: -Infinity };

	vertices.forEach( ( vertex ) => {
		min.x = Math.min( min.x, vertex.x );
		min.y = Math.min( min.y, vertex.y );
		min.z = Math.min( min.z, vertex.z );
		max.x = Math.max( max.x, vertex.x );
		max.y = Math.max( max.y, vertex.y );
		max.z = Math.max( max.z, vertex.z );
	} );

	const size = {
		x: max.x - min.x,
		y: max.y - min.y,
		z: max.z - min.z,
	};
	const center = {
		x: min.x + size.x / 2,
		y: min.y + size.y / 2,
		z: min.z + size.z / 2,
	};

	return { min, max, size, center };
}

export function computeScaleFactor(
	bounds: GeometryBounds,
	targetSize = 1.2
): number {
	const maxSize = Math.max( bounds.size.x, bounds.size.y, bounds.size.z );
	if ( maxSize <= 0 ) {
		return 1;
	}
	return targetSize / maxSize;
}

function extractVertices(
	geometry: any,
	transform?: ( vertex: GeometryVertex ) => GeometryVertex
): GeometryVertex[] {
	if ( ! geometry ) {
		return [];
	}

	const candidates = [
		geometry.Vertices,
		geometry.VertexList,
		geometry.Points,
		geometry.PointList,
		geometry.VertexPositions,
		geometry.GeometryVertices,
		geometry.Vertices?.Vertices,
	];

	const rawList = candidates.find( ( candidate ) =>
		Array.isArray( candidate )
	);

	if ( ! rawList ) {
		return [];
	}

	const vertices: GeometryVertex[] = [];
	rawList.forEach( ( entry ) => {
		const parsed = parseVertex( entry );
		if ( parsed ) {
			vertices.push( transform ? transform( parsed ) : parsed );
		}
	} );

	return vertices;
}

function parseVertex( entry: any ): GeometryVertex | null {
	if ( ! entry ) {
		return null;
	}

	if ( Array.isArray( entry ) && entry.length >= 3 ) {
		return {
			x: Number( entry[ 0 ] ),
			y: Number( entry[ 1 ] ),
			z: Number( entry[ 2 ] ),
		};
	}

	const x = pickNumber( entry, [ 'x', 'X', 'XCoord', 'XCoordMm', 'XPos' ] );
	const y = pickNumber( entry, [ 'y', 'Y', 'YCoord', 'YCoordMm', 'YPos' ] );
	const z = pickNumber( entry, [ 'z', 'Z', 'ZCoord', 'ZCoordMm', 'ZPos' ] );

	if ( x === null || y === null || z === null ) {
		return null;
	}

	return { x, y, z };
}

function pickNumber( obj: any, keys: string[] ): number | null {
	for ( const key of keys ) {
		if ( obj && obj[ key ] !== undefined ) {
			const value = Number( obj[ key ] );
			if ( ! Number.isNaN( value ) ) {
				return value;
			}
		}
	}
	return null;
}

const DEGREES_TO_RADIANS = Math.PI / 180;

/**
 * Decide the factor converting the raw H/V/R numbers to radians.
 *
 * Radians is the documented contract, so 'auto' only falls back to degrees when
 * a value is too large to be a plausible radian angle (> 2*PI). Known failure
 * mode: a degree-valued file whose H, V and R are all <= 6.28 degrees is read as
 * radians and comes out wildly over-rotated. Pass an explicit unit to override.
 *
 * @param hvr   The raw angle triple.
 * @param units Requested interpretation.
 * @return Multiplier turning the raw values into radians.
 */
function resolveAngleScale(
	hvr: GeometryEulerHvr,
	units: GeometryAngleUnits
): number {
	if ( units === 'degrees' ) {
		return DEGREES_TO_RADIANS;
	}
	if ( units === 'radians' ) {
		return 1;
	}

	const largest = Math.max(
		Math.abs( hvr.heading ),
		Math.abs( hvr.vertical ),
		Math.abs( hvr.roll )
	);

	return largest > Math.PI * 2 + 1e-6 ? DEGREES_TO_RADIANS : 1;
}

/**
 * Convert an orthonormal view-space basis to a quaternion.
 *
 * The matrix columns are, in order, local X -> right, Y -> up, Z -> forward.
 * Uses the trace / largest-diagonal-element branch for numerical stability.
 *
 * @param right   Image of local +X.
 * @param up      Image of local +Y.
 * @param forward Image of local +Z.
 * @return The normalized rotation quaternion.
 */
function quaternionFromBasis(
	right: GeometryVertex,
	up: GeometryVertex,
	forward: GeometryVertex
): GeometryQuaternion {
	const m00 = right.x;
	const m10 = right.y;
	const m20 = right.z;
	const m01 = up.x;
	const m11 = up.y;
	const m21 = up.z;
	const m02 = forward.x;
	const m12 = forward.y;
	const m22 = forward.z;

	const trace = m00 + m11 + m22;

	if ( trace > 0 ) {
		const s = Math.sqrt( trace + 1 ) * 2;
		return normalizeQuaternion( {
			x: ( m21 - m12 ) / s,
			y: ( m02 - m20 ) / s,
			z: ( m10 - m01 ) / s,
			w: 0.25 * s,
		} );
	}

	if ( m00 > m11 && m00 > m22 ) {
		const s = Math.sqrt( 1 + m00 - m11 - m22 ) * 2;
		return normalizeQuaternion( {
			x: 0.25 * s,
			y: ( m01 + m10 ) / s,
			z: ( m02 + m20 ) / s,
			w: ( m21 - m12 ) / s,
		} );
	}

	if ( m11 > m22 ) {
		const s = Math.sqrt( 1 + m11 - m00 - m22 ) * 2;
		return normalizeQuaternion( {
			x: ( m01 + m10 ) / s,
			y: 0.25 * s,
			z: ( m12 + m21 ) / s,
			w: ( m02 - m20 ) / s,
		} );
	}

	const s = Math.sqrt( 1 + m22 - m00 - m11 ) * 2;
	return normalizeQuaternion( {
		x: ( m02 + m20 ) / s,
		y: ( m12 + m21 ) / s,
		z: 0.25 * s,
		w: ( m10 - m01 ) / s,
	} );
}

function normalizeQuaternion(
	quaternion: GeometryQuaternion
): GeometryQuaternion {
	const length = Math.hypot(
		quaternion.x,
		quaternion.y,
		quaternion.z,
		quaternion.w
	);
	if ( length === 0 ) {
		return { x: 0, y: 0, z: 0, w: 1 };
	}
	return {
		x: roundNearZero( quaternion.x / length ),
		y: roundNearZero( quaternion.y / length ),
		z: roundNearZero( quaternion.z / length ),
		w: roundNearZero( quaternion.w / length ),
	};
}

function roundNearZero( value: number ): number {
	return Math.abs( value ) < 1e-12 ? 0 : value;
}

function extractFaces( geometry: any ): GeometryFace[] {
	if ( ! geometry ) {
		return [];
	}

	const directFaces =
		geometry.Faces ||
		geometry.FaceList ||
		geometry.FaceDefinitions ||
		geometry.FaceGroups;

	if ( Array.isArray( directFaces ) ) {
		return directFaces
			.map( ( face ) => parseFace( face ) )
			.filter( Boolean ) as GeometryFace[];
	}

	const flatIndices =
		geometry.Triangles ||
		geometry.TriangleIndices ||
		geometry.FaceIndices ||
		geometry.Indices;

	if ( Array.isArray( flatIndices ) ) {
		const faces: GeometryFace[] = [];
		for ( let i = 0; i < flatIndices.length; i += 3 ) {
			if ( flatIndices[ i + 2 ] === undefined ) {
				break;
			}
			faces.push( {
				indices: [
					Number( flatIndices[ i ] ),
					Number( flatIndices[ i + 1 ] ),
					Number( flatIndices[ i + 2 ] ),
				],
			} );
		}
		return faces;
	}

	return [];
}

function parseFace( face: any ): GeometryFace | null {
	if ( ! face ) {
		return null;
	}

	if ( Array.isArray( face ) ) {
		return { indices: face.map( Number ), color: undefined };
	}

	const indices =
		face.Indices ||
		face.VertexIndices ||
		face.Vertices ||
		face.VertexList ||
		face.Points;

	if ( Array.isArray( indices ) ) {
		return {
			indices: indices.map( Number ),
			color: face.Color || face.FaceColor || face.color,
		};
	}

	if (
		face.A !== undefined &&
		face.B !== undefined &&
		face.C !== undefined
	) {
		return {
			indices: [ Number( face.A ), Number( face.B ), Number( face.C ) ],
			color: face.Color || face.FaceColor || face.color,
		};
	}

	return null;
}

function extractEdges(
	geometry: any,
	faces: GeometryFace[],
	vertexCount: number
): GeometryEdge[] {
	if ( ! geometry ) {
		return [];
	}

	const directEdges =
		geometry.Edges || geometry.EdgeList || geometry.EdgeDefinitions;

	if ( Array.isArray( directEdges ) ) {
		return directEdges
			.map( ( edge ) => parseEdge( edge ) )
			.filter( Boolean ) as GeometryEdge[];
	}

	const edgeSet = new Set< string >();
	const edges: GeometryEdge[] = [];

	faces.forEach( ( face ) => {
		const indices = face.indices;
		if ( indices.length < 2 ) {
			return;
		}

		for ( let i = 0; i < indices.length; i++ ) {
			const a = indices[ i ];
			const b = indices[ ( i + 1 ) % indices.length ];
			if ( a < 0 || b < 0 || a >= vertexCount || b >= vertexCount ) {
				continue;
			}
			const key = a < b ? `${ a }-${ b }` : `${ b }-${ a }`;
			if ( edgeSet.has( key ) ) {
				continue;
			}
			edgeSet.add( key );
			edges.push( { indices: [ a, b ], color: face.color } );
		}
	} );

	return edges;
}

function parseEdge( edge: any ): GeometryEdge | null {
	if ( ! edge ) {
		return null;
	}

	if ( Array.isArray( edge ) && edge.length >= 2 ) {
		return {
			indices: [ Number( edge[ 0 ] ), Number( edge[ 1 ] ) ],
			color: undefined,
		};
	}

	const indices =
		edge.Indices || edge.VertexIndices || edge.Vertices || edge.VertexList;

	if ( Array.isArray( indices ) && indices.length >= 2 ) {
		return {
			indices: [ Number( indices[ 0 ] ), Number( indices[ 1 ] ) ],
			color: edge.Color || edge.EdgeColor || edge.color,
		};
	}

	if ( edge.A !== undefined && edge.B !== undefined ) {
		return {
			indices: [ Number( edge.A ), Number( edge.B ) ],
			color: edge.Color || edge.EdgeColor || edge.color,
		};
	}

	if ( edge.Start !== undefined && edge.End !== undefined ) {
		return {
			indices: [ Number( edge.Start ), Number( edge.End ) ],
			color: edge.Color || edge.EdgeColor || edge.color,
		};
	}

	return null;
}

function normalizeColor(
	input: unknown,
	fallback: [ number, number, number ]
): [ number, number, number ] {
	if ( ! input ) {
		return fallback;
	}

	// Unpacking 0xRRGGBB is what bit shifts are for.
	/* eslint-disable no-bitwise */
	if ( typeof input === 'number' ) {
		return [
			( ( input >> 16 ) & 0xff ) / 255,
			( ( input >> 8 ) & 0xff ) / 255,
			( input & 0xff ) / 255,
		];
	}

	if ( typeof input === 'string' && input.startsWith( '#' ) ) {
		const hex = input.slice( 1 );
		if ( hex.length === 6 ) {
			const value = parseInt( hex, 16 );
			return [
				( ( value >> 16 ) & 0xff ) / 255,
				( ( value >> 8 ) & 0xff ) / 255,
				( value & 0xff ) / 255,
			];
		}
	}
	/* eslint-enable no-bitwise */

	if ( Array.isArray( input ) && input.length >= 3 ) {
		const max = Math.max( input[ 0 ], input[ 1 ], input[ 2 ] );
		if ( max > 1 ) {
			return [
				Number( input[ 0 ] ) / 255,
				Number( input[ 1 ] ) / 255,
				Number( input[ 2 ] ) / 255,
			];
		}
		return [
			Number( input[ 0 ] ),
			Number( input[ 1 ] ),
			Number( input[ 2 ] ),
		];
	}

	if ( typeof input === 'object' ) {
		const value = input as { r?: number; g?: number; b?: number };
		if (
			value.r !== undefined &&
			value.g !== undefined &&
			value.b !== undefined
		) {
			const max = Math.max( value.r, value.g, value.b );
			if ( max > 1 ) {
				return [ value.r / 255, value.g / 255, value.b / 255 ];
			}
			return [ value.r, value.g, value.b ];
		}
	}

	return fallback;
}
