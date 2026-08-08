/**
 * Geometry Viewer Block - Editor Component
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';
import {
	InspectorControls,
	useBlockProps,
	MediaUpload,
	MediaUploadCheck,
} from '@wordpress/block-editor';
import {
	PanelBody,
	Button,
	ToggleControl,
	RangeControl,
	SelectControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import {
	useEffect,
	useMemo,
	useState,
	useCallback,
	useRef,
} from '@wordpress/element';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

import {
	useGLLLoader,
	GeometryViewer,
	isWebGLSupported,
	buildCaseGeometryData,
	buildGeometryMarkers,
	getCaseGeometryVertices,
	getReferencePoint,
	getCenterOfMassPoint,
	toViewPoint,
	computeBounds,
	computeScaleFactor,
	attachManualOrbitControls,
	AppearanceControl,
	appearanceClass,
} from '../shared';
import type {
	GeometryViewerRef,
	ManualOrbitControls,
	GeometryMarker,
} from '../shared';
import { applyHelperTheme } from './helper-theme';
import { buildGeometryGroup, disposeSceneObject } from './scene-builder';
import './editor.scss';

/**
 * Stable stand-in for "this geometry has no markers".
 *
 * `markerData` feeds the dependency array of `buildGeometry`, which in turn
 * feeds the effect that (re)builds the scene. A fresh `[]` per render would
 * make that effect tear the whole scene down and rebuild it on every render.
 */
const NO_MARKERS: readonly GeometryMarker[] = Object.freeze( [] );

/**
 * Format a number with up to one decimal place.
 *
 * @param {number} value Numeric value.
 * @return {string} Formatted number, or a dash when there is no number.
 */
function formatNumber( value ) {
	if ( typeof value !== 'number' || ! Number.isFinite( value ) ) {
		return '-';
	}
	const rounded = Math.round( value * 10 ) / 10;
	return Number.isInteger( rounded ) ? `${ rounded }` : rounded.toFixed( 1 );
}

/**
 * Format a point as a comma-separated coordinate triple.
 *
 * @param {Object} point Point with x/y/z in raw GLL units.
 * @return {string} Formatted coordinates.
 */
function formatPoint( point ) {
	return `${ formatNumber( point.x ) }, ${ formatNumber(
		point.y
	) }, ${ formatNumber( point.z ) }`;
}

/**
 * Edit component for the Geometry Viewer block.
 *
 * @param {Object}   props               Component props.
 * @param {Object}   props.attributes    Block attributes.
 * @param {Function} props.setAttributes Function to update attributes.
 * @return {JSX.Element} Edit component.
 */
