/**
 * GLL Context
 *
 * React context for sharing parsed GLL data between blocks.
 *
 * @package
 */

import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useRef,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import {
	initWasm,
	parseGLL,
	parseGLLFromUrl,
	isWasmReady,
} from './wasm-loader';
import { HttpError, canUseProxy, fetchRemoteFile } from './gll-proxy';

/**
 * GLL Context value shape.
 *
 * @typedef {Object} GLLContextValue
 * @property {Object|null} data        Parsed GLL data.
 * @property {boolean}     isLoading   Whether a file is being loaded/parsed.
 * @property {Error|null}  error       Any error that occurred.
 * @property {boolean}     wasmReady   Whether WASM is initialized.
 * @property {Function}    loadFile    Function to load a GLL file.
 * @property {Function}    loadFromUrl Function to load a GLL file from URL.
 * @property {Function}    clearData   Function to clear loaded data.
 * @property {string|null} fileName    Name of the loaded file.
 * @property {number|null} fileId      WordPress attachment ID if applicable.
 */

/**
 * Default context value.
 */
const defaultContextValue = {
	data: null,
	isLoading: false,
	error: null,
	wasmReady: false,
	loadFile: () => {},
	loadFromUrl: () => {},
	clearData: () => {},
	fileName: null,
	fileId: null,
};

/**
 * GLL Context.
 */
export const GLLContext = createContext( defaultContextValue as any );

/**
 * GLL Context Provider component.
 *
 * @param {Object}      props          Component props.
 * @param {JSX.Element} props.children Child components.
 * @return {JSX.Element} Provider component.
 */
export function GLLProvider( { children } ) {
	const [ data, setData ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );
	const [ wasmReady, setWasmReady ] = useState( isWasmReady() );
	const [ fileName, setFileName ] = useState( null );
	const [ fileId, setFileId ] = useState( null );

	/**
	 * Initialize WASM if not already done.
	 */
	const ensureWasmReady = useCallback( async () => {
		if ( isWasmReady() ) {
			setWasmReady( true );
			return true;
		}

		try {
			await initWasm();
			setWasmReady( true );
			return true;
		} catch ( err ) {
			setError( err );
			return false;
		}
	}, [] );

	/**
	 * Load and parse a GLL file from a File object.
	 *
	 * @param {File}        file         The GLL file.
	 * @param {number|null} attachmentId Optional WordPress attachment ID.
	 * @return {Promise<Object|null>} Parsed data or null on error.
	 */
	const loadFile = useCallback(
		async ( file, attachmentId = null ) => {
			setIsLoading( true );
			setError( null );

			try {
				const ready = await ensureWasmReady();
				if ( ! ready ) {
					throw new Error(
						__( 'WASM failed to initialize', 'gll-info' )
					);
				}

				const arrayBuffer = await file.arrayBuffer();
				const parsedData = await parseGLL( arrayBuffer );

				setData( parsedData );
				setFileName( file.name );
				setFileId( attachmentId );
				setIsLoading( false );

				return parsedData;
			} catch ( err ) {
				setError( err );
				setIsLoading( false );
				return null;
			}
		},
		[ ensureWasmReady ]
	);

	/**
	 * Load and parse a GLL file from a URL.
	 *
	 * @param {string}      url          The URL to the GLL file.
	 * @param {string|null} name         Optional file name.
	 * @param {number|null} attachmentId Optional WordPress attachment ID.
	 * @return {Promise<Object|null>} Parsed data or null on error.
	 */
	const loadFromUrl = useCallback(
		async ( url, name = null, attachmentId = null ) => {
			setIsLoading( true );
			setError( null );

			try {
				const ready = await ensureWasmReady();
				if ( ! ready ) {
					throw new Error(
						__( 'WASM failed to initialize', 'gll-info' )
					);
				}

				const parsedData = await parseGLLFromUrl( url );

				setData( parsedData );
				setFileName( name || url.split( '/' ).pop() );
				setFileId( attachmentId );
				setIsLoading( false );

				return parsedData;
			} catch ( err ) {
				setError( err );
				setIsLoading( false );
				return null;
			}
		},
		[ ensureWasmReady ]
	);

	/**
	 * Clear all loaded data.
	 */
	const clearData = useCallback( () => {
		setData( null );
		setFileName( null );
		setFileId( null );
		setError( null );
	}, [] );

	/**
	 * Memoized context value.
	 */
	const contextValue = useMemo(
		() => ( {
			data,
			isLoading,
			error,
			wasmReady,
			loadFile,
			loadFromUrl,
			clearData,
			fileName,
			fileId,
		} ),
		[
			data,
			isLoading,
			error,
			wasmReady,
			loadFile,
			loadFromUrl,
			clearData,
			fileName,
			fileId,
		]
	);

	return (
		<GLLContext.Provider value={ contextValue }>
			{ children }
		</GLLContext.Provider>
	);
}

