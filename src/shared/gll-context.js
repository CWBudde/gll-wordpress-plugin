/**
 * GLL Context
 *
 * React context for sharing parsed GLL data between blocks.
 *
 * @package GllInfo
 */

import { createContext, useContext, useState, useCallback, useMemo } from '@wordpress/element';
import { initWasm, parseGLL, parseGLLFromUrl, isWasmReady, getWasmError } from './wasm-loader';

/**
 * GLL Context value shape.
 *
 * @typedef {Object} GLLContextValue
 * @property {Object|null}   data         Parsed GLL data.
 * @property {boolean}       isLoading    Whether a file is being loaded/parsed.
 * @property {Error|null}    error        Any error that occurred.
 * @property {boolean}       wasmReady    Whether WASM is initialized.
 * @property {Function}      loadFile     Function to load a GLL file.
 * @property {Function}      loadFromUrl  Function to load a GLL file from URL.
 * @property {Function}      clearData    Function to clear loaded data.
 * @property {string|null}   fileName     Name of the loaded file.
 * @property {number|null}   fileId       WordPress attachment ID if applicable.
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
export const GLLContext = createContext( defaultContextValue );

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
	 * @param {File}        file          The GLL file.
	 * @param {number|null} attachmentId  Optional WordPress attachment ID.
	 * @return {Promise<Object|null>} Parsed data or null on error.
	 */
	const loadFile = useCallback( async ( file, attachmentId = null ) => {
		setIsLoading( true );
		setError( null );

		try {
			const ready = await ensureWasmReady();
			if ( ! ready ) {
				throw new Error( 'WASM failed to initialize' );
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
	}, [ ensureWasmReady ] );

	/**
	 * Load and parse a GLL file from a URL.
	 *
	 * @param {string}      url           The URL to the GLL file.
	 * @param {string|null} name          Optional file name.
	 * @param {number|null} attachmentId  Optional WordPress attachment ID.
	 * @return {Promise<Object|null>} Parsed data or null on error.
	 */
	const loadFromUrl = useCallback( async ( url, name = null, attachmentId = null ) => {
		setIsLoading( true );
		setError( null );

		try {
			const ready = await ensureWasmReady();
			if ( ! ready ) {
				throw new Error( 'WASM failed to initialize' );
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
	}, [ ensureWasmReady ] );

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
	const contextValue = useMemo( () => ( {
		data,
		isLoading,
		error,
		wasmReady,
		loadFile,
		loadFromUrl,
		clearData,
		fileName,
		fileId,
	} ), [ data, isLoading, error, wasmReady, loadFile, loadFromUrl, clearData, fileName, fileId ] );

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
	const [ isLoading, setIsLoading ] = useState( false );
	const [ error, setError ] = useState( null );

	const load = useCallback( async ( fileOrUrl, isUrl = false ) => {
		setIsLoading( true );
		setError( null );

		try {
			await initWasm();

			let parsedData;
			if ( isUrl ) {
				parsedData = await parseGLLFromUrl( fileOrUrl );
			} else {
				const arrayBuffer = await fileOrUrl.arrayBuffer();
				parsedData = await parseGLL( arrayBuffer );
			}

			setData( parsedData );
			setIsLoading( false );
			return parsedData;
		} catch ( err ) {
			setError( err );
			setIsLoading( false );
			return null;
		}
	}, [] );

	const clear = useCallback( () => {
		setData( null );
		setError( null );
	}, [] );

	return { data, isLoading, error, load, clear };
}

export default GLLContext;