export default function Edit( { attributes, setAttributes } ) {
	const {
		fileUrl,
		fileId,
		fileName,
		geometryIndex,
		showFaces,
		showEdges,
		showMarkers,
		showSources,
		centerReference,
		autoRotate,
		canvasHeight,
		appearance,
	} = attributes;

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );
	const viewerRef = useRef< GeometryViewerRef >( null );
	const controlsRef = useRef< OrbitControls | null >( null );
	const fallbackControlsRef = useRef< ManualOrbitControls | null >( null );

	const webGLSupported = useMemo( () => isWebGLSupported(), [] );

	useEffect( () => {
		if ( fileUrl && ! loadAttempted ) {
			setLoadAttempted( true );
			load( fileUrl, true );
		}
	}, [ fileUrl, load, loadAttempted ] );

	const onSelectFile = ( media ) => {
		setAttributes( {
			fileId: media.id,
			fileUrl: media.url,
			fileName: media.filename,
		} );
		setLoadAttempted( false );
	};

	const onRemoveFile = () => {
		setAttributes( { fileId: 0, fileUrl: '', fileName: '' } );
		clear();
		setLoadAttempted( false );
	};

	const geometryOptions = useMemo( () => {
		const geometries = data?.Database?.CaseGeometries;
		if ( ! Array.isArray( geometries ) ) {
			return [];
		}
		return geometries.map( ( geometry, index ) => ( {
			value: String( index ),
			label:
				geometry?.BoxLabel ||
				geometry?.BoxKey ||
				sprintf(
					/* translators: %d: geometry number. */
					__( 'Geometry %d', 'gll-info' ),
					index + 1
				),
		} ) );
	}, [ data ] );

	const caseGeometry = useMemo( () => {
		const geometries = data?.Database?.CaseGeometries;
		if ( ! Array.isArray( geometries ) || geometries.length === 0 ) {
			return null;
		}
		const index = Math.min( geometryIndex, geometries.length - 1 );
		return geometries[ index ] || null;
	}, [ data, geometryIndex ] );

	const geometrySceneData = useMemo( () => {
		if ( ! caseGeometry ) {
			return null;
		}
		const vertices = getCaseGeometryVertices( caseGeometry );
		if ( vertices.length === 0 ) {
			return null;
		}
		const viewVertices = vertices.map( toViewPoint );
		const bounds = computeBounds( viewVertices );
		const reference = centerReference
			? getReferencePoint( caseGeometry )
			: null;
		const center = reference ? toViewPoint( reference ) : bounds.center;
		const scale = computeScaleFactor( bounds, 1.2 );
		const meshData = buildCaseGeometryData( caseGeometry, {
			transform: ( vertex ) => {
				const viewPoint = toViewPoint( vertex );
				return {
					x: ( viewPoint.x - center.x ) * scale,
					y: ( viewPoint.y - center.y ) * scale,
					z: ( viewPoint.z - center.z ) * scale,
				};
			},
		} );

		if ( ! meshData ) {
			return null;
		}

		return {
			meshData,
			bounds,
			markers: buildGeometryMarkers( caseGeometry, {
				center,
				scale,
				visibility: showMarkers,
			} ),
		};
	}, [ caseGeometry, centerReference, showMarkers ] );

	const geometryData = geometrySceneData?.meshData || null;
	const markerData = geometrySceneData?.markers ?? NO_MARKERS;

	const geometryStats = geometrySceneData?.meshData?.stats || null;
	const geometryBounds = geometrySceneData?.bounds || null;
	const largestDimension = geometryBounds
		? Math.max(
				geometryBounds.size.x,
				geometryBounds.size.y,
				geometryBounds.size.z
		  )
		: null;
	const isSymmetric = caseGeometry?.IsSymmetric;
	const sourcePlacementCount = Array.isArray( caseGeometry?.SourcePlacements )
		? caseGeometry.SourcePlacements.length
		: 0;

	const referencePoint = useMemo(
		() => ( caseGeometry ? getReferencePoint( caseGeometry ) : null ),
		[ caseGeometry ]
	);
	const centerOfMassPoint = useMemo(
		() => ( caseGeometry ? getCenterOfMassPoint( caseGeometry ) : null ),
		[ caseGeometry ]
	);

	const geometryGroupRef = useRef< THREE.Group | null >( null );
	const themedSceneRef = useRef< {
		scene: THREE.Scene;
		element: HTMLElement;
	} | null >( null );

	/**
	 * Re-resolve the theme when the viewer resizes. A resize is the cheapest
	 * signal available that the surrounding styling may have changed, and
	 * repainting two small helper buffers costs nothing.
	 */
	const handleResize = useCallback( () => {
		if ( themedSceneRef.current ) {
			applyHelperTheme(
				themedSceneRef.current.scene,
				themedSceneRef.current.element
			);
		}
	}, [] );

	const buildGeometry = useCallback( () => {
		const scene = viewerRef.current?.scene;
		if ( ! scene ) {
			return;
		}

		if ( geometryGroupRef.current ) {
			disposeSceneObject( geometryGroupRef.current );
			geometryGroupRef.current = null;
		}

		const group = buildGeometryGroup( {
			geometryData,
			markers: markerData,
			showFaces,
			showEdges,
		} );

		if ( ! group ) {
			return;
		}

		scene.add( group );
		geometryGroupRef.current = group;
	}, [ geometryData, markerData, showFaces, showEdges ] );

	const handleAnimate = useCallback( ( _scene, _camera, deltaTime ) => {
		if ( controlsRef.current ) {
			controlsRef.current.update();
			return;
		}
		if ( fallbackControlsRef.current ) {
			fallbackControlsRef.current.update( deltaTime );
		}
	}, [] );

	const handleSceneReady = useCallback(
		( scene, camera, renderer ) => {
			buildGeometry();

			// The grid and axes the shared viewer creates are chrome, so they
			// follow the block's theme tokens. `renderer.domElement` sits
			// inside the `.gll-block` wrapper and therefore inherits them.
			themedSceneRef.current = { scene, element: renderer.domElement };
			applyHelperTheme( scene, renderer.domElement );

			if ( controlsRef.current ) {
				controlsRef.current.dispose();
				controlsRef.current = null;
			}
			if ( fallbackControlsRef.current ) {
				fallbackControlsRef.current.dispose();
				fallbackControlsRef.current = null;
			}

			try {
				const controls = new OrbitControls(
					camera,
					renderer.domElement
				);
				controls.enableDamping = true;
				controls.dampingFactor = 0.08;
				controls.screenSpacePanning = true;
				controls.enableZoom = true;
				controls.enablePan = true;
				controls.enableRotate = true;
				controls.enableKeys = true;
				controls.minDistance = 0.25;
				controls.maxDistance = 25;
				controls.rotateSpeed = 0.6;
				controls.panSpeed = 0.9;
				controls.autoRotate = autoRotate;
				controls.mouseButtons = {
					LEFT: THREE.MOUSE.ROTATE,
					MIDDLE: THREE.MOUSE.DOLLY,
					RIGHT: THREE.MOUSE.PAN,
				};
				controlsRef.current = controls;
			} catch ( controlsError ) {
				console.warn(
					'OrbitControls unavailable, using manual orbit fallback.'
				);
				fallbackControlsRef.current = attachManualOrbitControls(
					camera,
					renderer.domElement,
					{
						minDistance: 0.25,
						maxDistance: 25,
						rotateSpeed: 0.6,
						panSpeed: 0.9,
						dampingFactor: 0.08,
						autoRotate,
					}
				);
			}
		},
		[ autoRotate, buildGeometry ]
	);

	useEffect( () => {
		if ( controlsRef.current ) {
			controlsRef.current.autoRotate = autoRotate;
		}
		if ( fallbackControlsRef.current ) {
			fallbackControlsRef.current.autoRotate = autoRotate;
		}
	}, [ autoRotate ] );

	useEffect(
		() => () => {
			if ( controlsRef.current ) {
				controlsRef.current.dispose();
				controlsRef.current = null;
			}
			if ( fallbackControlsRef.current ) {
				fallbackControlsRef.current.dispose();
				fallbackControlsRef.current = null;
			}
			if ( geometryGroupRef.current ) {
				disposeSceneObject( geometryGroupRef.current );
				geometryGroupRef.current = null;
			}
			themedSceneRef.current = null;
		},
		[]
	);

	useEffect( () => {
		buildGeometry();
	}, [ buildGeometry ] );

	// Switching appearance can change what the tokens resolve to, so repaint.
	useEffect( () => {
		handleResize();
	}, [ appearance, handleResize ] );

	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="admin-site-alt3"
					label={ __( 'GLL Geometry Viewer', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to display case geometry.',
						'gll-info'
					) }
				>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
							allowedTypes={ [
								'application/x-gll',
								'application/octet-stream',
							] }
							render={ ( { open } ) => (
								<Button variant="primary" onClick={ open }>
									{ __( 'Select GLL File', 'gll-info' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
				</Placeholder>
			</div>
		);
	}

	return (
		<>
			<InspectorControls>
				<PanelBody title={ __( 'File Settings', 'gll-info' ) }>
					<div className="gll-file-info">
						<strong>{ __( 'Selected File:', 'gll-info' ) }</strong>
						<br />
						{ fileName }
					</div>
					<MediaUploadCheck>
						<MediaUpload
							onSelect={ onSelectFile }
							allowedTypes={ [
								'application/x-gll',
								'application/octet-stream',
							] }
							value={ fileId }
							render={ ( { open } ) => (
								<Button
									variant="secondary"
									onClick={ open }
									style={ {
										marginTop: '10px',
										marginRight: '10px',
									} }
								>
									{ __( 'Replace File', 'gll-info' ) }
								</Button>
							) }
						/>
					</MediaUploadCheck>
					<Button
						variant="tertiary"
						isDestructive
						onClick={ onRemoveFile }
						style={ { marginTop: '10px' } }
					>
						{ __( 'Remove File', 'gll-info' ) }
					</Button>
				</PanelBody>

				<PanelBody
					title={ __( 'Geometry Options', 'gll-info' ) }
					initialOpen={ true }
				>
					{ geometryOptions.length > 1 && (
						<SelectControl
							__next40pxDefaultSize
							__nextHasNoMarginBottom
							label={ __( 'Geometry', 'gll-info' ) }
							value={ String(
								Math.min(
									geometryIndex,
									geometryOptions.length - 1
								)
							) }
							options={ geometryOptions }
							onChange={ ( value ) =>
								setAttributes( {
									geometryIndex: parseInt( value, 10 ),
								} )
							}
							help={ __(
								'Select which case geometry to display.',
								'gll-info'
							) }
						/>
					) }
					<ToggleControl
						label={ __( 'Show Faces', 'gll-info' ) }
						checked={ showFaces }
						onChange={ ( value ) =>
							setAttributes( { showFaces: value } )
						}
					/>
					<ToggleControl
						label={ __( 'Show Edges', 'gll-info' ) }
						checked={ showEdges }
						onChange={ ( value ) =>
							setAttributes( { showEdges: value } )
						}
					/>
					<ToggleControl
						label={ __( 'Show Sources', 'gll-info' ) }
						checked={ showSources }
						onChange={ ( value ) =>
							setAttributes( { showSources: value } )
						}
					/>
					<ToggleControl
						label={ __( 'Center on Reference', 'gll-info' ) }
						checked={ centerReference }
						onChange={ ( value ) =>
							setAttributes( { centerReference: value } )
						}
					/>
					<ToggleControl
						label={ __( 'Auto-Rotate', 'gll-info' ) }
						checked={ autoRotate }
						onChange={ ( value ) =>
							setAttributes( { autoRotate: value } )
						}
					/>
					<RangeControl
						label={ __( 'Canvas Height (px)', 'gll-info' ) }
						value={ canvasHeight }
						onChange={ ( value ) =>
							setAttributes( { canvasHeight: value } )
						}
						min={ 200 }
						max={ 800 }
						step={ 50 }
					/>
				</PanelBody>

				<PanelBody
					title={ __( 'Markers', 'gll-info' ) }
					initialOpen={ false }
				>
					<ToggleControl
						label={ __( 'Reference Point', 'gll-info' ) }
						checked={ showMarkers?.ref }
						onChange={ ( value ) =>
							setAttributes( {
								showMarkers: { ...showMarkers, ref: value },
							} )
						}
					/>
					<ToggleControl
						label={ __( 'Center of Mass', 'gll-info' ) }
						checked={ showMarkers?.com }
						onChange={ ( value ) =>
							setAttributes( {
								showMarkers: { ...showMarkers, com: value },
							} )
						}
					/>
					<ToggleControl
						label={ __( 'Next Pivot', 'gll-info' ) }
						checked={ showMarkers?.pivot }
						onChange={ ( value ) =>
							setAttributes( {
								showMarkers: { ...showMarkers, pivot: value },
							} )
						}
					/>
				</PanelBody>

				<AppearanceControl
					appearance={ appearance }
					onChange={ ( value ) =>
						setAttributes( { appearance: value } )
					}
				/>
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-geometry-block">
					<div className="gll-geometry-header">
						<h3>{ fileName }</h3>
					</div>

					{ isLoading && (
						<div className="gll-geometry-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data…', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-geometry-error">
							<p>
								{ __( 'Error loading GLL file:', 'gll-info' ) }{ ' ' }
								{ error.message }
							</p>
						</div>
					) }

					{ ! webGLSupported && (
						<div className="gll-geometry-error">
							<p>
								{ __(
									'WebGL is not supported in your browser. Please use a modern browser to view 3D content.',
									'gll-info'
								) }
							</p>
						</div>
					) }

					{ ! isLoading && ! error && geometrySceneData && (
						<div className="gll-geometry-metadata">
							{ geometryStats?.vertexCount > 0 && (
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Vertices:', 'gll-info' ) }
									</strong>{ ' ' }
									{ geometryStats.vertexCount }
								</span>
							) }
							{ geometryStats?.edgeCount > 0 && (
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Edges:', 'gll-info' ) }
									</strong>{ ' ' }
									{ geometryStats.edgeCount }
								</span>
							) }
							{ geometryStats?.faceCount > 0 && (
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Faces:', 'gll-info' ) }
									</strong>{ ' ' }
									{ geometryStats.faceCount }
								</span>
							) }
							{ typeof isSymmetric === 'boolean' && (
								<span
									className={
										isSymmetric
											? 'gll-meta-badge gll-meta-badge-highlight'
											: 'gll-meta-badge'
									}
								>
									<strong>
										{ __( 'Symmetry:', 'gll-info' ) }
									</strong>{ ' ' }
									{ isSymmetric
										? __( 'Symmetric', 'gll-info' )
										: __( 'Asymmetric', 'gll-info' ) }
								</span>
							) }
							{ largestDimension !== null && (
								<span className="gll-meta-badge">
									<strong>
										{ __(
											'Largest Dimension:',
											'gll-info'
										) }
									</strong>{ ' ' }
									{ formatNumber( largestDimension ) }
									{ ' mm' }
								</span>
							) }
							{ geometryBounds && (
								<span className="gll-meta-badge">
									<strong>
										{ __(
											'Bounds (W × H × D):',
											'gll-info'
										) }
									</strong>{ ' ' }
									{ formatNumber( geometryBounds.size.x ) }
									{ ' × ' }
									{ formatNumber( geometryBounds.size.y ) }
									{ ' × ' }
									{ formatNumber( geometryBounds.size.z ) }
									{ ' mm' }
								</span>
							) }
							{ referencePoint && (
								<span className="gll-meta-badge">
									<strong>
										{ __(
											'Reference Point (mm):',
											'gll-info'
										) }
									</strong>{ ' ' }
									{ formatPoint( referencePoint ) }
								</span>
							) }
							{ centerOfMassPoint && (
								<span className="gll-meta-badge">
									<strong>
										{ __(
											'Center of Mass (mm):',
											'gll-info'
										) }
									</strong>{ ' ' }
									{ formatPoint( centerOfMassPoint ) }
								</span>
							) }
							{ showSources && sourcePlacementCount > 0 && (
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Sources:', 'gll-info' ) }
									</strong>{ ' ' }
									{ sourcePlacementCount }
								</span>
							) }
						</div>
					) }

					{ ! isLoading && ! error && webGLSupported && (
						<div className="gll-geometry-canvas">
							<GeometryViewer
								ref={ viewerRef }
								height={ canvasHeight }
								onAnimate={ handleAnimate }
								onSceneReady={ handleSceneReady }
								onResize={ handleResize }
							/>
						</div>
					) }
				</div>
			</div>
		</>
	);
}
