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
		add_action( 'admin_post_gll_info_clear_url_cache', array( __CLASS__, 'handle_clear_url_cache' ) );
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

		// The external-file settings share the option group, so `settings_fields()`
		// and the one submit button keep working unchanged.
		register_setting(
			'gll_info_settings',
			GLL_Remote::ENABLED_OPTION,
			array(
				'type'              => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_enabled' ),
				// OFF by default. This is the one switch in the plugin that lets a
				// logged-in user make the web server issue outbound requests, and
				// the residual DNS-rebinding exposure cannot be closed in userland.
				'default'           => '0',
			)
		);

		register_setting(
			'gll_info_settings',
			GLL_Remote::HOSTS_OPTION,
			array(
				'type'              => 'string',
				'sanitize_callback' => array( __CLASS__, 'sanitize_hosts' ),
				'default'           => '',
			)
		);

		register_setting(
			'gll_info_settings',
			GLL_Remote::MAX_MB_OPTION,
			array(
				'type'              => 'integer',
				'sanitize_callback' => array( __CLASS__, 'sanitize_max_mb' ),
				'default'           => (int) ( GLL_Remote::MAX_BYTES / MB_IN_BYTES ),
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
	 * Clean a submitted host allowlist.
	 *
	 * Tolerates a pasted URL, because that is what an administrator will have in
	 * the clipboard, and drops anything that is not a plausible hostname rather
	 * than storing it to fail silently later.
	 *
	 * @param mixed $value Submitted value.
	 * @return string Newline-separated hosts.
	 */
	public static function sanitize_hosts( $value ) {
		$hosts = array();

		foreach ( preg_split( '/[\r\n,]+/', (string) $value ) as $line ) {
			$host = strtolower( trim( $line ) );

			if ( '' === $host ) {
				continue;
			}

			if ( false !== strpos( $host, '//' ) ) {
				$host = (string) wp_parse_url( $host, PHP_URL_HOST );
			}

			// A bare address is not a host name, and an allowlist entry of
			// `127.0.0.1` would read as permission for something the address
			// checks refuse anyway. Drop it rather than store a contradiction.
			if ( filter_var( $host, FILTER_VALIDATE_IP ) ) {
				continue;
			}

			if ( preg_match( '/^(\*\.)?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/', $host ) ) {
				$hosts[] = $host;
			}
		}

		return implode( "\n", array_slice( array_unique( $hosts ), 0, 50 ) );
	}

	/**
	 * Clamp the submitted download ceiling.
	 *
	 * @param mixed $value Submitted value in megabytes.
	 * @return int Megabytes, between 1 and 512.
	 */
	public static function sanitize_max_mb( $value ) {
		$mb = (int) $value;

		if ( $mb < 1 ) {
			return (int) ( GLL_Remote::MAX_BYTES / MB_IN_BYTES );
		}

		return min( $mb, 512 );
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
	 * Discard every cached external-file summary.
	 */
	public static function handle_clear_url_cache() {
		if ( ! current_user_can( 'manage_options' ) ) {
			wp_die( esc_html__( 'You are not allowed to do that.', 'gll-info' ) );
		}

		check_admin_referer( 'gll_info_clear_url_cache' );

		GLL_URL_Cache::purge_all();

		wp_safe_redirect(
			add_query_arg(
				array(
					'page'    => self::SLUG,
					'cleared' => '1',
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

			<?php if ( isset( $_GET['cleared'] ) ) : // phpcs:ignore WordPress.Security.NonceVerification.Recommended ?>
				<div class="notice notice-success is-dismissible">
					<p><?php esc_html_e( 'Stored summaries of external files have been cleared.', 'gll-info' ); ?></p>
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

				<h2><?php esc_html_e( 'Files on other websites', 'gll-info' ); ?></h2>

				<p>
					<?php
					esc_html_e(
						'A block can point at a GLL file hosted somewhere else instead of one in your media library. Visitors’ browsers download such a file directly, which only works if the website hosting it allows other sites to read it. When it does not, this site can fetch the file for you while you are editing, so that you still get a preview and a stored summary.',
						'gll-info'
					);
					?>
				</p>

				<table class="form-table" role="presentation">
					<tr>
						<th scope="row"><?php esc_html_e( 'Fetch external files', 'gll-info' ); ?></th>
						<td>
							<label>
								<input
									type="checkbox"
									name="<?php echo esc_attr( GLL_Remote::ENABLED_OPTION ); ?>"
									value="1"
									<?php checked( GLL_Remote::is_enabled() ); ?>
								/>
								<?php esc_html_e( 'Let authors have this site download GLL files from other websites', 'gll-info' ); ?>
							</label>
							<p class="description">
								<?php
								esc_html_e(
									'Off by default. When it is on, anyone who can upload files can make this server request an address of their choosing. Private and internal addresses are refused, but a hostile address that changes what it points at between the check and the request cannot be caught. Leave this off unless authors need files from sites that block direct downloads.',
									'gll-info'
								);
								?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="gll-info-remote-hosts"><?php esc_html_e( 'Allowed websites', 'gll-info' ); ?></label>
						</th>
						<td>
							<textarea
								id="gll-info-remote-hosts"
								name="<?php echo esc_attr( GLL_Remote::HOSTS_OPTION ); ?>"
								rows="4"
								cols="50"
								class="large-text code"
							><?php echo esc_textarea( get_option( GLL_Remote::HOSTS_OPTION, '' ) ); ?></textarea>
							<p class="description">
								<?php
								esc_html_e(
									'One hostname per line, for example files.example.com or *.example.com. Leave empty to allow any public website. Filling this in is the only complete answer to the risk described above.',
									'gll-info'
								);
								?>
							</p>
						</td>
					</tr>
					<tr>
						<th scope="row">
							<label for="gll-info-remote-max"><?php esc_html_e( 'Largest file to fetch', 'gll-info' ); ?></label>
						</th>
						<td>
							<input
								type="number"
								id="gll-info-remote-max"
								name="<?php echo esc_attr( GLL_Remote::MAX_MB_OPTION ); ?>"
								value="<?php echo esc_attr( (string) (int) ( GLL_Remote::max_bytes() / MB_IN_BYTES ) ); ?>"
								min="1"
								max="512"
								class="small-text"
							/>
							<?php esc_html_e( 'MB', 'gll-info' ); ?>
						</td>
					</tr>
					<tr>
						<th scope="row"><?php esc_html_e( 'Stored summaries', 'gll-info' ); ?></th>
						<td><?php self::render_url_cache_status(); ?></td>
					</tr>
				</table>
				<?php submit_button(); ?>
			</form>

			<form method="post" action="<?php echo esc_url( admin_url( 'admin-post.php' ) ); ?>">
				<input type="hidden" name="action" value="gll_info_clear_url_cache" />
				<?php wp_nonce_field( 'gll_info_clear_url_cache' ); ?>
				<?php
				submit_button(
					__( 'Clear stored summaries of external files', 'gll-info' ),
					'secondary',
					'submit',
					true
				);
				?>
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
	 * Say how much is cached for external files.
	 *
	 * The count is worth showing because this tier, unlike the attachment one,
	 * cannot notice when a file changes at its source: an administrator who has
	 * just been told a vendor re-published a file needs somewhere to act on that.
	 */
	private static function render_url_cache_status() {
		$index = GLL_URL_Cache::index();
		$bytes = 0;

		foreach ( $index as $entry ) {
			$bytes += isset( $entry['bytes'] ) ? (int) $entry['bytes'] : 0;
		}

		if ( empty( $index ) ) {
			echo '<p>' . esc_html__( 'No external files are cached.', 'gll-info' ) . '</p>';
		} else {
			printf(
				'<p>%s</p>',
				esc_html(
					sprintf(
						/* translators: 1: number of cached files. 2: total size, already formatted. */
						_n(
							'%1$d external file cached, %2$s in total.',
							'%1$d external files cached, %2$s in total.',
							count( $index ),
							'gll-info'
						),
						count( $index ),
						size_format( $bytes )
					)
				)
			);
		}

		printf(
			'<p class="description">%s</p>',
			esc_html(
				sprintf(
					/* translators: %s: a duration such as "12 hours". */
					__( 'A summary of a file on another website is kept for %s. Nothing here can tell when such a file changes at its source, so that time limit is the only thing that refreshes it.', 'gll-info' ),
					human_time_diff( 0, GLL_URL_Cache::ttl() )
				)
			)
		);
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
