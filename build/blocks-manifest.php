<?php
// This file is generated. Do not modify it manually.
return array(
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
		'parent' => array(
			'gll-info/gll-info'
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
			'azimuth' => array(
				'type' => 'number',
				'default' => 0
			),
			'elevation' => array(
				'type' => 'number',
				'default' => 0
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
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll',
				'phaseMode' => 'unwrapped'
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
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
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
		'parent' => array(
			'gll-info/gll-info'
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
			)
		),
		'example' => array(
			'attributes' => array(
				'fileName' => 'example-speaker.gll'
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
