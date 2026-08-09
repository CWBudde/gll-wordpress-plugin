<?php
/**
 * Parse GLL files by running the bundled WebAssembly parser under Node.
 *
 * The preferred backend, and the one that keeps the project's original promise:
 * server-side parsing with no Go toolchain on the server. It runs exactly the
 * `assets/wasm/gll.wasm` the browser runs, through `assets/parser/gll-parse.mjs`,
 * so the server and the browser cannot disagree about a file.
 *
 * It also prunes its own output before returning it, which is why its ceiling is
 * high where the other backends' is low — see `max_bytes()`.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Node-plus-WASM parser backend.
 */
class GLL_Parser_Node extends GLL_Parser_Backend {

	/**
	 * Oldest Node that can run the runner script.
	 *
	 * The script is ESM with top-level `await`, which needs 14.8. Every
	 * supported Node line is far past that; the check exists to fail detection
	 * cleanly on an ancient system binary rather than at parse time.
	 *
	 * @var int
	 */
	const MIN_MAJOR = 16;

	/**
	 * {@inheritDoc}
	 *
	 * @return string Backend ID.
	 */
	public function id() {
		return 'node';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return string Translated label.
	 */
	public function label() {
		return __( 'Node.js with the bundled WebAssembly parser', 'gll-info' );
	}

	/**
	 * Ceiling for this backend.
	 *
	 * `gll-parse.mjs` replaces every response spectrum with an empty object
	 * before printing, which is where essentially all of the parser's output
	 * volume lives — the 15.4 MB corpus file goes from 228.7 MB of JSON to a few
	 * hundred kilobytes. PHP therefore decodes something small no matter how big
	 * the input was, and the ceiling only has to keep a pathological upload from
	 * occupying a worker.
	 *
	 * @return int Ceiling in bytes.
	 */
	public function max_bytes() {
		return 64 * MB_IN_BYTES;
	}

	/**
	 * Whether a usable `node` is on this host.
	 *
	 * @return bool True when the runner can be executed.
	 */
	public function is_available() {
		if ( ! $this->can_spawn() || ! is_readable( self::runner_path() ) ) {
			return false;
		}

		$result = $this->run( array( self::binary(), '--version' ), 10 );

		if ( is_wp_error( $result ) || 0 !== $result['status'] ) {
			return false;
		}

		if ( ! preg_match( '/^v(\d+)\./', trim( $result['stdout'] ), $matches ) ) {
			return false;
		}

		return (int) $matches[1] >= self::MIN_MAJOR;
	}

	/**
	 * Parse a file.
	 *
	 * @param string $path Absolute path to a `.gll` file.
	 * @return array|WP_Error Raw parser output, or an error.
	 */
	public function parse( $path ) {
		$result = $this->run( array( self::binary(), self::runner_path(), $path ) );

		if ( is_wp_error( $result ) ) {
			return $result;
		}

		if ( 0 !== $result['status'] ) {
			return new WP_Error(
				'gll_info_node_failed',
				'' !== trim( $result['stderr'] )
					? trim( $result['stderr'] )
					: __( 'The parser exited with an error.', 'gll-info' )
			);
		}

		return $this->decode( $result['stdout'] );
	}

	/**
	 * The `node` binary to invoke.
	 *
	 * Filterable because a host may keep Node somewhere `PATH` does not reach —
	 * PHP-FPM often runs with a minimal environment — and because a site may want
	 * to pin a specific version.
	 *
	 * @return string Binary name or absolute path.
	 */
	public static function binary() {
		if ( defined( 'GLL_INFO_NODE_BIN' ) && GLL_INFO_NODE_BIN ) {
			return (string) GLL_INFO_NODE_BIN;
		}

		/**
		 * Filter the Node binary used for server-side parsing.
		 *
		 * @param string $binary Binary name or absolute path.
		 */
		return (string) apply_filters( 'gll_info_node_bin', 'node' );
	}

	/**
	 * Absolute path of the runner script.
	 *
	 * @return string Path to `assets/parser/gll-parse.mjs`.
	 */
	public static function runner_path() {
		return GLL_INFO_PLUGIN_DIR . 'assets/parser/gll-parse.mjs';
	}
}
