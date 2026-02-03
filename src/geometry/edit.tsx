/**
 * Geometry Viewer Block - Editor Component
 *
 * @package GllInfo
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
} from '../shared';
import type { GeometryViewerRef } from '../shared';
import './editor.scss';

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
	} = attributes;

	const blockProps = useBlockProps();
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );
	const viewerRef = useRef< GeometryViewerRef >( null );
	const controlsRef = useRef< OrbitControls | null >( null );
	const fallbackCleanupRef = useRef< ( () => void ) | null >( null );

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

	const geometryData = useMemo( () => {
		if ( ! caseGeometry ) {
			return null;
		}
		return buildCaseGeometryData( caseGeometry );
	}, [ caseGeometry ] );

	const geometryGroupRef = useRef< THREE.Group | null >( null );

	const buildGeometry = useCallback( () => {
		const scene = viewerRef.current?.scene;
		if ( ! scene ) {
			return;
		}

		if ( geometryGroupRef.current ) {
			disposeSceneObject( geometryGroupRef.current );
			geometryGroupRef.current = null;
		}

		if ( ! geometryData ) {
			return;
		}

		const group = new THREE.Group();

		if ( showFaces && geometryData.indices.length > 0 ) {
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

			const mesh = new THREE.Mesh( geometry, material );
			group.add( mesh );
		}

		if ( showEdges && geometryData.edgePositions.length > 0 ) {
			const edgeGeometry = new THREE.BufferGeometry();
			edgeGeometry.setAttribute(
				'position',
				new THREE.Float32BufferAttribute(
					geometryData.edgePositions,
					3
				)
			);
			edgeGeometry.setAttribute(
				'color',
				new THREE.Float32BufferAttribute(
					geometryData.edgeColors,
					3
				)
			);

			const edgeMaterial = new THREE.LineBasicMaterial( {
				vertexColors: true,
				transparent: true,
				opacity: 0.9,
			} );

			const edges = new THREE.LineSegments(
				edgeGeometry,
				edgeMaterial
			);
			group.add( edges );
		}

		scene.add( group );
		geometryGroupRef.current = group;
	}, [ geometryData, showFaces, showEdges ] );

	const handleAnimate = useCallback(
		( scene ) => {
			if ( controlsRef.current ) {
				controlsRef.current.update();
				return;
			}
			if ( autoRotate ) {
				scene.rotation.y += 0.0035;
			}
		},
		[ autoRotate ]
	);

	const handleSceneReady = useCallback(
		( scene, camera, renderer ) => {
			buildGeometry();
			if ( controlsRef.current ) {
				controlsRef.current.dispose();
				controlsRef.current = null;
			}
			if ( fallbackCleanupRef.current ) {
				fallbackCleanupRef.current();
				fallbackCleanupRef.current = null;
			}

			try {
				const controls = new OrbitControls( camera, renderer.domElement );
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
			} catch ( error ) {
				console.warn( 'OrbitControls unavailable, using fallback controls.' );
				fallbackCleanupRef.current = attachFallbackControls(
					renderer.domElement,
					scene
				);
			}
		},
		[ autoRotate, buildGeometry ]
	);

	useEffect( () => {
		if ( controlsRef.current ) {
			controlsRef.current.autoRotate = autoRotate;
		}
	}, [ autoRotate ] );

	useEffect( () => () => {
		if ( controlsRef.current ) {
			controlsRef.current.dispose();
			controlsRef.current = null;
		}
		if ( fallbackCleanupRef.current ) {
			fallbackCleanupRef.current();
			fallbackCleanupRef.current = null;
		}
		if ( geometryGroupRef.current ) {
			disposeSceneObject( geometryGroupRef.current );
			geometryGroupRef.current = null;
		}
	}, [] );

	useEffect( () => {
		buildGeometry();
	}, [ buildGeometry ] );

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
							allowedTypes={ [ 'application/x-gll', 'application/octet-stream' ] }
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
							allowedTypes={ [ 'application/x-gll', 'application/octet-stream' ] }
							value={ fileId }
							render={ ( { open } ) => (
								<Button
									variant="secondary"
									onClick={ open }
									style={ { marginTop: '10px', marginRight: '10px' } }
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

				<PanelBody title={ __( 'Geometry Options', 'gll-info' ) } initialOpen={ true }>
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

				<PanelBody title={ __( 'Markers', 'gll-info' ) } initialOpen={ false }>
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
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-geometry-block">
					<div className="gll-geometry-header">
						<h3>{ fileName }</h3>
					</div>

					{ isLoading && (
						<div className="gll-geometry-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data...', 'gll-info' ) }</p>
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
								{ __( 'WebGL is not supported in your browser. Please use a modern browser to view 3D content.', 'gll-info' ) }
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
							/>
						</div>
					) }
				</div>
			</div>
		</>
	);
}

function attachFallbackControls(
	element: HTMLElement,
	scene: THREE.Scene
): () => void {
	let isDragging = false;
	let lastX = 0;
	let lastY = 0;

	const onPointerDown = ( event: PointerEvent ) => {
		isDragging = true;
		lastX = event.clientX;
		lastY = event.clientY;
		element.setPointerCapture( event.pointerId );
	};

	const onPointerMove = ( event: PointerEvent ) => {
		if ( ! isDragging ) {
			return;
		}
		const deltaX = event.clientX - lastX;
		const deltaY = event.clientY - lastY;
		lastX = event.clientX;
		lastY = event.clientY;

		scene.rotation.y += deltaX * 0.005;
		scene.rotation.x += deltaY * 0.005;
	};

	const onPointerUp = ( event: PointerEvent ) => {
		isDragging = false;
		element.releasePointerCapture( event.pointerId );
	};

	element.addEventListener( 'pointerdown', onPointerDown );
	element.addEventListener( 'pointermove', onPointerMove );
	element.addEventListener( 'pointerup', onPointerUp );
	element.addEventListener( 'pointerleave', onPointerUp );

	return () => {
		element.removeEventListener( 'pointerdown', onPointerDown );
		element.removeEventListener( 'pointermove', onPointerMove );
		element.removeEventListener( 'pointerup', onPointerUp );
		element.removeEventListener( 'pointerleave', onPointerUp );
	};
}

function disposeSceneObject( object: THREE.Object3D ) {
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

function disposeMaterial( material: THREE.Material | THREE.Material[] ) {
	if ( Array.isArray( material ) ) {
		material.forEach( ( item ) => item.dispose() );
		return;
	}
	material.dispose();
}
