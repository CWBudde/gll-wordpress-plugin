<?php
/**
 * Parse GLL files with the `gllinfo` command-line tool from gll-tools.
 *
 * The fastest and leanest backend at runtime, and the only one that needs
 * something installed: a Go binary the host administrator provides and keeps in
 * step with the plugin. It is therefore NEVER auto-detected from `PATH` — an
 * administrator opts in by naming the path, through the `GLL_INFO_PARSER_BIN`
 * constant or the `gll_info_parser_bin` filter. Picking up whatever `gllinfo`
 * happens to be on `PATH` would be a surprising thing for a plugin to do with a
 * subprocess.
 *
 * A CAVEAT WORTH KNOWING: the CLI and the WebAssembly build do not agree about
 * every file. `PLAN.md` records that the CLI reports 9 corpus files with filter
 * groups where WASM reports 10, missing groups in `N-APS v1_0.gll` that WASM
 * reads. One of the two is wrong about a real file, and it has not been run down
 * yet. A site using this backend can therefore see a filter-group count that
 * differs from what the same file shows in the block editor, which parses with
 * WASM. That is the trade for not needing Node.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * External `gllinfo` binary backend.
 */
class GLL_Parser_CLI extends GLL_Parser_Backend {

	/**
	 * {@inheritDoc}
	 *
	 * @return string Backend ID.
	 */
	public function id() {
		return 'cli';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return string Translated label.
	 */
	public function label() {
		return __( 'gllinfo command-line tool', 'gll-info' );
	}

	/**
	 * Whether an administrator has pointed this backend at a usable binary.
	 *
	 * @return bool True when the configured binary runs.
	 */
	public function is_available() {
		$binary = self::binary();

		if ( ! $binary || ! $this->can_spawn() ) {
			return false;
		}

		$result = $this->run( array( $binary, '--version' ), 10 );

		return ! is_wp_error( $result ) && 0 === $result['status'];
	}

	/**
	 * Parse a file.
	 *
	 * @param string $path Absolute path to a `.gll` file.
	 * @return array|WP_Error Raw parser output, or an error.
	 */
	public function parse( $path ) {
		$binary = self::binary();

		if ( ! $binary ) {
			return new WP_Error(
				'gll_info_no_cli',
				__( 'No GLL command-line parser is configured.', 'gll-info' )
			);
		}

		$result = $this->run( array( $binary, '--json', $path ) );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( 0 !== $result['status'] ) {
			return new WP_Error(
				'gll_info_cli_failed',
				'' !== trim( $result['stderr'] )
					? trim( $result['stderr'] )
					: __( 'The parser exited with an error.', 'gll-info' )
			);
		}

		return $this->decode( $result['stdout'] );
	}

	/**
	 * The configured binary, if any.
	 *
	 * Returns an empty string when nothing is configured, which is what keeps
	 * this backend out of detection on a host that never asked for it.
	 *
	 * @return string Absolute path, or an empty string.
	 */
	public static function binary() {
		$binary = '';

		if ( defined( 'GLL_INFO_PARSER_BIN' ) && GLL_INFO_PARSER_BIN ) {
			$binary = (string) GLL_INFO_PARSER_BIN;
		}

		/**
		 * Filter the path to the `gllinfo` binary.
		 *
		 * Empty disables this backend, which is the default.
		 *
		 * @param string $binary Absolute path to the binary.
		 */
		$binary = (string) apply_filters( 'gll_info_parser_bin', $binary );

		// An administrator names an absolute path. Anything else would be a
		// PATH lookup, which this backend deliberately does not do.
		if ( '' === $binary || 0 !== strpos( $binary, '/' ) || ! is_file( $binary ) ) {
			return '';
		}

		return $binary;
	}
}
