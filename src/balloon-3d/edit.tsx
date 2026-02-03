/**
 * 3D Balloon Block - Editor Component
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
	SelectControl,
	ToggleControl,
	RangeControl,
	Placeholder,
	Spinner,
} from '@wordpress/components';
import { useEffect, useState, useMemo, useCallback, useRef } from '@wordpress/element';
import * as THREE from 'three';

import { useGLLLoader, ThreeWrapper, isWebGLSupported } from '../shared';
import type { ThreeWrapperRef } from '../shared';
import { formatFrequency } from '../shared/charting-utils';
import {
	getBalloonGrid,
	buildBalloonGeometryData,
	computeGlobalMaxLevel,
} from '../shared/balloon-utils';
import type { BalloonGridInfo } from '../shared/balloon-utils';
import './editor.scss';

/**
 * Edit component for the 3D Balloon block.
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
		sourceIndex,
		frequencyIndex,
		dbRange,
		scale,
		wireframe,
		autoRotate,
		showReferenceSphere,
		showAxesHelper,
		canvasHeight,
	} = attributes;

	const blockProps = useBlockProps();
	const { data, isLoading, error, load, clear } = useGLLLoader();
	const [ loadAttempted, setLoadAttempted ] = useState( false );
	const threeRef = useRef< ThreeWrapperRef >( null );
	const balloonMeshRef = useRef< THREE.Mesh | null >( null );

	// Check WebGL support
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

	// Build source options
	const sourceOptions = useMemo( () =>
		( data?.Database?.SourceDefinitions || [] )
			.filter( ( s ) => ( s.Responses || [] ).length > 0 )
			.map( ( source, index ) => ( {
				label: source.Definition?.Label || source.Label || `Source ${ index + 1 }`,
				value: index,
			} ) ),
		[ data ]
	);

	// Get current source (only sources with responses)
	const sourcesWithResponses = useMemo( () =>
		( data?.Database?.SourceDefinitions || [] )
			.filter( ( s ) => ( s.Responses || [] ).length > 0 ),
		[ data ]
	);
	const currentSource = sourcesWithResponses[ sourceIndex ];

	// Get frequencies from sample response
	const frequencies = useMemo( () => {
		const resp = currentSource?.Responses?.[ 0 ];
		return resp?.Frequencies || [];
	}, [ currentSource ] );

	// Build frequency options
	const frequencyOptions = useMemo( () =>
		frequencies.map( ( freq, index ) => ( {
			label: formatFrequency( freq ),
			value: index,
		} ) ),
		[ frequencies ]
	);

	// Get balloon grid data
	const balloonGrid = useMemo( () => {
		if ( ! currentSource ) {
			return null;
		}
		return getBalloonGrid( currentSource ) as BalloonGridInfo | null;
	}, [ currentSource ] );

	// Get global max level (cached)
	const globalMax = useMemo( () => {
		if ( ! currentSource ) {
			return 0;
		}
		return computeGlobalMaxLevel( currentSource );
	}, [ currentSource ] );

	// Calculate display range
	const displayMax = globalMax;
	const displayMin = globalMax - dbRange;

	/**
	 * Build the balloon mesh geometry using new utilities with symmetry handling.
	 */
	const buildBalloonMesh = useCallback( () => {
		if ( ! threeRef.current?.scene || ! balloonGrid || frequencies.length === 0 || ! currentSource ) {
			return;
		}

		const scene = threeRef.current.scene;

		// Remove existing balloon mesh
		if ( balloonMeshRef.current ) {
			scene.remove( balloonMeshRef.current );
			balloonMeshRef.current.geometry.dispose();
			if ( balloonMeshRef.current.material instanceof THREE.Material ) {
				balloonMeshRef.current.material.dispose();
			}
			balloonMeshRef.current = null;
		}

		const freqIdx = Math.min( frequencyIndex, frequencies.length - 1 );

		// Build geometry data using new utilities with symmetry handling
		const geometryData = buildBalloonGeometryData( currentSource, {
			frequencyIndex: freqIdx,
			dbRange,
			scale,
		} );

		if ( ! geometryData ) {
			return;
		}

		// Create Three.js geometry
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute(
			'position',
			new THREE.Float32BufferAttribute( geometryData.vertices, 3 )
		);
		geometry.setAttribute(
			'color',
			new THREE.Float32BufferAttribute( geometryData.colors, 3 )
		);
		geometry.setIndex( geometryData.indices );
		geometry.computeVertexNormals();

		// Create material
		const material = new THREE.MeshStandardMaterial( {
			vertexColors: true,
			wireframe,
			flatShading: true,
			metalness: 0.05,
			roughness: 0.75,
			side: THREE.DoubleSide,
		} );

		const mesh = new THREE.Mesh( geometry, material );
		scene.add( mesh );
		balloonMeshRef.current = mesh;
	}, [ balloonGrid, frequencies, frequencyIndex, currentSource, dbRange, scale, wireframe ] );

	// Rebuild mesh when parameters change
	useEffect( () => {
		buildBalloonMesh();
	}, [ buildBalloonMesh ] );

	// Handle scene ready
	const handleSceneReady = useCallback( ( scene: THREE.Scene ) => {
		// Build initial mesh
		buildBalloonMesh();
	}, [ buildBalloonMesh ] );

	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<Placeholder
					icon="admin-site-alt3"
					label={ __( 'GLL 3D Balloon', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to display 3D directivity balloon.',
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

				{ data && (
					<>
						<PanelBody title={ __( 'Source & Frequency', 'gll-info' ) } initialOpen={ true }>
							{ sourceOptions.length > 0 && (
								<SelectControl
									label={ __( 'Acoustic Source', 'gll-info' ) }
									value={ sourceIndex }
									options={ sourceOptions }
									onChange={ ( value ) =>
										setAttributes( { sourceIndex: parseInt( value, 10 ) } )
									}
								/>
							) }
							{ frequencyOptions.length > 0 && (
								<>
									<SelectControl
										label={ __( 'Frequency', 'gll-info' ) }
										value={ frequencyIndex }
										options={ frequencyOptions }
										onChange={ ( value ) =>
											setAttributes( { frequencyIndex: parseInt( value, 10 ) } )
										}
									/>
									<RangeControl
										label={ __( 'Frequency Index', 'gll-info' ) }
										value={ frequencyIndex }
										onChange={ ( value ) =>
											setAttributes( { frequencyIndex: value } )
										}
										min={ 0 }
										max={ Math.max( 0, frequencies.length - 1 ) }
									/>
								</>
							) }
						</PanelBody>

						<PanelBody title={ __( 'Display Options', 'gll-info' ) } initialOpen={ false }>
							<RangeControl
								label={ __( 'dB Range', 'gll-info' ) }
								value={ dbRange }
								onChange={ ( value ) =>
									setAttributes( { dbRange: value } )
								}
								min={ 20 }
								max={ 80 }
								step={ 5 }
								help={ __( 'Dynamic range for level display (dB)', 'gll-info' ) }
							/>
							<RangeControl
								label={ __( 'Scale', 'gll-info' ) }
								value={ scale }
								onChange={ ( value ) =>
									setAttributes( { scale: value } )
								}
								min={ 0.6 }
								max={ 1.6 }
								step={ 0.1 }
								help={ __( 'Size multiplier for the balloon', 'gll-info' ) }
							/>
							<ToggleControl
								label={ __( 'Wireframe', 'gll-info' ) }
								checked={ wireframe }
								onChange={ ( value ) =>
									setAttributes( { wireframe: value } )
								}
								help={ __( 'Show mesh as wireframe', 'gll-info' ) }
							/>
							<ToggleControl
								label={ __( 'Auto-Rotate', 'gll-info' ) }
								checked={ autoRotate }
								onChange={ ( value ) =>
									setAttributes( { autoRotate: value } )
								}
								help={ __( 'Automatically rotate the balloon', 'gll-info' ) }
							/>
							<ToggleControl
								label={ __( 'Show Reference Sphere', 'gll-info' ) }
								checked={ showReferenceSphere }
								onChange={ ( value ) =>
									setAttributes( { showReferenceSphere: value } )
								}
								help={ __( 'Show wireframe unit sphere for reference', 'gll-info' ) }
							/>
							<ToggleControl
								label={ __( 'Show Axes', 'gll-info' ) }
								checked={ showAxesHelper }
								onChange={ ( value ) =>
									setAttributes( { showAxesHelper: value } )
								}
								help={ __( 'Show X/Y/Z axes helper', 'gll-info' ) }
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
					</>
				) }
			</InspectorControls>

			<div { ...blockProps }>
				<div className="gll-balloon-3d-block">
					<div className="gll-balloon-3d-header">
						<h3>{ fileName }</h3>
						{ currentSource && (
							<p className="gll-source-label">
								{ __( 'Source:', 'gll-info' ) }{ ' ' }
								{ currentSource.Definition?.Label || currentSource.Label }
							</p>
						) }
					</div>

					{ isLoading && (
						<div className="gll-balloon-3d-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data...', 'gll-info' ) }</p>
						</div>
					) }

					{ error && (
						<div className="gll-balloon-3d-error">
							<p>
								{ __( 'Error loading GLL file:', 'gll-info' ) }{ ' ' }
								{ error.message }
							</p>
						</div>
					) }

					{ ! webGLSupported && (
						<div className="gll-balloon-3d-error">
							<p>
								{ __( 'WebGL is not supported in your browser. Please use a modern browser to view 3D content.', 'gll-info' ) }
							</p>
						</div>
					) }

					{ data && webGLSupported && balloonGrid && (
						<>
							<div className="gll-balloon-3d-metadata">
								<span className="gll-meta-badge">
									<strong>{ __( 'Frequency:', 'gll-info' ) }</strong>{ ' ' }
									{ formatFrequency( frequencies[ Math.min( frequencyIndex, frequencies.length - 1 ) ] ) }
								</span>
								<span className="gll-meta-badge">
									<strong>{ __( 'Display Range:', 'gll-info' ) }</strong>{ ' ' }
									{ displayMin.toFixed( 1 ) } &ndash; { displayMax.toFixed( 1 ) } dB
								</span>
								<span className="gll-meta-badge">
									<strong>{ __( 'Grid:', 'gll-info' ) }</strong>{ ' ' }
									{ balloonGrid.fullMeridianCount } &times; { balloonGrid.fullParallelCount }
								</span>
								<span className="gll-meta-badge">
									<strong>{ __( 'Resolution:', 'gll-info' ) }</strong>{ ' ' }
									{ balloonGrid.meridianStep }&deg; &times; { balloonGrid.parallelStep }&deg;
								</span>
								<span className="gll-meta-badge">
									<strong>{ __( 'Symmetry:', 'gll-info' ) }</strong>{ ' ' }
									{ balloonGrid.symmetryName }
								</span>
								{ wireframe && (
									<span className="gll-meta-badge gll-meta-badge-highlight">
										{ __( 'Wireframe', 'gll-info' ) }
									</span>
								) }
								{ autoRotate && (
									<span className="gll-meta-badge gll-meta-badge-highlight">
										{ __( 'Auto-Rotate', 'gll-info' ) }
									</span>
								) }
							</div>
							<div className="gll-balloon-3d-colorbar">
								<div className="gll-colorbar-gradient" />
								<div className="gll-colorbar-labels">
									<span>{ displayMin.toFixed( 0 ) } dB</span>
									<span>{ ( ( displayMin + displayMax ) / 2 ).toFixed( 0 ) } dB</span>
									<span>{ displayMax.toFixed( 0 ) } dB</span>
								</div>
							</div>
							<div className="gll-balloon-3d-canvas">
								<ThreeWrapper
									ref={ threeRef }
									height={ canvasHeight }
									config={ {
										showReferenceSphere,
										showAxesHelper,
										autoRotate,
									} }
									onSceneReady={ handleSceneReady }
								/>
							</div>
						</>
					) }

					{ data && ! balloonGrid && (
						<div className="gll-balloon-3d-empty">
							<p>
								{ __(
									'No directivity data available for this source.',
									'gll-info'
								) }
							</p>
						</div>
					) }
				</div>
			</div>
		</>
	);
}
