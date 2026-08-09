<?php
/**
 * Settings screen for server-side parsing.
 *
 * One decision and one diagnostic. The decision is whether the plugin may parse
 * GLL files on the server at all; the diagnostic is which backend it found, and
 * — more useful when something is wrong — why the others were rejected.
 *
 * The *choice* of backend is not recomputed on page load — that is stored, and a
 * button re-probes it — but each backend is asked whether it could run, so the
 * list reflects the host as it is now rather than as it was at detection time.
 * That costs at most one `node --version`: the CLI backend answers without
 * spawning anything unless an administrator has configured a path, and the
 * in-process one never spawns at all. It is also the reason an administrator who
 * has just installed Node sees it appear here before pressing anything.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Renders and saves the plugin settings.
 */
class GLL_Settings {

	/**
	 * Menu and page slug.
	 *
	 * @var string
	 */
	const SLUG = 'gll-info';

	/**
	 * Hook the admin screen.
	 */
	public static function init() {
		add_action( 'admin_menu', array( __CLASS__, 'add_page' ) );
		add_action( 'admin_init', array( __CLASS__, 'register' ) );
		add_action( 'admin_post_gll_info_redetect', array( __CLASS__, 'handle_redetect' ) );
	}

	/**
	 * Add the settings page.
	 */
	public static function add_page() {
		add_options_page(
			__( 'GLL Info', 'gll-info' ),
			__( 'GLL Info', 'gll-info' ),
			'manage_options',
			self::SLUG,
			array( __CLASS__, 'render' )
		);
	}

	/**
	 * Register the one stored setting.
	 */
	public static function register() {
		register_setting(
			'gll_info_settings',
			GLL_Parser::ENABLED_OPTION,
			array(
				'type'              => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_enabled' ),
				'default'           => '1',
			)
		);
	}

	/**
	 * Normalize the on/off switch to '1' or '0'.
	 *
	 * @param mixed $value Submitted value.
	 * @return string Either '1' or '0'.
	 */
	public static function sanitize_enabled( $value ) {
		return $value ? '1' : '0';
	}

	/**
	 * Re-run backend detection.
	 */
	public static function handle_redetect() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'gll-info' ) );
		}

		check_admin_referer( 'gll_info_redetect' );

		GLL_Parser::detect( true );

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'       => self::SLUG,
					'redetected' => '1',
				),
				admin_url( 'options-general.php' )
			)
		);
		exit;
	}

	/**
	 * Render the settings page.
	 */
	public static function render() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$active  = GLL_Parser::backend();
		$enabled = GLL_Parser::is_enabled();
		?>
		<div class="wrap">
			<h1><?php esc_html_e( 'GLL Info', 'gll-info' ); ?></h1>

			<?php if ( isset( $_GET['redetected'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success is-dismissible">
					<p><?php esc_html_e( 'Parser detection has been run again.', 'gll-info' ); ?></p>
				</div>
			<?php endif; ?>

			<h2><?php esc_html_e( 'Server-side parsing', 'gll-info' ); ?></h2>

			<p>
				<?php
				esc_html_e(
					'GLL files are normally parsed in the visitor’s browser, which means downloading a 4 MB parser and doing the work again on every page view. When this site can parse them on the server instead, each file is parsed once at upload time and pages load without the parser at all. Blocks that need the full measurement data — frequency response, polar plot, 3D balloon, geometry and resources — always parse in the browser.',
					'gll-info'
				);
				?>
			</p>

			<form method="post" action="options.php">
				<?php settings_fields( 'gll_info_settings' ); ?>
				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Parse on the server', 'gll-info' ); ?></th>
						<td>
							<label>
								<input
									type="checkbox"
									name="<?php echo esc_attr( GLL_Parser::ENABLED_OPTION ); ?>"
									value="1"
									<?php checked( $enabled ); ?>
								/>
								<?php esc_html_e( 'Parse GLL files on the server when a parser is available', 'gll-info' ); ?>
							</label>
							<p class="description">
								<?php
								esc_html_e(
									'Turning this off does not break anything: files are then parsed in the block editor and in visitors’ browsers, as they were before.',
									'gll-info'
								);
								?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Detected parser', 'gll-info' ); ?></th>
						<td><?php self::render_backends( $active ); ?></td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="gll_info_redetect" />
				<?php wp_nonce_field( 'gll_info_redetect' ); ?>
				<?php
				submit_button(
					__( 'Check again', 'gll-info' ),
					'secondary',
					'submit',
					true
				);
				?>
			</form>
		</div>
		<?php
	}

	/**
	 * List every backend and say what became of it.
	 *
	 * Showing the rejected ones is the point: "no parser found" on its own gives
	 * an administrator nothing to act on, where "Node.js — not found" tells them
	 * exactly what to install.
	 *
	 * @param GLL_Parser_Backend|null $active The backend in use.
	 */
	private static function render_backends( $active ) {
		$active_id = $active ? $active->id() : '';

		echo '<ul style="margin-top:0">';

		foreach ( GLL_Parser::backends() as $backend ) {
			$is_active = $backend->id() === $active_id;

			if ( $is_active ) {
				$state = __( 'in use', 'gll-info' );
			} elseif ( method_exists( $backend, 'unavailable_reason' ) && $backend->unavailable_reason() ) {
				$state = $backend->unavailable_reason();
			} elseif ( $backend->is_available() ) {
				$state = __( 'available', 'gll-info' );
			} else {
				$state = __( 'not available on this host', 'gll-info' );
			}

			printf(
				'<li>%s<strong>%s</strong> — %s</li>',
				$is_active ? '&#10003; ' : '',
				esc_html( $backend->label() ),
				esc_html( $state )
			);
		}

		echo '</ul>';

		if ( '' === $active_id ) {
			echo '<p class="description">';
			esc_html_e(
				'No server-side parser is available, so files are parsed in the browser. This is a supported configuration and nothing is broken.',
				'gll-info'
			);
			echo '</p>';
		}
	}
}

GLL_Settings::init();
