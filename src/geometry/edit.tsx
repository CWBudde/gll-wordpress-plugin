/**
 * Geometry Viewer Block - Editor Component
 *
 * @package
 */

import { __ } from '@wordpress/i18n';
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

	const geometryCount = useMemo(
		() => data?.Database?.CaseGeometries?.length || 0,
		[ data ]
	);
	const geometryMax = geometryCount > 0 ? geometryCount - 1 : 10;

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
			markers: buildGeometryMarkers( caseGeometry, {
				center,
				scale,
				visibility: showMarkers,
			} ),
		};
	}, [ caseGeometry, centerReference, showMarkers ] );

	const geometryData = geometrySceneData?.meshData || null;
	const markerData = geometrySceneData?.markers ?? NO_MARKERS;

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
					<RangeControl
						label={ __( 'Geometry Index', 'gll-info' ) }
						value={ geometryIndex }
						onChange={ ( value ) =>
							setAttributes( { geometryIndex: value } )
						}
						min={ 0 }
						max={ geometryMax }
						help={ __(
							'Select which case geometry to display (if multiple).',
							'gll-info'
						) }
					/>
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
