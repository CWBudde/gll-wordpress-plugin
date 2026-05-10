/**
 * Unit tests for the GLLProvider, useGLL, and useGLLLoader hooks.
 *
 * The wasm-loader module is mocked so these tests don't touch real WASM.
 */

import { render, act, waitFor } from '@testing-library/react';
import { useGLL, useGLLLoader, GLLProvider } from './gll-context';

const mockInitWasm = jest.fn();
const mockParseGLL = jest.fn();
const mockParseGLLFromUrl = jest.fn();
const mockIsWasmReady = jest.fn();
const mockGetWasmError = jest.fn();

jest.mock( './wasm-loader', () => ( {
	initWasm: ( ...args: unknown[] ) => mockInitWasm( ...args ),
	parseGLL: ( ...args: unknown[] ) => mockParseGLL( ...args ),
	parseGLLFromUrl: ( ...args: unknown[] ) => mockParseGLLFromUrl( ...args ),
	isWasmReady: ( ...args: unknown[] ) => mockIsWasmReady( ...args ),
	getWasmError: ( ...args: unknown[] ) => mockGetWasmError( ...args ),
} ) );

beforeEach( () => {
	mockInitWasm.mockReset().mockResolvedValue( undefined );
	mockParseGLL.mockReset().mockResolvedValue( { GenSystem: { Label: 'X' } } );
	mockParseGLLFromUrl
		.mockReset()
		.mockResolvedValue( { GenSystem: { Label: 'FromUrl' } } );
	mockIsWasmReady.mockReset().mockReturnValue( false );
	mockGetWasmError.mockReset().mockReturnValue( null );
} );

/**
 * Render the provider with a child that exposes the context value to assertions.
 */
function renderWithProvider() {
	const captured: { value: ReturnType< typeof useGLL > | null } = {
		value: null,
	};
	function Probe() {
		captured.value = useGLL();
		return null;
	}
	render(
		<GLLProvider>
			<Probe />
		</GLLProvider>
	);
	return captured;
}

describe( 'useGLL', () => {
	it( 'returns the default context value when used outside a provider', () => {
		// NOTE: createContext is initialized with a defaultContextValue, so the
		// "must be used within a GLLProvider" check in useGLL() is dead code in
		// the current implementation. This test pins the actual behavior.
		const captured: { value: ReturnType< typeof useGLL > | null } = {
			value: null,
		};
		function Probe() {
			captured.value = useGLL();
			return null;
		}
		render( <Probe /> );
		expect( captured.value ).toMatchObject( {
			data: null,
			isLoading: false,
			error: null,
			fileName: null,
			fileId: null,
		} );
	} );

	it( 'exposes provider state to consumers', () => {
		const captured = renderWithProvider();
		expect( captured.value ).toMatchObject( {
			data: null,
			isLoading: false,
			error: null,
			fileName: null,
			fileId: null,
		} );
		expect( typeof captured.value?.loadFile ).toBe( 'function' );
		expect( typeof captured.value?.loadFromUrl ).toBe( 'function' );
		expect( typeof captured.value?.clearData ).toBe( 'function' );
	} );
} );

