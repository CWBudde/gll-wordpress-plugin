<?php
/**
 * GLL Block Patterns
 *
 * Registers a "GLL Loudspeaker Data" pattern category plus three ready-made
 * layouts that combine the plugin's blocks into pages an author would
 * otherwise have to assemble by hand:
 *
 *   - gll-info/full-viewer       Every block, in reading order.
 *   - gll-info/quick-overview    Metadata plus embedded documents.
 *   - gll-info/acoustic-analysis The three acoustic visualizations.
 *
 * No file URL in patterns
 * -----------------------
 * A pattern is static content, so it cannot know which GLL file the author
 * wants. `fileId`, `fileUrl` and `fileName` are therefore left at their
 * defaults and the author picks a file per block after inserting. Six of the
 * seven blocks return null from save() while `fileUrl` is empty, so they
 * serialize as self-closing block comments with no inner HTML — which is
 * exactly what the block parser expects and validates cleanly.
 *
 * `gll-info/geometry` is the exception: its save() always emits markup, so the
 * pattern has to carry that markup verbatim or the block fails validation on
 * insert. Rather than drop the geometry viewer from the "Full GLL Viewer"
 * pattern (it is the block a full viewer most obviously needs), the exact
 * save() output for the default attributes is embedded below and pinned by
 * `src/geometry/pattern-content.test.tsx`, which re-serializes the real block
 * and fails if the two ever drift apart.
 *
 * Despite the `class-` filename — kept for consistency with the sibling file in
 * this directory — this file registers plain `gll_info_`-prefixed functions,
 * matching the registration style used throughout `gll-info.php`.
 *
 * @package GllInfo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Slug of the pattern category shared by all GLL patterns.
 */
define( 'GLL_INFO_PATTERN_CATEGORY', 'gll-info' );

/**
 * Serialized markup of `gll-info/geometry` with its default attributes.
 *
 * Byte-for-byte identical to what the block editor produces for a freshly
 * inserted geometry block with no file selected. Do not reformat: any stray
 * whitespace inside the block comment delimiters makes the block invalid.
 *
 * @return string Serialized block markup.
 */
function gll_info_geometry_pattern_block() {
	return '<!-- wp:gll-info/geometry -->' . "\n"
		. '<div class="gll-geometry-block gll-block gll-appearance--auto" data-file-url="" data-file-name="" data-geometry-index="0" data-show-faces="true" data-show-edges="true" data-show-markers-ref="true" data-show-markers-com="true" data-show-markers-pivot="false" data-show-sources="false" data-center-reference="false" data-auto-rotate="false" data-canvas-height="500"><div class="gll-geometry-header"><h3>GLL Geometry</h3></div><div class="gll-geometry-loading"><p>Loading geometry...</p></div><div class="gll-geometry-canvas"></div></div>' . "\n"
		. '<!-- /wp:gll-info/geometry -->';
}

/**
 * Build a core heading block.
 *
 * @param string $text  Already-escaped heading text.
 * @param int    $level Heading level (2 or 3).
 * @return string Serialized block markup.
 */
function gll_info_pattern_heading( $text, $level = 2 ) {
	$attrs = 3 === $level ? ' {"level":3}' : '';

	return sprintf(
		'<!-- wp:heading%1$s --><h%2$d class="wp-block-heading">%3$s</h%2$d><!-- /wp:heading -->',
		$attrs,
		$level,
		$text
	);
}

/**
 * Build a core paragraph block.
 *
 * @param string $text Already-escaped paragraph text.
 * @return string Serialized block markup.
 */
function gll_info_pattern_paragraph( $text ) {
	return sprintf(
		'<!-- wp:paragraph --><p>%s</p><!-- /wp:paragraph -->',
		$text
	);
}

/**
 * Content of the "Full GLL Viewer" pattern.
 *
 * @return string Serialized block markup.
 */
function gll_info_pattern_full_viewer_content() {
	$parts = array(
		gll_info_pattern_heading( esc_html__( 'Loudspeaker Data', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'Select the same GLL file in each block below to build a complete data sheet for this loudspeaker.', 'gll-info' )
		),
		'<!-- wp:gll-info/gll-info /-->',
		gll_info_pattern_heading( esc_html__( 'Frequency Response', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'On-axis magnitude and phase for the selected acoustic source.', 'gll-info' )
		),
		'<!-- wp:gll-info/frequency-response /-->',
		gll_info_pattern_heading( esc_html__( 'Directivity', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'Horizontal and vertical coverage at a single frequency, and the full radiation balloon in three dimensions.', 'gll-info' )
		),
		'<!-- wp:gll-info/polar-plot /-->',
		'<!-- wp:gll-info/balloon-3d /-->',
		gll_info_pattern_heading( esc_html__( 'Cabinet Geometry', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'The enclosure as modelled in the GLL file. Drag to orbit the view.', 'gll-info' )
		),
		gll_info_geometry_pattern_block(),
		gll_info_pattern_heading( esc_html__( 'Configuration', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'Box types, frames, filter groups and the operating limits declared by the manufacturer.', 'gll-info' )
		),
		'<!-- wp:gll-info/config {"initiallyCollapsed":true} /-->',
		gll_info_pattern_heading( esc_html__( 'Documents and Downloads', 'gll-info' ) ),
		'<!-- wp:gll-info/resources {"hideWhenEmpty":true} /-->',
	);

	return implode( "\n\n", $parts );
}

