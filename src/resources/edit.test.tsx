/**
 * Component tests for the resources block's Edit component.
 *
 * Follows the mocking approach of src/gll-info/edit.test.tsx: the `../shared`
 * barrel is stubbed so three.js and chart.js never load, and the WordPress
 * editor components are reduced to the minimum needed to assert on labels and
 * interactions.
 *
 * The behaviour worth pinning here is the editor's deliberate divergence from
 * the front end: an empty section still renders, so an author who toggles a
 * control can see why the preview did not change.
 */

import { render, screen, fireEvent } from '@testing-library/react';
import Edit from './edit';

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
	useFileSource: ( { attributes, setAttributes }: any ) => ( {
		...mockLoaderState,
		source: attributes,
		// Mirrors the real hook: writing the triple and dropping the previous
		// parse are one action, which is what stops a new file being described
		// by the old file's data.
		setSource: ( next: any ) => {
			setAttributes( next );
			mockLoaderState.clear();
		},
		clearSource: () => {
			setAttributes( { fileId: 0, fileUrl: '', fileName: '' } );
			mockLoaderState.clear();
		},
		reload: jest.fn(),
	} ),
	// The control has its own suite; here it only needs to be operable, so the
	// two things a block can ask it to do are one button each.
	FileSourceControl: ( {
		variant,
		label,
		instructions,
		onChange,
		onRemove,
		children,
	}: any ) => (
		<div
			data-testid={
				'placeholder' === variant ? 'placeholder' : 'file-source'
			}
			data-allowed-types="application/x-gll,application/octet-stream"
		>
			<span>{ label }</span>
			<span>{ instructions }</span>
			<button
				type="button"
				data-testid="trigger-media-select"
				onClick={ () =>
					onChange( {
						fileId: 42,
						fileUrl: 'https://example.com/sample.gll',
						fileName: 'sample.gll',
					} )
				}
			>
				Select GLL File
			</button>
			<button
				type="button"
				data-testid="trigger-remove"
				onClick={ onRemove }
			>
				Remove
			</button>
			{ children }
		</div>
	),
	useGLLLoader: () => mockLoaderState,
	// Publishing the display subset is a network side effect with no rendered
	// output; `src/shared/use-cache-publisher.test.ts` covers it directly.
	useCachePublisher: () => jest.fn(),
	appearanceClass: ( appearance: string ) =>
		`gll-block gll-appearance--${ appearance ?? 'auto' }`,
	AppearanceControl: ( { appearance, onChange }: any ) => (
		<button
			type="button"
			data-testid="appearance-control"
			data-appearance={ appearance }
			onClick={ () => onChange( 'transparent' ) }
		>
			appearance
		</button>
	),
} ) );

jest.mock( '@wordpress/block-editor', () => ( {
	__esModule: true,
	useBlockProps: ( extra: any = {} ) => ( {
		className: extra?.className ?? '',
		'data-block': 'gll-info/resources',
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
						id: 42,
						url: 'https://example.com/sample.gll',
						filename: 'sample.gll',
						title: 'Sample',
					} ),
			} ) }
		</>
	),
} ) );

jest.mock( '@wordpress/components', () => ( {
	__esModule: true,
	PanelBody: ( { title, children }: any ) => (
		<section data-panel-title={ title }>{ children }</section>
	),
	Button: ( { children, onClick, variant }: any ) => (
		<button type="button" data-variant={ variant } onClick={ onClick }>
			{ children }
		</button>
	),
	Spinner: () => <div data-testid="spinner" />,
	ToggleControl: ( { label, checked, onChange, help }: any ) => (
		<>
			<label htmlFor={ `t-${ label }` }>{ label }</label>
			<input
				id={ `t-${ label }` }
				type="checkbox"
				aria-label={ label }
				checked={ !! checked }
				onChange={ ( e ) => onChange( e.target.checked ) }
			/>
			{ help && <span data-testid={ `help-${ label }` }>{ help }</span> }
		</>
	),
	RangeControl: ( { label, value, onChange }: any ) => (
		<>
			<label htmlFor={ `r-${ label }` }>{ label }</label>
			<input
				id={ `r-${ label }` }
				type="range"
				aria-label={ label }
				value={ value }
				onChange={ ( e ) => onChange( Number( e.target.value ) ) }
			/>
		</>
	),
	Placeholder: ( { label, instructions, children }: any ) => (
		<div data-testid="placeholder">
			<h2>{ label }</h2>
			<p>{ instructions }</p>
			{ children }
		</div>
	),
} ) );

const PDF_URI = 'data:application/pdf;base64,JVBERi0=';
const PNG_URI = 'data:image/png;base64,iVBORw0KGgo=';

const defaultAttributes = {
	fileId: 1,
	fileUrl: 'https://example.com/sample.gll',
	fileName: 'sample.gll',
	showDocumentation: true,
	showDataFiles: true,
	showPreviews: true,
	previewMaxHeight: 240,
	hideWhenEmpty: false,
	appearance: 'auto',
};

const dataWithBoth = {
	Database: {
		IncludeFiles: [
			{
				Label: 'G512 Data',
				Filename: 'CODA Data Sheet - G512-Pro.pdf',
				Name: 'CODA Data Sheet - G512-Pro.pdf',
				Size: 523073,
				DataUri: PDF_URI,
			},
		],
		DataFiles: [
			{
				Filename: '.\\Drawings\\logo.png',
				Name: 'logo.png',
				Size: 5028,
				DataUri: PNG_URI,
			},
		],
	},
};

/**
 * Render the Edit component with merged attributes.
 *
 * @param {Object} attributes Attribute overrides.
 * @return {Object} Testing Library render result plus the setAttributes spy.
 */