describe( 'GLLProvider.loadFile', () => {
	it( 'transitions through loading and populates data + fileName', async () => {
		const captured = renderWithProvider();
		const file = new File( [ new Uint8Array( [ 1, 2 ] ) ], 'demo.gll' );

		await act( async () => {
			await captured.value!.loadFile( file, 42 );
		} );

		expect( captured.value ).toMatchObject( {
			data: { GenSystem: { Label: 'X' } },
			fileName: 'demo.gll',
			fileId: 42,
			isLoading: false,
			error: null,
		} );
		expect( mockInitWasm ).toHaveBeenCalledTimes( 1 );
		expect( mockParseGLL ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'sets error and resets isLoading when initWasm fails', async () => {
		mockInitWasm.mockRejectedValueOnce( new Error( 'wasm boom' ) );
		const captured = renderWithProvider();
		const file = new File( [ new Uint8Array() ], 'demo.gll' );

		await act( async () => {
			const result = await captured.value!.loadFile( file );
			expect( result ).toBeNull();
		} );

		expect( captured.value?.error ).toBeInstanceOf( Error );
		expect( captured.value?.isLoading ).toBe( false );
		expect( captured.value?.data ).toBeNull();
	} );

	it( 'skips re-initializing when WASM is already ready', async () => {
		mockIsWasmReady.mockReturnValue( true );
		const captured = renderWithProvider();
		const file = new File( [ new Uint8Array() ], 'demo.gll' );

		await act( async () => {
			await captured.value!.loadFile( file );
		} );

		expect( mockInitWasm ).not.toHaveBeenCalled();
		expect( mockParseGLL ).toHaveBeenCalledTimes( 1 );
	} );
} );

describe( 'GLLProvider.loadFromUrl', () => {
	it( 'derives the fileName from the URL when none is supplied', async () => {
		const captured = renderWithProvider();

		await act( async () => {
			await captured.value!.loadFromUrl(
				'https://example.com/path/sample.gll'
			);
		} );

		expect( captured.value?.fileName ).toBe( 'sample.gll' );
		expect( captured.value?.data ).toEqual( {
			GenSystem: { Label: 'FromUrl' },
		} );
		expect( captured.value?.fileId ).toBeNull();
	} );

	it( 'preserves an explicit name and attachment id', async () => {
		const captured = renderWithProvider();

		await act( async () => {
			await captured.value!.loadFromUrl(
				'https://example.com/path/sample.gll',
				'custom-name.gll',
				123
			);
		} );

		expect( captured.value?.fileName ).toBe( 'custom-name.gll' );
		expect( captured.value?.fileId ).toBe( 123 );
	} );
} );

describe( 'GLLProvider.clearData', () => {
	it( 'resets data, fileName, fileId, and error', async () => {
		const captured = renderWithProvider();

		await act( async () => {
			await captured.value!.loadFile(
				new File( [ new Uint8Array() ], 'demo.gll' ),
				7
			);
		} );
		expect( captured.value?.data ).not.toBeNull();

		act( () => {
			captured.value!.clearData();
		} );

		expect( captured.value ).toMatchObject( {
			data: null,
			fileName: null,
			fileId: null,
			error: null,
		} );
	} );
} );

describe( 'useGLLLoader (standalone)', () => {
	function ProbeLoader( {
		captured,
	}: {
		captured: { value: ReturnType< typeof useGLLLoader > | null };
	} ) {
		captured.value = useGLLLoader();
		return null;
	}

	it( 'returns initial state', () => {
		const captured: {
			value: ReturnType< typeof useGLLLoader > | null;
		} = { value: null };
		render( <ProbeLoader captured={ captured } /> );
		expect( captured.value ).toMatchObject( {
			data: null,
			isLoading: false,
			error: null,
		} );
		expect( typeof captured.value?.load ).toBe( 'function' );
	} );

	it( 'loads from a File and updates data', async () => {
		const captured: {
			value: ReturnType< typeof useGLLLoader > | null;
		} = { value: null };
		render( <ProbeLoader captured={ captured } /> );
		const file = new File( [ new Uint8Array( [ 1 ] ) ], 'demo.gll' );

		await act( async () => {
			await captured.value!.load( file, false );
		} );

		expect( captured.value?.data ).toEqual( { GenSystem: { Label: 'X' } } );
		expect( mockParseGLL ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'loads from a URL when isUrl is true', async () => {
		const captured: {
			value: ReturnType< typeof useGLLLoader > | null;
		} = { value: null };
		render( <ProbeLoader captured={ captured } /> );

		await act( async () => {
			await captured.value!.load(
				'https://example.com/sample.gll',
				true
			);
		} );

		expect( mockParseGLLFromUrl ).toHaveBeenCalledWith(
			'https://example.com/sample.gll'
		);
		expect( captured.value?.data ).toEqual( {
			GenSystem: { Label: 'FromUrl' },
		} );
	} );

	it( 'sets error state when parsing fails', async () => {
		mockParseGLL.mockRejectedValueOnce( new Error( 'parse failed' ) );
		const captured: {
			value: ReturnType< typeof useGLLLoader > | null;
		} = { value: null };
		render( <ProbeLoader captured={ captured } /> );

		await act( async () => {
			const result = await captured.value!.load(
				new File( [ new Uint8Array() ], 'demo.gll' ),
				false
			);
			expect( result ).toBeNull();
		} );

		await waitFor( () => {
			expect( captured.value?.error ).toBeInstanceOf( Error );
		} );
		expect( captured.value?.isLoading ).toBe( false );
	} );

	it( 'clear() resets data and error', async () => {
		const captured: {
			value: ReturnType< typeof useGLLLoader > | null;
		} = { value: null };
		render( <ProbeLoader captured={ captured } /> );

		await act( async () => {
			await captured.value!.load(
				new File( [ new Uint8Array() ], 'demo.gll' ),
				false
			);
		} );
		expect( captured.value?.data ).not.toBeNull();

		act( () => {
			captured.value!.clear();
		} );

		expect( captured.value?.data ).toBeNull();
		expect( captured.value?.error ).toBeNull();
	} );
} );
