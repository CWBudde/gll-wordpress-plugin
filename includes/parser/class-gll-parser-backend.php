<?php
/**
 * Base class for server-side GLL parser backends.
 *
 * A backend answers three questions: can it run here, what should the settings
 * screen call it, and what does this file parse to. Everything else — deciding
 * which one to use, reducing the result to the display subset, storing it — is
 * somebody else's job.
 *
 * Backends return RAW parser output, in the parser's own snake_case shape.
 * `GLL_Subset::from_raw()` reduces it. That split is why the CLI and PHP-WASM
 * backends need no JavaScript, and why the Node backend can prune its output
 * without any other component knowing that it did.
 *
 * @package
 */

// Exit if accessed directly.
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * One way of parsing a GLL file on the server.
 */
abstract class GLL_Parser_Backend {

	/**
	 * How long a parse may run before it is killed, in seconds.
	 *
	 * The largest file in the reference corpus takes about 11 seconds in a
	 * browser. This is generous next to that and still short of anything that
	 * would hold a request open long enough to matter.
	 *
	 * @var int
	 */
	const TIMEOUT = 60;

	/**
	 * Stable identifier, stored in the cache envelope and in the option.
	 *
	 * @return string One of 'node', 'cli', 'phpwasm'.
	 */
	abstract public function id();

	/**
	 * Human-readable name for the settings screen.
	 *
	 * @return string Translated label.
	 */
	abstract public function label();

	/**
	 * Whether this backend can run on this host.
	 *
	 * Must never fatal, never warn and never take long: it runs during
	 * detection, on a host that may be missing everything it looks for.
	 *
	 * @return bool True when usable.
	 */
	abstract public function is_available();

	/**
	 * Parse a file.
	 *
	 * @param string $path Absolute path to a `.gll` file.
	 * @return array|WP_Error Raw parser output, or an error.
	 */
	abstract public function parse( $path );

	/**
	 * Largest file this backend will attempt, in bytes.
	 *
	 * Backends that hand PHP the parser's full output need a low ceiling: a
	 * 15.4 MB GLL expands to 228.7 MB of JSON, and `json_decode()` on that needs
	 * more memory than a normal PHP process is given. A backend that prunes
	 * before returning can afford a much higher one.
	 *
	 * Above the ceiling nothing is cached and the frontend parses in the browser,
	 * which is what it does today for every file.
	 *
	 * @return int Ceiling in bytes.
	 */
	public function max_bytes() {
		return 2 * MB_IN_BYTES;
	}

	/**
	 * Whether PHP is allowed to start a subprocess at all.
	 *
	 * Shared hosts routinely put `proc_open` on `disable_functions`, and
	 * `function_exists()` alone does not notice — the function is declared,
	 * calling it raises a fatal. The `disable_functions` list has to be read.
	 *
	 * @return bool True when `proc_open` is usable.
	 */
	protected function can_spawn() {
		if ( ! function_exists( 'proc_open' ) ) {
			return false;
		}

		$disabled = (string) ini_get( 'disable_functions' );
		$disabled = array_map( 'trim', explode( ',', $disabled ) );

		return ! in_array( 'proc_open', $disabled, true );
	}

	/**
	 * Run a command and capture its output.
	 *
	 * Arguments are passed as a list and escaped individually; nothing here ever
	 * interpolates a caller's string into a shell command. The only argument any
	 * backend passes is a path resolved from an attachment ID, never a value
	 * taken from a request.
	 *
	 * Reads both pipes through `stream_select()` rather than draining one and
	 * then the other: a child that fills the pipe it is not being read from
	 * blocks forever, and stderr is exactly the pipe a failing parse writes to.
	 *
	 * @param string[] $command Command and arguments, unescaped.
	 * @param int      $timeout Seconds before the child is killed.
	 * @return array|WP_Error `array( 'stdout' => string, 'stderr' => string, 'status' => int )`.
	 */
	protected function run( $command, $timeout = self::TIMEOUT ) {
		if ( ! $this->can_spawn() ) {
			return new WP_Error(
				'gll_info_no_proc_open',
				__( 'This site is not allowed to run external commands.', 'gll-info' )
			);
		}

		$escaped = implode( ' ', array_map( 'escapeshellarg', $command ) );

		$descriptors = array(
			0 => array( 'pipe', 'r' ),
			1 => array( 'pipe', 'w' ),
			2 => array( 'pipe', 'w' ),
		);

		$pipes   = array();
		$process = @proc_open( $escaped, $descriptors, $pipes );

		if ( ! is_resource( $process ) ) {
			return new WP_Error(
				'gll_info_spawn_failed',
				__( 'The parser could not be started.', 'gll-info' )
			);
		}

		fclose( $pipes[0] );
		stream_set_blocking( $pipes[1], false );
		stream_set_blocking( $pipes[2], false );

		$output   = array( 1 => '', 2 => '' );
		$deadline = time() + $timeout;
		$open     = array( 1 => $pipes[1], 2 => $pipes[2] );

		while ( $open ) {
			if ( time() > $deadline ) {
				proc_terminate( $process, 9 );
				foreach ( $open as $pipe ) {
					fclose( $pipe );
				}
				proc_close( $process );

				return new WP_Error(
					'gll_info_parse_timeout',
					__( 'The parser took too long and was stopped.', 'gll-info' )
				);
			}

			$read   = array_values( $open );
			$write  = null;
			$except = null;

			// One second, so the deadline above is checked regularly even while
			// the child is silent.
			if ( false === @stream_select( $read, $write, $except, 1 ) ) {
				break;
			}

			foreach ( $read as $stream ) {
				$key = array_search( $stream, $open, true );
				if ( false === $key ) {
					continue;
				}

				$chunk = fread( $stream, 65536 );

				if ( '' === $chunk || false === $chunk ) {
					if ( feof( $stream ) ) {
						fclose( $stream );
						unset( $open[ $key ] );
					}
					continue;
				}

				$output[ $key ] .= $chunk;
			}
		}

		foreach ( $open as $pipe ) {
			fclose( $pipe );
		}

		$status = proc_close( $process );

		return array(
			'stdout' => $output[1],
			'stderr' => $output[2],
			'status' => $status,
		);
	}

	/**
	 * Decode a parser's JSON output.
	 *
	 * Accepts both shapes a backend can produce: the bare `data` object, and the
	 * full `{success, data, error}` envelope the WASM entry point returns.
	 *
	 * @param string $json Raw JSON.
	 * @return array|WP_Error Decoded raw parser output, or an error.
	 */
	protected function decode( $json ) {
		if ( ! is_string( $json ) || '' === trim( $json ) ) {
			return new WP_Error(
				'gll_info_empty_output',
				__( 'The parser produced no output.', 'gll-info' )
			);
		}

		$decoded = json_decode( $json, true );

		if ( ! is_array( $decoded ) ) {
			return new WP_Error(
				'gll_info_bad_output',
				__( 'The parser produced output that could not be read.', 'gll-info' )
			);
		}

		if ( array_key_exists( 'success', $decoded ) ) {
			if ( empty( $decoded['success'] ) ) {
				return new WP_Error(
					'gll_info_parse_failed',
					isset( $decoded['error'] ) && is_string( $decoded['error'] )
						? $decoded['error']
						: __( 'The GLL file could not be parsed.', 'gll-info' )
				);
			}

			$decoded = isset( $decoded['data'] ) && is_array( $decoded['data'] )
				? $decoded['data']
				: array();
		}

		return $decoded;
	}
}