/**
 * Content of the "Quick Overview" pattern.
 *
 * @return string Serialized block markup.
 */
function gll_info_pattern_quick_overview_content() {
	$parts = array(
		gll_info_pattern_heading( esc_html__( 'Loudspeaker at a Glance', 'gll-info' ) ),
		'<!-- wp:gll-info/gll-info {"showSources":false,"showResponses":false} /-->',
		gll_info_pattern_paragraph(
			esc_html__( 'Data sheets and other documents shipped inside the GLL file:', 'gll-info' )
		),
		'<!-- wp:gll-info/resources {"hideWhenEmpty":true} /-->',
	);

	return implode( "\n\n", $parts );
}

/**
 * Content of the "Acoustic Analysis" pattern.
 *
 * @return string Serialized block markup.
 */
function gll_info_pattern_acoustic_analysis_content() {
	$parts = array(
		gll_info_pattern_heading( esc_html__( 'Acoustic Analysis', 'gll-info' ) ),
		gll_info_pattern_paragraph(
			esc_html__( 'Frequency response, polar coverage and the three-dimensional radiation balloon for one acoustic source.', 'gll-info' )
		),
		gll_info_pattern_heading( esc_html__( 'Frequency Response', 'gll-info' ), 3 ),
		'<!-- wp:gll-info/frequency-response /-->',
		gll_info_pattern_heading( esc_html__( 'Polar Coverage', 'gll-info' ), 3 ),
		'<!-- wp:gll-info/polar-plot /-->',
		gll_info_pattern_heading( esc_html__( 'Radiation Balloon', 'gll-info' ), 3 ),
		'<!-- wp:gll-info/balloon-3d /-->',
	);

	return implode( "\n\n", $parts );
}

/**
 * Register the GLL pattern category and the bundled patterns.
 *
 * Runs on `init` at a later priority than block registration so the pattern
 * content refers to block types that already exist.
 */
function gll_info_register_block_patterns() {
	if ( ! function_exists( 'register_block_pattern' ) ) {
		return;
	}

	register_block_pattern_category(
		GLL_INFO_PATTERN_CATEGORY,
		array(
			'label'       => __( 'GLL Loudspeaker Data', 'gll-info' ),
			'description' => __( 'Layouts that combine the GLL Info blocks into complete loudspeaker pages.', 'gll-info' ),
		)
	);

	register_block_pattern(
		'gll-info/full-viewer',
		array(
			'title'       => __( 'Full GLL Viewer', 'gll-info' ),
			'description' => __( 'A complete loudspeaker page: overview, frequency response, polar plot, 3D balloon, cabinet geometry, configuration and embedded documents.', 'gll-info' ),
			'categories'  => array( GLL_INFO_PATTERN_CATEGORY ),
			'keywords'    => array(
				__( 'gll', 'gll-info' ),
				__( 'loudspeaker', 'gll-info' ),
				__( 'data sheet', 'gll-info' ),
				__( 'acoustic', 'gll-info' ),
			),
			'content'     => gll_info_pattern_full_viewer_content(),
		)
	);

	register_block_pattern(
		'gll-info/quick-overview',
		array(
			'title'       => __( 'Quick GLL Overview', 'gll-info' ),
			'description' => __( 'Compact summary of a GLL file plus the documents embedded in it.', 'gll-info' ),
			'categories'  => array( GLL_INFO_PATTERN_CATEGORY ),
			'keywords'    => array(
				__( 'gll', 'gll-info' ),
				__( 'overview', 'gll-info' ),
				__( 'summary', 'gll-info' ),
				__( 'downloads', 'gll-info' ),
			),
			'content'     => gll_info_pattern_quick_overview_content(),
		)
	);

	register_block_pattern(
		'gll-info/acoustic-analysis',
		array(
			'title'       => __( 'GLL Acoustic Analysis', 'gll-info' ),
			'description' => __( 'Frequency response, polar plot and 3D balloon for a single acoustic source.', 'gll-info' ),
			'categories'  => array( GLL_INFO_PATTERN_CATEGORY ),
			'keywords'    => array(
				__( 'gll', 'gll-info' ),
				__( 'frequency response', 'gll-info' ),
				__( 'polar', 'gll-info' ),
				__( 'directivity', 'gll-info' ),
				__( 'balloon', 'gll-info' ),
			),
			'content'     => gll_info_pattern_acoustic_analysis_content(),
		)
	);
}
add_action( 'init', 'gll_info_register_block_patterns', 20 );
