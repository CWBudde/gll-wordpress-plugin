<?php
// This file is generated. Do not modify it manually.
return array(
	'balloon-3d' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/balloon-3d',
		'version' => '0.1.0',
		'title' => 'GLL 3D Balloon',
		'category' => 'media',
		'icon' => 'admin-site-alt3',
		'description' => 'Display 3D directivity balloon visualization from GLL file acoustic data using Three.js.',
		'keywords' => array(
			'gll',
			'3d',
			'balloon',
			'directivity',
			'three',
			'visualization'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'sourceIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'frequencyIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'dbRange' => array(
				'type' => 'number',
				'default' => 40
			),
			'scale' => array(
				'type' => 'number',
				'default' => 1
			),
			'wireframe' => array(
				'type' => 'boolean',
				'default' => false
			),
			'autoRotate' => array(
				'type' => 'boolean',
				'default' => false
			),
			'showReferenceSphere' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showAxesHelper' => array(
				'type' => 'boolean',
				'default' => true
			),
			'canvasHeight' => array(
				'type' => 'number',
				'default' => 500
			),
			'qualityPreset' => array(
				'type' => 'string',
				'enum' => array(
					'low',
					'medium',
					'high'
				),
				'default' => 'medium'
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'wireframe',
				'title' => 'GLL Wireframe Balloon',
				'description' => '3D directivity balloon drawn as a wireframe mesh instead of a solid surface.',
				'icon' => 'admin-site-alt3',
				'attributes' => array(
					'wireframe' => true
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'minimal',
				'title' => 'GLL Balloon (Minimal)',
				'description' => '3D directivity balloon without the reference sphere and axes helper, for a clean presentation view.',
				'icon' => 'admin-site-alt3',
				'attributes' => array(
					'showReferenceSphere' => false,
					'showAxesHelper' => false
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'config' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/config',
		'version' => '0.1.0',
		'title' => 'GLL Configuration',
		'category' => 'media',
		'icon' => 'admin-settings',
		'description' => 'Show the configuration of a GLL file: box types, frames, filter groups, limits and warnings.',
		'keywords' => array(
			'gll',
			'config',
			'box types',
			'frames',
			'filters',
			'limits'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'showBoxTypes' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showFrames' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showFilterGroups' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showLimits' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showWarnings' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showGeometrySummary' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showFilterDetails' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showPinPoints' => array(
				'type' => 'boolean',
				'default' => false
			),
			'initiallyCollapsed' => array(
				'type' => 'boolean',
				'default' => false
			),
			'rememberCollapsed' => array(
				'type' => 'boolean',
				'default' => true
			),
			'hideWhenEmpty' => array(
				'type' => 'boolean',
				'default' => false
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'rigging',
				'title' => 'GLL Rigging Configuration',
				'description' => 'Box types, frames, limits and warnings — the mechanical configuration, without the DSP filter groups.',
				'icon' => 'admin-settings',
				'attributes' => array(
					'showFilterGroups' => false,
					'showFilterDetails' => false
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'filters',
				'title' => 'GLL Filter Configuration',
				'description' => 'Only the DSP filter groups and their filter details.',
				'icon' => 'admin-settings',
				'attributes' => array(
					'showBoxTypes' => false,
					'showFrames' => false,
					'showLimits' => false,
					'showWarnings' => false,
					'showGeometrySummary' => false
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'frequency-response' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/frequency-response',
		'version' => '0.1.0',
		'title' => 'GLL Frequency Response',
		'category' => 'media',
		'icon' => 'chart-line',
		'description' => 'Display frequency response chart from GLL file acoustic data with interactive controls.',
		'keywords' => array(
			'gll',
			'frequency',
			'response',
			'chart',
			'acoustic'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'sourceIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'responseIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'phaseMode' => array(
				'type' => 'string',
				'default' => 'unwrapped',
				'enum' => array(
					'unwrapped',
					'wrapped',
					'group-delay'
				)
			),
			'normalized' => array(
				'type' => 'boolean',
				'default' => false
			),
			'showPhase' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showMagnitude' => array(
				'type' => 'boolean',
				'default' => true
			),
			'chartHeight' => array(
				'type' => 'number',
				'default' => 400
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll',
				'phaseMode' => 'unwrapped'
			)
		),
		'variations' => array(
			array(
				'name' => 'magnitude-only',
				'title' => 'GLL Magnitude Response',
				'description' => 'Frequency response chart showing magnitude only, without the phase trace.',
				'icon' => 'chart-line',
				'attributes' => array(
					'showPhase' => false
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'normalized',
				'title' => 'GLL Normalized Response',
				'description' => 'Frequency response normalized to its on-axis maximum, for comparing shapes rather than absolute levels.',
				'icon' => 'chart-line',
				'attributes' => array(
					'normalized' => true
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'geometry' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/geometry',
		'version' => '0.1.0',
		'title' => 'GLL Geometry Viewer',
		'category' => 'media',
		'icon' => 'admin-site-alt3',
		'description' => 'Display GLL case geometry in a Three.js viewer.',
		'keywords' => array(
			'gll',
			'geometry',
			'3d',
			'viewer',
			'three'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'geometryIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'showFaces' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showEdges' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showMarkers' => array(
				'type' => 'object',
				'default' => array(
					'ref' => true,
					'com' => true,
					'pivot' => false
				)
			),
			'showSources' => array(
				'type' => 'boolean',
				'default' => false
			),
			'centerReference' => array(
				'type' => 'boolean',
				'default' => false
			),
			'autoRotate' => array(
				'type' => 'boolean',
				'default' => false
			),
			'canvasHeight' => array(
				'type' => 'number',
				'default' => 500
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'wireframe',
				'title' => 'GLL Wireframe Geometry',
				'description' => 'Cabinet geometry drawn as edges only, without shaded faces.',
				'icon' => 'admin-site-alt3',
				'attributes' => array(
					'showFaces' => false
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'turntable',
				'title' => 'GLL Rotating Geometry',
				'description' => 'Cabinet geometry that rotates on its own, for use as a display element.',
				'icon' => 'admin-site-alt3',
				'attributes' => array(
					'autoRotate' => true
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'gll-info' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/gll-info',
		'version' => '0.1.0',
		'title' => 'GLL File Viewer',
		'category' => 'media',
		'icon' => 'format-audio',
		'description' => 'Display GLL (Generic Loudspeaker Library) file data with interactive visualizations.',
		'keywords' => array(
			'gll',
			'loudspeaker',
			'audio',
			'acoustic',
			'frequency response'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'showOverview' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showSources' => array(
				'type' => 'boolean',
				'default' => true
			),
			'sourcesDisplayMode' => array(
				'type' => 'string',
				'default' => 'expandable',
				'enum' => array(
					'compact',
					'detailed',
					'expandable'
				)
			),
			'showSourceResponseCharts' => array(
				'type' => 'boolean',
				'default' => false
			),
			'showResponses' => array(
				'type' => 'boolean',
				'default' => true
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'overview-only',
				'title' => 'GLL Overview',
				'description' => 'Manufacturer, model and format metadata only, without the acoustic source listing.',
				'icon' => 'format-audio',
				'attributes' => array(
					'showSources' => false,
					'showResponses' => false
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'polar-plot' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/polar-plot',
		'version' => '0.1.0',
		'title' => 'GLL Polar Plot',
		'category' => 'media',
		'icon' => 'chart-pie',
		'description' => 'Display polar directivity plot from GLL file acoustic data with horizontal and vertical slices.',
		'keywords' => array(
			'gll',
			'polar',
			'directivity',
			'plot',
			'acoustic'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'sourceIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'frequencyIndex' => array(
				'type' => 'number',
				'default' => 0
			),
			'showHorizontal' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showVertical' => array(
				'type' => 'boolean',
				'default' => true
			),
			'normalized' => array(
				'type' => 'boolean',
				'default' => false
			),
			'chartHeight' => array(
				'type' => 'number',
				'default' => 400
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'horizontal',
				'title' => 'GLL Horizontal Polar Plot',
				'description' => 'Polar directivity plot showing the horizontal slice only.',
				'icon' => 'chart-pie',
				'attributes' => array(
					'showVertical' => false
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'vertical',
				'title' => 'GLL Vertical Polar Plot',
				'description' => 'Polar directivity plot showing the vertical slice only.',
				'icon' => 'chart-pie',
				'attributes' => array(
					'showHorizontal' => false
				),
				'scope' => array(
					'inserter'
				)
			),
			array(
				'name' => 'normalized',
				'title' => 'GLL Normalized Polar Plot',
				'description' => 'Polar plot normalized to the on-axis level, so the coverage pattern is read directly in dB relative to the axis.',
				'icon' => 'chart-pie',
				'attributes' => array(
					'normalized' => true
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	),
	'resources' => array(
		'$schema' => 'https://schemas.wp.org/trunk/block.json',
		'apiVersion' => 3,
		'name' => 'gll-info/resources',
		'version' => '0.1.0',
		'title' => 'GLL Resources',
		'category' => 'media',
		'icon' => 'media-document',
		'description' => 'List the documentation and data files embedded in a GLL file, with previews and downloads.',
		'keywords' => array(
			'gll',
			'resources',
			'documents',
			'downloads',
			'datasheet'
		),
		'attributes' => array(
			'fileId' => array(
				'type' => 'number',
				'default' => 0
			),
			'fileUrl' => array(
				'type' => 'string',
				'default' => ''
			),
			'fileName' => array(
				'type' => 'string',
				'default' => ''
			),
			'showDocumentation' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showDataFiles' => array(
				'type' => 'boolean',
				'default' => true
			),
			'showPreviews' => array(
				'type' => 'boolean',
				'default' => true
			),
			'previewMaxHeight' => array(
				'type' => 'number',
				'default' => 240
			),
			'hideWhenEmpty' => array(
				'type' => 'boolean',
				'default' => false
			),
			'appearance' => array(
				'type' => 'string',
				'enum' => array(
					'auto',
					'plain',
					'transparent'
				),
				'default' => 'auto'
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
			)
		),
		'variations' => array(
			array(
				'name' => 'documentation',
				'title' => 'GLL Documentation',
				'description' => 'Only the documentation embedded in the GLL file, without the raw data files.',
				'icon' => 'media-document',
				'attributes' => array(
					'showDataFiles' => false
				),
				'scope' => array(
					'inserter'
				)
			)
		),
		'supports' => array(
			'html' => false,
			'align' => array(
				'wide',
				'full'
			)
		),
		'textdomain' => 'gll-info',
		'editorScript' => 'file:./index.js',
		'editorStyle' => 'file:./index.css',
		'style' => 'file:./style-index.css',
		'viewScript' => 'file:./view.js'
	)
);
