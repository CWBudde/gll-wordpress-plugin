/**
 * 3D Balloon Block - Editor Component
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';
import { InspectorControls, useBlockProps } from '@wordpress/block-editor';
import {
	PanelBody,
	SelectControl,
	ToggleControl,
	RangeControl,
	Spinner,
} from '@wordpress/components';
import {
	useEffect,
	useState,
	useMemo,
	useCallback,
	useRef,
} from '@wordpress/element';
import * as THREE from 'three';

import {
	useFileSource,
	FileSourceControl,
	useCachePublisher,
	ThreeWrapper,
	isWebGLSupported,
	AppearanceControl,
	appearanceClass,
	resolveTheme,
} from '../shared';
import type { ThreeWrapperRef } from '../shared';
import { applySceneTheme } from './theme-three';
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
		qualityPreset,
		appearance,
	} = attributes;

	const blockProps = useBlockProps( {
		className: appearanceClass( appearance ),
	} );
	const {
		data,
		parsedFrom,
		isLoading,
		error,
		source: fileSource,
		setSource,
		clearSource,
		reload,
	} = useFileSource( {
		attributes: { fileId, fileUrl, fileName },
		setAttributes,
	} );

	// This block renders from a full parse and never from the cache, but the
	// file it just parsed is very likely the one a `gll-info` or `config` block
	// elsewhere on the site uses — so warm it while the data is free.
	useCachePublisher( { fileId, fileUrl, data, parsedFrom } );
	const threeRef = useRef< ThreeWrapperRef >( null );
	const balloonMeshRef = useRef< THREE.Mesh | null >( null );
	const visibilityRef = useRef< HTMLDivElement | null >( null );
	const fillLightRef = useRef< THREE.DirectionalLight | null >( null );
	const [ paused, setPaused ] = useState( false );

	// Check WebGL support
	const webGLSupported = useMemo( () => isWebGLSupported(), [] );

	// Map quality preset to render parameters.
	const presetSettings = useMemo( () => {
		switch ( qualityPreset ) {
			case 'low':
				return {
					subsampleStride: 2,
					maxPixelRatio: 1,
					antialias: false,
					directionalLightIntensity: 0,
					fillLight: false,
				};
			case 'high':
				return {
					subsampleStride: 1,
					maxPixelRatio: 2,
					antialias: true,
					directionalLightIntensity: 0.85,
					fillLight: true,
				};
			case 'medium':
			default:
				return {
					subsampleStride: 1,
					maxPixelRatio: 2,
					antialias: true,
					directionalLightIntensity: 0.85,
					fillLight: false,
				};
		}
	}, [ qualityPreset ] );

	// Build source options
	const sourceOptions = useMemo(
		() =>
			( data?.Database?.SourceDefinitions || [] )
				.filter( ( s ) => ( s.Responses || [] ).length > 0 )
				.map( ( source, index ) => ( {
					label:
						source.Definition?.Label ||
						source.Label ||
						sprintf(
							/* translators: %d: source number. */
							__( 'Source %d', 'gll-info' ),
							index + 1
						),
					value: index,
				} ) ),
		[ data ]
	);

	// Get current source (only sources with responses)
	const sourcesWithResponses = useMemo(
		() =>
			( data?.Database?.SourceDefinitions || [] ).filter(
				( s ) => ( s.Responses || [] ).length > 0
			),
		[ data ]
	);
	const currentSource = sourcesWithResponses[ sourceIndex ];

	// Get frequencies from sample response
	const frequencies = useMemo( () => {
		const resp = currentSource?.Responses?.[ 0 ];
		return resp?.Frequencies || [];
	}, [ currentSource ] );

	// Build frequency options
	const frequencyOptions = useMemo(
		() =>
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
		if (
			! threeRef.current?.scene ||
			! balloonGrid ||
			frequencies.length === 0 ||
			! currentSource
		) {
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
			subsampleStride: presetSettings.subsampleStride,
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
	}, [
		balloonGrid,
		frequencies,
		frequencyIndex,
		currentSource,
		dbRange,
		scale,
		wireframe,
		presetSettings.subsampleStride,
	] );

	// Rebuild mesh when parameters change
	useEffect( () => {
		buildBalloonMesh();
	}, [ buildBalloonMesh ] );

	// Add/remove a fill light based on the current quality preset.
	const syncFillLight = useCallback( () => {
		const scene = threeRef.current?.scene;
		if ( ! scene ) {
			return;
		}
		if ( presetSettings.fillLight && ! fillLightRef.current ) {
			const fill = new THREE.DirectionalLight( 0xffffff, 0.4 );
			fill.position.set( -2, -1, -2 );
			scene.add( fill );
			fillLightRef.current = fill;
		} else if ( ! presetSettings.fillLight && fillLightRef.current ) {
			scene.remove( fillLightRef.current );
			fillLightRef.current.dispose();
			fillLightRef.current = null;
		}
	}, [ presetSettings.fillLight ] );

	useEffect( () => {
		syncFillLight();
	}, [ syncFillLight, data ] );

	// Tint the scene chrome (axes helper, reference sphere) with the block's
	// resolved theme tokens. Lights and the balloon colormap stay untouched.
	const themeScene = useCallback( () => {
		const scene = threeRef.current?.scene;
		if ( ! scene ) {
			return;
		}
		applySceneTheme( scene, resolveTheme( visibilityRef.current ) );
	}, [] );

	// Re-resolve when the appearance variant changes, since `transparent`
	// swaps the surface the helpers are read against.
	useEffect( () => {
		themeScene();
	}, [ themeScene, appearance, data ] );

	// Handle scene ready
	const handleSceneReady = useCallback( () => {
		syncFillLight();
		// Build initial mesh
		buildBalloonMesh();
		themeScene();
	}, [ buildBalloonMesh, syncFillLight, themeScene ] );

	// Pause animation when the block is scrolled offscreen in the editor.
	useEffect( () => {
		if ( typeof IntersectionObserver === 'undefined' ) {
			return undefined;
		}
		const el = visibilityRef.current;
		if ( ! el ) {
			return undefined;
		}
		const observer = new IntersectionObserver(
			( entries ) => {
				for ( const entry of entries ) {
					setPaused( ! entry.isIntersecting );
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe( el );
		return () => observer.disconnect();
	}, [] );

	// Dispose mesh and fill light on unmount (rebuild path is handled inline).
	useEffect( () => {
		return () => {
			const mesh = balloonMeshRef.current;
			if ( mesh ) {
				mesh.geometry.dispose();
				if ( mesh.material instanceof THREE.Material ) {
					mesh.material.dispose();
				}
				balloonMeshRef.current = null;
			}
			const fill = fillLightRef.current;
			if ( fill ) {
				fill.dispose();
				fillLightRef.current = null;
			}
		};
	}, [] );

	if ( ! fileUrl ) {
		return (
			<div { ...blockProps }>
				<FileSourceControl
					variant="placeholder"
					icon="admin-site-alt3"
					label={ __( 'GLL 3D Balloon', 'gll-info' ) }
					instructions={ __(
						'Select a GLL file to display 3D directivity balloon.',
						'gll-info'
					) }
					value={ fileSource }
					onChange={ setSource }
					onRemove={ clearSource }
				/>
			</div>
		);
	}

	return (
		<>
			<InspectorControls>
				<PanelBody
					title={ __( 'File', 'gll-info' ) }
					initialOpen={ true }
				>
					<FileSourceControl
						variant="inspector"
						value={ fileSource }
						onChange={ setSource }
						onRemove={ clearSource }
						onRetry={ reload }
						status={ { isLoading, error, via: parsedFrom?.via } }
					/>
				</PanelBody>

				{ data && (
					<>
						<PanelBody
							title={ __( 'Source & Frequency', 'gll-info' ) }
							initialOpen={ true }
						>
							{ sourceOptions.length > 0 && (
								<SelectControl
									label={ __(
										'Acoustic Source',
										'gll-info'
									) }
									value={ sourceIndex }
									options={ sourceOptions }
									onChange={ ( value ) =>
										setAttributes( {
											sourceIndex: parseInt( value, 10 ),
										} )
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
											setAttributes( {
												frequencyIndex: parseInt(
													value,
													10
												),
											} )
										}
									/>
									<RangeControl
										label={ __(
											'Frequency Index',
											'gll-info'
										) }
										value={ frequencyIndex }
										onChange={ ( value ) =>
											setAttributes( {
												frequencyIndex: value,
											} )
										}
										min={ 0 }
										max={ Math.max(
											0,
											frequencies.length - 1
										) }
									/>
								</>
							) }
						</PanelBody>

						<PanelBody
							title={ __( 'Display Options', 'gll-info' ) }
							initialOpen={ false }
						>
							<RangeControl
								label={ __( 'dB Range', 'gll-info' ) }
								value={ dbRange }
								onChange={ ( value ) =>
									setAttributes( { dbRange: value } )
								}
								min={ 20 }
								max={ 80 }
								step={ 5 }
								help={ __(
									'Dynamic range for level display (dB)',
									'gll-info'
								) }
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
								help={ __(
									'Size multiplier for the balloon',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __( 'Wireframe', 'gll-info' ) }
								checked={ wireframe }
								onChange={ ( value ) =>
									setAttributes( { wireframe: value } )
								}
								help={ __(
									'Show mesh as wireframe',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __( 'Auto-Rotate', 'gll-info' ) }
								checked={ autoRotate }
								onChange={ ( value ) =>
									setAttributes( { autoRotate: value } )
								}
								help={ __(
									'Automatically rotate the balloon',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __(
									'Show Reference Sphere',
									'gll-info'
								) }
								checked={ showReferenceSphere }
								onChange={ ( value ) =>
									setAttributes( {
										showReferenceSphere: value,
									} )
								}
								help={ __(
									'Show wireframe unit sphere for reference',
									'gll-info'
								) }
							/>
							<ToggleControl
								label={ __( 'Show Axes', 'gll-info' ) }
								checked={ showAxesHelper }
								onChange={ ( value ) =>
									setAttributes( { showAxesHelper: value } )
								}
								help={ __(
									'Show X/Y/Z axes helper',
									'gll-info'
								) }
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
							<SelectControl
								label={ __( 'Quality Preset', 'gll-info' ) }
								value={ qualityPreset || 'medium' }
								options={ [
									{
										label: __( 'Low (faster)', 'gll-info' ),
										value: 'low',
									},
									{
										label: __(
											'Medium (default)',
											'gll-info'
										),
										value: 'medium',
									},
									{
										label: __(
											'High (best lighting)',
											'gll-info'
										),
										value: 'high',
									},
								] }
								onChange={ ( value ) =>
									setAttributes( { qualityPreset: value } )
								}
								help={ __(
									'Low subsamples the angular grid and disables antialiasing. High adds a fill light.',
									'gll-info'
								) }
							/>
						</PanelBody>
					</>
				) }

				<AppearanceControl
					appearance={ appearance }
					onChange={ ( value ) =>
						setAttributes( { appearance: value } )
					}
				/>
			</InspectorControls>

			<div { ...blockProps }>
				<div ref={ visibilityRef } className="gll-balloon-3d-block">
					<div className="gll-balloon-3d-header">
						<h3>{ fileName }</h3>
						{ currentSource && (
							<p className="gll-source-label">
								{ __( 'Source:', 'gll-info' ) }{ ' ' }
								{ currentSource.Definition?.Label ||
									currentSource.Label }
							</p>
						) }
					</div>

					{ isLoading && (
						<div className="gll-balloon-3d-loading">
							<Spinner />
							<p>{ __( 'Loading GLL data…', 'gll-info' ) }</p>
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
								{ __(
									'WebGL is not supported in your browser. Please use a modern browser to view 3D content.',
									'gll-info'
								) }
							</p>
						</div>
					) }

					{ data && webGLSupported && balloonGrid && (
						<>
							<div className="gll-balloon-3d-metadata">
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Frequency:', 'gll-info' ) }
									</strong>{ ' ' }
									{ formatFrequency(
										frequencies[
											Math.min(
												frequencyIndex,
												frequencies.length - 1
											)
										]
									) }
								</span>
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Display Range:', 'gll-info' ) }
									</strong>{ ' ' }
									{ displayMin.toFixed( 1 ) } &ndash;{ ' ' }
									{ displayMax.toFixed( 1 ) } dB
								</span>
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Grid:', 'gll-info' ) }
									</strong>{ ' ' }
									{ balloonGrid.fullMeridianCount } &times;{ ' ' }
									{ balloonGrid.fullParallelCount }
								</span>
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Resolution:', 'gll-info' ) }
									</strong>{ ' ' }
									{ balloonGrid.meridianStep }&deg; &times;{ ' ' }
									{ balloonGrid.parallelStep }&deg;
								</span>
								<span className="gll-meta-badge">
									<strong>
										{ __( 'Symmetry:', 'gll-info' ) }
									</strong>{ ' ' }
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
									<span>
										{ (
											( displayMin + displayMax ) /
											2
										).toFixed( 0 ) }{ ' ' }
										dB
									</span>
									<span>{ displayMax.toFixed( 0 ) } dB</span>
								</div>
							</div>
							<div className="gll-balloon-3d-canvas">
								<ThreeWrapper
									ref={ threeRef }
									height={ canvasHeight }
									paused={ paused }
									config={ {
										showReferenceSphere,
										showAxesHelper,
										autoRotate,
										antialias: presetSettings.antialias,
										maxPixelRatio:
											presetSettings.maxPixelRatio,
										directionalLightIntensity:
											presetSettings.directionalLightIntensity,
									} }
									onSceneReady={ handleSceneReady }
									onResize={ themeScene }
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
