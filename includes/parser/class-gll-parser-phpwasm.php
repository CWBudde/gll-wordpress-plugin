<?php
/**
 * Parse GLL files in-process through a PHP WebAssembly runtime.
 *
 * THIS BACKEND IS INERT ON EVERY KNOWN HOST TODAY, and the reason is worth
 * writing down rather than discovering again later.
 *
 * `assets/wasm/gll.wasm` is built with `GOOS=js GOARCH=wasm`. A Go binary for
 * that target does not import WASI; it imports a `go` namespace of host
 * functions — `syscall/js.valueGet`, `valueCall`, `scheduleTimeoutEvent` and
 * some forty more — whose whole purpose is to reach a JavaScript engine.
 * `wasm_exec.js` is the implementation of those imports. A PHP runtime such as
 * Wasmer or Extism can instantiate a WASI module, but it has no JavaScript
 * engine to bridge to, so it cannot satisfy those imports and the module cannot
 * be instantiated at all. This is a property of the binary, not a missing
 * feature of the runtime, and no amount of glue on this side changes it.
 *
 * What would change it is a second build of the parser targeting `wasip1` in
 * gll-tools. That is upstream work, listed in `PLAN.md`, and it is the only
 * thing this class is waiting for. It is shipped now, reporting itself
 * unavailable, so that the settings screen can explain why in-process parsing is
 * not on offer instead of silently omitting it, and so that the day a WASI build
 * exists this becomes a small change in one file rather than a new backend.
 *
 * The path is deliberately real rather than a stub: point `GLL_INFO_WASI_PARSER`
 * at a `wasip1` build and, with a runtime installed, it will be used.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * In-process WebAssembly parser backend.
 */
class GLL_Parser_PHP_Wasm extends GLL_Parser_Backend {

	/**
	 * {@inheritDoc}
	 *
	 * @return string Backend ID.
	 */
	public function id() {
		return 'phpwasm';
	}

	/**
	 * {@inheritDoc}
	 *
	 * @return string Translated label.
	 */
	public function label() {
		return __( 'In-process WebAssembly runtime', 'gll-info' );
	}

	/**
	 * Whether a runtime and a WASI-compatible parser are both present.
	 *
	 * Both halves are required, and on a stock host neither is: see the class
	 * docblock for why the bundled `gll.wasm` is not one of them.
	 *
	 * @return bool True when in-process parsing is possible.
	 */
	public function is_available() {
		return '' !== self::runtime() && '' !== self::module_path();
	}

	/**
	 * Why this backend is unavailable, for the settings screen.
	 *
	 * @return string Translated explanation, or an empty string when available.
	 */
	public function unavailable_reason() {
		if ( $this->is_available() ) {
			return '';
		}

		if ( '' === self::runtime() ) {
			return __(
				'No PHP WebAssembly runtime (Wasmer or Extism) is installed.',
				'gll-info'
			);
		}

		return __(
			'The bundled parser is a JavaScript-target WebAssembly build and cannot run outside a JavaScript engine. A WASI build would be required.',
			'gll-info'
		);
	}

	/**
	 * Parse a file.
	 *
	 * @param string $path Absolute path to a `.gll` file.
	 * @return array|WP_Error Raw parser output, or an error.
	 */
	public function parse( $path ) {
		if ( ! $this->is_available() ) {
			return new WP_Error( 'gll_info_no_wasm_runtime', $this->unavailable_reason() );
		}

		$module = self::module_path();

		/**
		 * Filter the raw parser output of an in-process WebAssembly parse.
		 *
		 * The hook a runtime integration attaches to. Returning anything other
		 * than null short-circuits this backend, which has no runtime-specific
		 * code of its own precisely because Wasmer and Extism expose entirely
		 * different APIs.
		 *
		 * @param array|null $raw    Raw parser output, or null to decline.
		 * @param string     $path   Absolute path to the GLL file.
		 * @param string     $module Absolute path to the WASI parser module.
		 */
		$raw = apply_filters( 'gll_info_phpwasm_parse', null, $path, $module );

		if ( is_array( $raw ) ) {
			return $raw;
		}

		return new WP_Error(
			'gll_info_phpwasm_unimplemented',
			__( 'No in-process WebAssembly parser handled the file.', 'gll-info' )
		);
	}

	/**
	 * Which PHP WebAssembly runtime is installed, if any.
	 *
	 * @return string 'wasmer', 'extism', or an empty string.
	 */
	public static function runtime() {
		if ( extension_loaded( 'wasm' ) || class_exists( '\Wasm\Module' ) ) {
			return 'wasmer';
		}

		if ( class_exists( '\Extism\Plugin' ) ) {
			return 'extism';
		}

		return '';
	}

	/**
	 * Absolute path of a WASI-compatible parser module, if one is configured.
	 *
	 * The bundled `gll.wasm` is deliberately NOT a candidate — it is a
	 * `js/wasm` build and cannot be instantiated without a JavaScript engine.
	 *
	 * @return string Absolute path, or an empty string.
	 */
	public static function module_path() {
		$module = '';

		if ( defined( 'GLL_INFO_WASI_PARSER' ) && GLL_INFO_WASI_PARSER ) {
			$module = (string) GLL_INFO_WASI_PARSER;
		}

		/**
		 * Filter the path to a WASI build of the GLL parser.
		 *
		 * @param string $module Absolute path to a `.wasm` module.
		 */
		$module = (string) apply_filters( 'gll_info_wasi_parser', $module );

		if ( '' === $module || ! is_file( $module ) || ! is_readable( $module ) ) {
			return '';
		}

		return $module;
	}
}
