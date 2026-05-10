/**
 * Component tests for the gll-info block's Edit component.
 *
 * - The shared barrel (../shared) is mocked so we don't pull in three.js or
 *   chart.js, neither of which is needed for these tests.
 * - @wordpress/block-editor's MediaUpload is mocked to expose its onSelect
 *   callback as a button so tests can simulate file selection without the
 *   real media library.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import Edit from './edit';

// Loader state controlled per-test.
const mockLoaderState: {
	data: any;
	isLoading: boolean;
	error: Error | null;
	load: jest.Mock;
	clear: jest.Mock;
} = {
	data: null,
	isLoading: false,
	error: null,
	load: jest.fn().mockResolvedValue( null ),
	clear: jest.fn(),
};

jest.mock( '../shared', () => ( {
	useGLLLoader: () => mockLoaderState,
} ) );

// Mock @wordpress/block-editor: render MediaUpload as a button that fires
// onSelect with a fake media object when clicked.
jest.mock( '@wordpress/block-editor', () => {
	return {
		__esModule: true,
		useBlockProps: ( extra: any = {} ) => ( {
			className: extra?.className ?? '',
			'data-block': 'gll-info/gll-info',
		} ),
		InspectorControls: ( { children }: any ) => (
			<div data-testid="inspector-controls">{ children }</div>
		),
		MediaUploadCheck: ( { children }: any ) => <>{ children }</>,
		MediaUpload: ( { onSelect, render: r }: any ) => (
			<>
				{ r( {
					open: () =>
						onSelect( {
							id: 99,
							url: 'https://example.com/x.gll',
							filename: 'x.gll',
							title: 'x',
						} ),
				} ) }
				<button
					type="button"
					data-testid="trigger-media-select"
					onClick={ () =>
						onSelect( {
							id: 42,
							url: 'https://example.com/sample.gll',
							filename: 'sample.gll',
							title: 'Sample',
						} )
					}
				>
					trigger select
				</button>
			</>
		),
	};
} );

// Mock @wordpress/components: pass-through implementations sufficient for
// asserting on labels, error text, and toggle interactions.
jest.mock( '@wordpress/components', () => {
	return {
		__esModule: true,
		PanelBody: ( { title, children }: any ) => (
			<section data-panel-title={ title }>
				<h3>{ title }</h3>
				{ children }
			</section>
		),
		Button: ( { children, onClick, variant }: any ) => (
			<button type="button" data-variant={ variant } onClick={ onClick }>
				{ children }
			</button>
		),
		Spinner: () => <div data-testid="spinner" />,
		ToggleControl: ( { label, checked, onChange }: any ) => {
			const id = `toggle-${ label.replace( /\s+/g, '-' ) }`;
			return (
				<>
					<label htmlFor={ id }>{ label }</label>
					<input
						id={ id }
						type="checkbox"
						aria-label={ label }
						checked={ !! checked }
						onChange={ ( e ) => onChange( e.target.checked ) }
					/>
				</>
			);
		},
		SelectControl: ( { label, value, options, onChange }: any ) => {
			const id = `select-${ label.replace( /\s+/g, '-' ) }`;
			return (
				<>
					<label htmlFor={ id }>{ label }</label>
					<select
						id={ id }
						aria-label={ label }
						value={ value }
						onChange={ ( e ) => onChange( e.target.value ) }
					>
						{ options.map( ( opt: any ) => (
							<option key={ opt.value } value={ opt.value }>
								{ opt.label }
							</option>
						) ) }
					</select>
				</>
			);
		},
		Placeholder: ( { label, instructions, children }: any ) => (
			<div data-testid="placeholder">
				<h2>{ label }</h2>
				<p>{ instructions }</p>
				{ children }
			</div>
		),
	};
} );

const defaultAttributes = {
	fileId: 0,
	fileUrl: '',
	fileName: '',
	showOverview: true,
	showSources: true,
	sourcesDisplayMode: 'expandable',
	showSourceResponseCharts: false,
	showResponses: true,
};

beforeEach( () => {
	mockLoaderState.data = null;
	mockLoaderState.isLoading = false;
	mockLoaderState.error = null;
	mockLoaderState.load = jest.fn().mockResolvedValue( null );
	mockLoaderState.clear = jest.fn();
} );

describe( 'Edit (gll-info block) — placeholder branch', () => {
	it( 'renders the Placeholder when no file is selected', () => {
		const setAttributes = jest.fn();
		render(
			<Edit
				attributes={ defaultAttributes }
				setAttributes={ setAttributes }
			/>
		);
		expect( screen.getByTestId( 'placeholder' ) ).toBeInTheDocument();
		expect( screen.getByText( /GLL File Viewer/i ) ).toBeInTheDocument();
		expect( screen.getByText( /Select a GLL file/i ) ).toBeInTheDocument();
	} );

	it( 'updates attributes when a file is selected from the media library', () => {
		const setAttributes = jest.fn();
		render(
			<Edit
				attributes={ defaultAttributes }
				setAttributes={ setAttributes }
			/>
		);
		fireEvent.click( screen.getByTestId( 'trigger-media-select' ) );
		expect( setAttributes ).toHaveBeenCalledWith( {
			fileId: 42,
			fileUrl: 'https://example.com/sample.gll',
			fileName: 'sample.gll',
		} );
		expect( mockLoaderState.clear ).toHaveBeenCalled();
	} );
} );

describe( 'Edit (gll-info block) — loaded with file', () => {
	const attributesWithFile = {
		...defaultAttributes,
		fileId: 42,
		fileUrl: 'https://example.com/sample.gll',
		fileName: 'sample.gll',
	};

	it( 'shows the spinner and "Parsing GLL file..." while loading', () => {
		mockLoaderState.isLoading = true;
		render(
			<Edit
				attributes={ attributesWithFile }
				setAttributes={ jest.fn() }
			/>
		);
		expect( screen.getByTestId( 'spinner' ) ).toBeInTheDocument();
		expect( screen.getByText( /Parsing GLL file/i ) ).toBeInTheDocument();
	} );

	it( 'shows the error branch with error message in a <code> block', () => {
		mockLoaderState.error = new Error( 'something went wrong' );
		render(
			<Edit
				attributes={ attributesWithFile }
				setAttributes={ jest.fn() }
			/>
		);
		expect(
			screen.getByText( /Error loading GLL file/i )
		).toBeInTheDocument();
		const codeEl = screen.getByText( 'something went wrong' );
		expect( codeEl.tagName.toLowerCase() ).toBe( 'code' );
	} );

	it( 'renders overview and sources when data is present', () => {
		mockLoaderState.data = {
			GenSystem: { Label: 'My Speaker', Manufacturer: 'Acme' },
			Database: {
				SourceDefinitions: [
					{
						Key: 'src-1',
						Definition: {
							Label: 'LF',
							NominalBandwidthFrom: 50,
							NominalBandwidthTo: 1000,
						},
					},
				],
			},
			Header: { FormatVersion: '2.0', ChecksumValid: true },
		};
		render(
			<Edit
				attributes={ attributesWithFile }
				setAttributes={ jest.fn() }
			/>
		);

		// Overview-only content (System Information header + Manufacturer cell).
		expect( screen.getByText( /System Information/i ) ).toBeInTheDocument();
		expect( screen.getByText( 'Acme' ) ).toBeInTheDocument();
		// Sources header visible (with count).
		expect( screen.getByText( /Acoustic Sources/i ) ).toBeInTheDocument();
	} );

	it( 'hides overview/sources when the corresponding toggles are off', () => {
		mockLoaderState.data = {
			GenSystem: { Label: 'X' },
			Database: {
				SourceDefinitions: [
					{ Key: 'src-1', Definition: { Label: 'LF' } },
				],
			},
		};
		render(
			<Edit
				attributes={ {
					...attributesWithFile,
					showOverview: false,
					showSources: false,
				} }
				setAttributes={ jest.fn() }
			/>
		);
		// 'X' (the GenSystem.Label) appears in the always-rendered block header,
		// so we check for overview-only and sources-only content instead.
		expect(
			screen.queryByText( /System Information/i )
		).not.toBeInTheDocument();
		expect(
			screen.queryByText( /Acoustic Sources/i )
		).not.toBeInTheDocument();
	} );

	it( 'fires setAttributes when a display-options toggle is changed', () => {
		mockLoaderState.data = {
			GenSystem: { Label: 'X' },
			Database: { SourceDefinitions: [] },
		};
		const setAttributes = jest.fn();
		render(
			<Edit
				attributes={ attributesWithFile }
				setAttributes={ setAttributes }
			/>
		);

		fireEvent.click( screen.getByLabelText( 'Show Overview' ) );
		expect( setAttributes ).toHaveBeenCalledWith( { showOverview: false } );

		fireEvent.change( screen.getByLabelText( 'Sources Display Mode' ), {
			target: { value: 'detailed' },
		} );
		expect( setAttributes ).toHaveBeenCalledWith( {
			sourcesDisplayMode: 'detailed',
		} );
	} );
} );
