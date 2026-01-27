<?php
// This file is generated. Do not modify it manually.
return array(
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
	)
);