function renderEdit( attributes = {} ) {
	const setAttributes = jest.fn();
	const result = render(
		<Edit
			attributes={ { ...defaultAttributes, ...attributes } }
			setAttributes={ setAttributes }
		/>
	);
	return { ...result, setAttributes };
}

beforeEach( () => {
	mockLoaderState.data = null;
	mockLoaderState.isLoading = false;
	mockLoaderState.error = null;
	mockLoaderState.load.mockClear();
	mockLoaderState.clear.mockClear();
} );

describe( 'Resources Edit', () => {
	it( 'offers a file picker when no file is selected', () => {
		renderEdit( { fileUrl: '', fileName: '' } );

		expect( screen.getByTestId( 'placeholder' ) ).toBeInTheDocument();
		expect( screen.getByText( 'GLL Resources' ) ).toBeInTheDocument();
	} );

	it( 'lists documentation and data files', () => {
		mockLoaderState.data = dataWithBoth;
		renderEdit();

		expect( screen.getByText( 'Documentation' ) ).toBeInTheDocument();
		expect( screen.getByText( 'Data Files' ) ).toBeInTheDocument();

		// Documentation shows the human label, with the file name beneath it.
		expect( screen.getByText( 'G512 Data' ) ).toBeInTheDocument();
		expect(
			screen.getByText( 'CODA Data Sheet - G512-Pro.pdf' )
		).toBeInTheDocument();

		expect( screen.getByText( 'logo.png' ) ).toBeInTheDocument();
		expect( screen.getByText( '510.8 KB' ) ).toBeInTheDocument();
	} );

	it( 'points each download at the data URI under its base name', () => {
		mockLoaderState.data = dataWithBoth;
		renderEdit();

		const link = screen.getByLabelText(
			'Download CODA Data Sheet - G512-Pro.pdf'
		);
		expect( link ).toHaveAttribute( 'href', PDF_URI );
		expect( link ).toHaveAttribute(
			'download',
			'CODA Data Sheet - G512-Pro.pdf'
		);
	} );

	it( 'downloads a data file under its folded base name, not its stored path', () => {
		mockLoaderState.data = dataWithBoth;
		renderEdit();

		expect( screen.getByLabelText( 'Download logo.png' ) ).toHaveAttribute(
			'download',
			'logo.png'
		);
	} );

	it( 'previews images and drops the preview when previews are off', () => {
		mockLoaderState.data = dataWithBoth;
		const { rerender } = renderEdit();

		expect( screen.getByAltText( 'logo.png' ) ).toHaveAttribute(
			'src',
			PNG_URI
		);

		rerender(
			<Edit
				attributes={ { ...defaultAttributes, showPreviews: false } }
				setAttributes={ jest.fn() }
			/>
		);

		expect( screen.queryByAltText( 'logo.png' ) ).not.toBeInTheDocument();
		// The download must survive losing the preview.
		expect(
			screen.getByLabelText( 'Download logo.png' )
		).toBeInTheDocument();
	} );

	it( 'offers no download for a file the parser did not inline', () => {
		mockLoaderState.data = {
			Database: {
				IncludeFiles: [],
				DataFiles: [
					{ Filename: 'big.xed', Name: 'big.xed', Size: 900 },
				],
			},
		};
		renderEdit();

		expect( screen.getByText( 'big.xed' ) ).toBeInTheDocument();
		expect( screen.getByText( '900 B' ) ).toBeInTheDocument();
		expect(
			screen.queryByLabelText( 'Download big.xed' )
		).not.toBeInTheDocument();
	} );

	it( 'still shows an empty section, unlike the front end', () => {
		// 26 of 29 reference files have no documentation; the author needs to
		// see the section to understand why the toggle appears to do nothing.
		mockLoaderState.data = {
			Database: { IncludeFiles: [], DataFiles: [] },
		};
		renderEdit();

		expect( screen.getByText( 'Documentation' ) ).toBeInTheDocument();
		expect(
			screen.getByText( 'No documentation files in this GLL.' )
		).toBeInTheDocument();
	} );

	it( 'hides a section when its toggle is off', () => {
		mockLoaderState.data = dataWithBoth;
		renderEdit( { showDocumentation: false } );

		expect( screen.queryByText( 'Documentation' ) ).not.toBeInTheDocument();
		expect( screen.getByText( 'Data Files' ) ).toBeInTheDocument();
	} );

	it( 'explains an empty file rather than silently hiding it', () => {
		mockLoaderState.data = {
			Database: { IncludeFiles: [], DataFiles: [] },
		};
		renderEdit( { hideWhenEmpty: true } );

		expect(
			screen.getByText(
				'Empty — this block will be hidden on the front end.'
			)
		).toBeInTheDocument();
	} );

	it( 'says so in the inspector when the file carries no documentation', () => {
		mockLoaderState.data = {
			Database: { IncludeFiles: [], DataFiles: [] },
		};
		renderEdit();

		expect(
			screen.getByTestId( 'help-Show Documentation' )
		).toHaveTextContent( 'This file contains no documentation.' );
	} );

	it( 'updates an attribute when a toggle changes', () => {
		mockLoaderState.data = dataWithBoth;
		const { setAttributes } = renderEdit();

		fireEvent.click( screen.getByLabelText( 'Show Data Files' ) );

		expect( setAttributes ).toHaveBeenCalledWith( {
			showDataFiles: false,
		} );
	} );

	it( 'surfaces a load error', () => {
		mockLoaderState.error = new Error( 'boom' );
		renderEdit();

		expect( screen.getByText( 'boom' ) ).toBeInTheDocument();
	} );
} );
