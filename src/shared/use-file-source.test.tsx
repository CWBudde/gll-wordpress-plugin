/**
 * The loading wiring seven blocks share.
 *
 * Two behaviours are worth a test each. The file is fetched once per address,
 * not once per render — the guard that ensures that is the whole reason the flag
 * exists. And selecting a new file drops the previous parse, in every block,
 * which six of the seven used not to do: without it the editor holds one file's
 * data under another file's identity for the length of a parse, and whatever
 * runs in that window records the wrong thing.
 *
 * @package
 */

import { act, renderHook } from '@testing-library/react';

import { useFileSource } from './use-file-source';

const mockLoad = jest.fn();
const mockClear = jest.fn();

jest.mock( './gll-context', () => ( {
	useGLLLoader: () => ( {
		data: null,
		parsedFrom: null,
		isLoading: false,
		error: null,
		load: mockLoad,
		clear: mockClear,
	} ),
} ) );

const MEDIA = {
	fileId: 7,
	fileUrl: 'https://example.org/a.gll',
	fileName: 'a.gll',
};

beforeEach( () => {
	mockLoad.mockClear();
	mockClear.mockClear();
} );

describe( 'useFileSource', () => {
	it( 'loads the file once, and not again on a re-render', () => {
		const { rerender } = renderHook( () =>
			useFileSource( { attributes: MEDIA, setAttributes: jest.fn() } )
		);

		rerender();
		rerender();

		expect( mockLoad ).toHaveBeenCalledTimes( 1 );
		expect( mockLoad ).toHaveBeenCalledWith( MEDIA.fileUrl, true, {
			proxy: 'fallback',
		} );
	} );

	it( 'loads nothing when no file is chosen', () => {
		renderHook( () =>
			useFileSource( {
				attributes: { fileId: 0, fileUrl: '', fileName: '' },
				setAttributes: jest.fn(),
			} )
		);

		expect( mockLoad ).not.toHaveBeenCalled();
	} );

	it( 'never reaches for the proxy when it is not allowed to', () => {
		renderHook( () =>
			useFileSource( {
				attributes: MEDIA,
				setAttributes: jest.fn(),
				allowProxy: false,
			} )
		);

		expect( mockLoad ).toHaveBeenCalledWith( MEDIA.fileUrl, true, {
			proxy: 'never',
		} );
	} );

	it( 'writes the triple and drops the previous parse together', () => {
		const setAttributes = jest.fn();
		const { result } = renderHook( () =>
			useFileSource( { attributes: MEDIA, setAttributes } )
		);

		const next = {
			fileId: 0,
			fileUrl: 'https://cdn.example/b.gll',
			fileName: 'b.gll',
		};

		act( () => result.current.setSource( next ) );

		expect( setAttributes ).toHaveBeenCalledWith( next );
		expect( mockClear ).toHaveBeenCalled();
	} );

	it( 'clears all three attributes on removal', () => {
		const setAttributes = jest.fn();
		const { result } = renderHook( () =>
			useFileSource( { attributes: MEDIA, setAttributes } )
		);

		act( () => result.current.clearSource() );

		expect( setAttributes ).toHaveBeenCalledWith( {
			fileId: 0,
			fileUrl: '',
			fileName: '',
		} );
		expect( mockClear ).toHaveBeenCalled();
	} );

	it( 'fetches the same address again when asked to re-check', () => {
		const { result } = renderHook( () =>
			useFileSource( { attributes: MEDIA, setAttributes: jest.fn() } )
		);

		expect( mockLoad ).toHaveBeenCalledTimes( 1 );

		act( () => result.current.reload() );

		expect( mockLoad ).toHaveBeenCalledTimes( 2 );
	} );
} );
