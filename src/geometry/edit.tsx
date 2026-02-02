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
import { useEffect, useMemo, useState, useCallback } from '@wordpress/element';

import { useGLLLoader, GeometryViewer, isWebGLSupported } from '../shared';
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

	const handleAnimate = useCallback(
		( scene ) => {
			if ( autoRotate ) {
				scene.rotation.y += 0.0035;
			}
		},
		[ autoRotate ]
	);

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
								height={ canvasHeight }
								onAnimate={ handleAnimate }
							/>
						</div>
					) }
				</div>
			</div>
		</>
	);
}