/**
 * Hook to use the GLL context.
 *
 * @return {GLLContextValue} GLL context value.
 */
export function useGLL() {
	const context = useContext( GLLContext );
	if ( context === undefined ) {
		// Deliberately untranslated: this fires only when a developer wires the
		// hook up outside a provider, so it never reaches a site visitor and is
		// most useful verbatim in a bug report.
		throw new Error( 'useGLL must be used within a GLLProvider' );
	}
	return context;
}

/**
 * Hook to load a GLL file on demand.
 *
 * This hook provides a simpler interface for components that just need
 * to load a file without the full context.
 *
 * @return {Object} Object with load function and state.
 */
export function useGLLLoader() {
	const [ data, setData ] = useState( null );
	const [ parsedFrom, setParsedFrom ] = useState( null );
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );

	// Which load is the current one. A block whose file is changed twice in
	// quick succession gets two parses in flight, and the slower one must not
	// win just because it finished last.
	const generation = useRef( 0 );

	const load = useCallback(
		async (
			fileOrUrl,
			isUrl = false,
			options: { proxy?: 'never' | 'fallback' } = {}
		) => {
			const mine = ++generation.current;

			setIsLoading( true );
			setError( null );

			try {
				await initWasm();

				let parsedData;
				let digest = null;
				let via = null;
				let length = null;

				if ( isUrl ) {
					// Fetched here rather than through `parseGLLFromUrl()` so the
					// bytes can be fingerprinted on the way past. Re-fetching to
					// hash would double the download of a file that can run to
					// tens of megabytes.
					let arrayBuffer;
					via = 'direct';

					try {
						// THE DIRECT ATTEMPT COMES FIRST, ALWAYS, and not only to
						// save the server a download: it is the exact request every
						// visitor's browser will make, so its outcome is the honest
						// answer to "will the published page work?".
						const response = await fetch( fileOrUrl );
						if ( ! response.ok ) {
							throw new HttpError(
								response.status,
								response.statusText
							);
						}

						arrayBuffer = await response.arrayBuffer();
					} catch ( directError ) {
						if (
							'fallback' !== options?.proxy ||
							! canUseProxy()
						) {
							throw directError;
						}

						// Only the editor ever gets here, and what it learns is
						// precise: the file exists and this server can reach it, so
						// the browser's failure was the remote host refusing to let
						// another site read it. `parsedFrom.via` carries that to the
						// UI, which must say so rather than show a clean preview of
						// something visitors will not see.
						arrayBuffer = await fetchRemoteFile( fileOrUrl );
						via = 'proxy';
					}

					length = arrayBuffer.byteLength;
					digest = await sha256Hex( arrayBuffer );
					parsedData = await parseGLL( arrayBuffer );
				} else {
					const arrayBuffer = await fileOrUrl.arrayBuffer();
					length = arrayBuffer.byteLength;
					digest = await sha256Hex( arrayBuffer );
					parsedData = await parseGLL( arrayBuffer );
				}

				if ( mine !== generation.current ) {
					return null;
				}

				// Set together, and never separately: everything downstream relies
				// on `parsedFrom` describing the file `data` came from.
				setParsedFrom( {
					url: isUrl ? fileOrUrl : null,
					hash: digest,
					length,
					via,
				} );
				setData( parsedData );
				setIsLoading( false );
				return parsedData;
			} catch ( err ) {
				if ( mine !== generation.current ) {
					return null;
				}

				setError( err );
				setIsLoading( false );
				return null;
			}
		},
		[]
	);

	const clear = useCallback( () => {
		++generation.current;
		setData( null );
		setParsedFrom( null );
		setError( null );
	}, [] );

	return { data, parsedFrom, isLoading, error, load, clear };
}

/**
 * SHA-256 of a buffer, as lowercase hex.
 *
 * Lets the editor prove to the server which bytes it parsed, so a file replaced
 * between the fetch and the save cannot have the old parse stored against it.
 *
 * Returns null rather than throwing where `crypto.subtle` is unavailable, which
 * is any page not in a secure context — a plain-HTTP site. The server treats a
 * missing digest as "cannot prove it" and stores the payload anyway, so caching
 * still works there; it simply loses this one guarantee.
 *
 * @param {ArrayBuffer} buffer Bytes to digest.
 * @return {Promise<string|null>} Hex digest, or null when unavailable.
 */
async function sha256Hex( buffer ) {
	if ( ! globalThis.crypto?.subtle ) {
		return null;
	}

	try {
		const digest = await globalThis.crypto.subtle.digest(
			'SHA-256',
			buffer
		);

		return Array.from( new Uint8Array( digest ) )
			.map( ( byte ) => byte.toString( 16 ).padStart( 2, '0' ) )
			.join( '' );
	} catch ( error ) {
		return null;
	}
}

export default GLLContext;
