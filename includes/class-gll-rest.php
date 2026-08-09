<?php
/**
 * REST routes for the cached display subset.
 *
 * The `gll-info/v1` namespace has been advertised to the editor since Phase 1 —
 * `gll_info_enqueue_editor_assets()` localizes `restUrl` and a nonce — and until
 * now no route has ever served it. These are the first.
 *
 *   GET    /gll-info/v1/cache/<id>   public;  the subset, or 404 when cold
 *   POST   /gll-info/v1/cache/<id>   author;  store a subset parsed in a browser
 *   DELETE /gll-info/v1/cache/<id>   author;  discard it, to force a rebuild
 *
 * The GET is deliberately public and unauthenticated. It exposes strictly less
 * than the `.gll` file it describes, and that file is already served straight off
 * `wp-content/uploads` to anyone with the URL — every block puts that URL in its
 * saved markup. Requiring auth here would break the only case that matters, an
 * anonymous visitor loading a published page.
 *
 * A cold cache is signalled as 404 rather than as an empty 200, because the
 * frontend's fallback is keyed on it: 404 means "parse it yourself", and it is
 * also what a version bump and a replaced file produce, so all three stale
 * states take one code path.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and serves the cache routes.
 */
class GLL_REST {

	/**
	 * Route namespace.
	 *
	 * Must match the `restUrl` built in `gll_info_enqueue_editor_assets()`.
	 *
	 * @var string
	 */
	const NAMESPACE = 'gll-info/v1';

	/**
	 * Hook the route registration.
	 */
	public static function init() {
		add_action( 'rest_api_init', array( __CLASS__, 'register_routes' ) );
	}

	/**
	 * Register the cache routes.
	 */
	public static function register_routes() {
		register_rest_route(
			self::NAMESPACE,
			'/cache/(?P<id>\d+)',
			array(
				array(
					'methods'             => WP_REST_Server::READABLE,
					'callback'            => array( __CLASS__, 'get_cache' ),
					'permission_callback' => '__return_true',
					'args'                => self::id_arg(),
				),
				array(
					'methods'             => WP_REST_Server::CREATABLE,
					'callback'            => array( __CLASS__, 'set_cache' ),
					'permission_callback' => array( __CLASS__, 'can_edit' ),
					'args'                => self::id_arg(),
				),
				array(
					'methods'             => WP_REST_Server::DELETABLE,
					'callback'            => array( __CLASS__, 'delete_cache' ),
					'permission_callback' => array( __CLASS__, 'can_edit' ),
					'args'                => self::id_arg(),
				),
			)
		);
	}

	/**
	 * Shared declaration of the attachment ID path argument.
	 *
	 * @return array Argument schema.
	 */
	private static function id_arg() {
		return array(
			'id' => array(
				'description'       => __( 'Attachment ID of the GLL file.', 'gll-info' ),
				'type'              => 'integer',
				'required'          => true,
				'sanitize_callback' => 'absint',
			),
		);
	}

	/**
	 * Whether the current user may write the cache of an attachment.
	 *
	 * `edit_post` on the attachment rather than a bare `upload_files`: the
	 * payload is stored as that attachment's meta, so the right question is
	 * whether this user may edit that attachment. Cookie-authenticated callers
	 * additionally need the `wp_rest` nonce, which core enforces before this runs.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return true|WP_Error True when allowed.
	 */
	public static function can_edit( $request ) {
		$attachment_id = absint( $request['id'] );

		if ( ! current_user_can( 'edit_post', $attachment_id ) ) {
			return new WP_Error(
				'gll_info_cannot_edit',
				__( 'You are not allowed to edit this file.', 'gll-info' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}

		return true;
	}

	/**
	 * Serve the cached subset.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error The subset, or a 404.
	 */
	public static function get_cache( $request ) {
		$attachment_id = absint( $request['id'] );
		$subset        = GLL_Cache::get( $attachment_id );

		if ( false === $subset ) {
			return self::cold( $attachment_id );
		}

		return rest_ensure_response( $subset );
	}

	/**
	 * Store a subset parsed in the browser.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error Result, or an error.
	 */
	public static function set_cache( $request ) {
		$attachment_id = absint( $request['id'] );

		if ( ! GLL_Cache::is_gll( $attachment_id ) ) {
			return self::not_gll();
		}

		$body   = $request->get_json_params();
		$subset = ( is_array( $body ) && isset( $body['data'] ) ) ? $body['data'] : null;

		if ( ! GLL_Cache::validate( $subset ) ) {
			return new WP_Error(
				'gll_info_invalid_subset',
				__( 'The submitted GLL data could not be stored.', 'gll-info' ),
				array( 'status' => 400 )
			);
		}

		// The digest the caller says it parsed against, when it could compute one.
		// Verified against the file as it is now, so a payload describing bytes
		// that have since been replaced is refused rather than stored under the
		// new file's fingerprint. See `GLL_Cache::set()` for why it is optional.
		$expected = null;
		if ( isset( $body['hash'] ) && is_string( $body['hash'] ) && preg_match( '/^[a-f0-9]{64}$/', $body['hash'] ) ) {
			$expected = $body['hash'];
		}

		if ( ! GLL_Cache::set( $attachment_id, $subset, 'browser', $expected ) ) {
			if ( null !== $expected ) {
				return new WP_Error(
					'gll_info_file_changed',
					__( 'The file changed while it was being read. Nothing was stored.', 'gll-info' ),
					array( 'status' => 409 )
				);
			}

			return new WP_Error(
				'gll_info_store_failed',
				__( 'The GLL data could not be saved.', 'gll-info' ),
				array( 'status' => 500 )
			);
		}

		return rest_ensure_response(
			array(
				'stored'  => true,
				'version' => GLL_Subset::VERSION,
			)
		);
	}

	/**
	 * Discard the cached subset, so the next parse rebuilds it.
	 *
	 * @param WP_REST_Request $request Request.
	 * @return WP_REST_Response|WP_Error Result, or an error.
	 */
	public static function delete_cache( $request ) {
		$attachment_id = absint( $request['id'] );

		if ( ! GLL_Cache::is_gll( $attachment_id ) ) {
			return self::not_gll();
		}

		GLL_Cache::delete( $attachment_id );

		return rest_ensure_response( array( 'deleted' => true ) );
	}

	/**
	 * The 404 a cold, stale or version-mismatched cache produces.
	 *
	 * @param int $attachment_id Attachment ID.
	 * @return WP_Error Not-found error.
	 */
	private static function cold( $attachment_id ) {
		unset( $attachment_id );

		return new WP_Error(
			'gll_info_cache_cold',
			__( 'No cached data is available for this file.', 'gll-info' ),
			array( 'status' => 404 )
		);
	}

	/**
	 * The error for an attachment that is not a GLL file.
	 *
	 * @return WP_Error Bad-request error.
	 */
	private static function not_gll() {
		return new WP_Error(
			'gll_info_not_gll',
			__( 'That attachment is not a GLL file.', 'gll-info' ),
			array( 'status' => 400 )
		);
	}
}

GLL_REST::init();
