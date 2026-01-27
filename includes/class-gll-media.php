<?php
/**
 * GLL Media Library Integration
 *
 * Handles GLL file upload support in WordPress media library.
 *
 * @package GllInfo
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Class GLL_Media
 *
 * Adds support for .gll files in the WordPress media library.
 */
class GLL_Media {

	/**
	 * Initialize the media hooks.
	 */
	public static function init() {
		add_filter( 'upload_mimes', array( __CLASS__, 'add_gll_mime_type' ) );
		add_filter( 'wp_check_filetype_and_ext', array( __CLASS__, 'check_filetype' ), 10, 5 );
		add_filter( 'post_mime_types', array( __CLASS__, 'add_gll_post_mime_type' ) );
		add_filter( 'wp_get_attachment_image_src', array( __CLASS__, 'gll_attachment_image' ), 10, 4 );
		add_action( 'admin_enqueue_scripts', array( __CLASS__, 'enqueue_admin_styles' ) );
	}

	/**
	 * Add GLL MIME type to allowed upload types.
	 *
	 * @param array $mimes Existing MIME types.
	 * @return array Modified MIME types.
	 */
	public static function add_gll_mime_type( $mimes ) {
		$mimes['gll'] = 'application/x-gll';
		return $mimes;
	}

	/**
	 * Verify GLL file type on upload.
	 *
	 * WordPress may not recognize the GLL file extension, so we need to
	 * explicitly tell it that .gll files are allowed.
	 *
	 * @param array  $data     File data array.
	 * @param string $file     Full path to the file.
	 * @param string $filename The name of the file.
	 * @param array  $mimes    Array of allowed MIME types.
	 * @param string $real_mime The real MIME type of the file.
	 * @return array Modified file data.
	 */
	public static function check_filetype( $data, $file, $filename, $mimes, $real_mime = null ) {
		$ext = pathinfo( $filename, PATHINFO_EXTENSION );

		if ( 'gll' === strtolower( $ext ) ) {
			$data['ext']  = 'gll';
			$data['type'] = 'application/x-gll';
		}

		return $data;
	}

	/**
	 * Add GLL to the media library filter dropdown.
	 *
	 * @param array $post_mime_types Existing MIME types.
	 * @return array Modified MIME types.
	 */
	public static function add_gll_post_mime_type( $post_mime_types ) {
		$post_mime_types['application/x-gll'] = array(
			__( 'GLL Files', 'gll-info' ),
			__( 'Manage GLL Files', 'gll-info' ),
			/* translators: %s: number of GLL files */
			_n_noop( 'GLL File <span class="count">(%s)</span>', 'GLL Files <span class="count">(%s)</span>', 'gll-info' ),
		);
		return $post_mime_types;
	}

	/**
	 * Provide a placeholder image for GLL attachments in admin.
	 *
	 * @param array|false  $image         Image data or false.
	 * @param int          $attachment_id Attachment ID.
	 * @param string|int[] $size          Image size.
	 * @param bool         $icon          Whether to use an icon.
	 * @return array|false Image data.
	 */
	public static function gll_attachment_image( $image, $attachment_id, $size, $icon ) {
		if ( ! $image ) {
			$mime_type = get_post_mime_type( $attachment_id );
			if ( 'application/x-gll' === $mime_type ) {
				// Return a placeholder for GLL files.
				$image = array(
					GLL_INFO_PLUGIN_URL . 'assets/images/gll-icon.svg',
					128,
					128,
					false,
				);
			}
		}
		return $image;
	}

	/**
	 * Enqueue admin styles for GLL file display.
	 *
	 * @param string $hook Current admin page hook.
	 */
	public static function enqueue_admin_styles( $hook ) {
		if ( 'upload.php' === $hook || 'post.php' === $hook || 'post-new.php' === $hook ) {
			wp_add_inline_style(
				'media-views',
				'.attachment[data-type="application/x-gll"] .thumbnail {
					background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
					display: flex;
					align-items: center;
					justify-content: center;
				}
				.attachment[data-type="application/x-gll"] .thumbnail::after {
					content: "GLL";
					color: white;
					font-weight: bold;
					font-size: 14px;
				}'
			);
		}
	}

	/**
	 * Get GLL file metadata from attachment.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return array|false GLL metadata or false if not a GLL file.
	 */
	public static function get_gll_metadata( $attachment_id ) {
		$mime_type = get_post_mime_type( $attachment_id );
		if ( 'application/x-gll' !== $mime_type ) {
			return false;
		}

		// Check for cached metadata.
		$metadata = get_post_meta( $attachment_id, '_gll_metadata', true );
		if ( $metadata ) {
			return $metadata;
		}

		return false;
	}

	/**
	 * Save parsed GLL metadata to attachment.
	 *
	 * @param int   $attachment_id Attachment ID.
	 * @param array $metadata      Parsed GLL metadata.
	 * @return bool Success status.
	 */
	public static function save_gll_metadata( $attachment_id, $metadata ) {
		return update_post_meta( $attachment_id, '_gll_metadata', $metadata );
	}
}

// Initialize the media class.
GLL_Media::init();
