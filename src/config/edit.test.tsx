/**
 * Component tests for the configuration block's Edit component.
 *
 * Follows the mocking approach of src/resources/edit.test.tsx: the `../shared`
 * barrel is stubbed so three.js and chart.js never load, and the WordPress
 * editor components are reduced to the minimum needed to assert on labels and
 * interactions. `./config-model` is deliberately NOT mocked — the section
 * shapes it derives are the contract this component renders, and mocking it
 * would let the two drift apart unnoticed.
 *
 * The behaviour worth pinning here is the editor's deliberate divergence from
 * the front end: a switched-on section still renders when the file holds
 * nothing for it, because an author has no other way to tell "switched off"
 * from "not in this file".
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
	// output, and the rebuild control has its own test; stubbing both keeps this
	// suite about the block's own markup.
	useCachePublisher: () => jest.fn(),
	CacheRebuildControl: () => null,
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
		'data-block': 'gll-info/config',
	} ),
	InspectorControls: ( { children }: any ) => (
		<div data-testid="inspector-controls">{ children }</div>
	),
	MediaUploadCheck: ( { children }: any ) => <>{ children }</>,
	MediaUpload: ( { onSelect, allowedTypes, render: r }: any ) => (
		<div
			data-testid="media-upload"
			data-allowed-types={ ( allowedTypes || [] ).join( ',' ) }
		>
			{ r( {
				open: () =>
					onSelect( {
						id: 42,
						url: 'https://example.com/sample.gll',
						filename: 'sample.gll',
						title: 'Sample',
					} ),
			} ) }
		</div>
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
	Placeholder: ( { label, instructions, children }: any ) => (
		<div data-testid="placeholder">
			<h2>{ label }</h2>
			<p>{ instructions }</p>
			{ children }
		</div>
	),
} ) );

const defaultAttributes = {
	fileId: 1,
	fileUrl: 'https://example.com/sample.gll',
	fileName: 'sample.gll',
	showBoxTypes: true,
	showFrames: true,
	showFilterGroups: true,
	showLimits: true,
	showWarnings: true,
	showGeometrySummary: true,
	showFilterDetails: true,
	showPinPoints: false,
	initiallyCollapsed: false,
	rememberCollapsed: true,
	hideWhenEmpty: false,
	appearance: 'auto',
};

/**
 * A box geometry, owned by the first box type.
 *
 * The vertex/edge/face arrays only need a length — the model counts them and
 * never looks inside.
 */
const boxGeometry = {
	Vertices: [ {}, {}, {}, {} ],
	Edges: [ {}, {}, {} ],
	Faces: [ {}, {} ],
	IsSymmetric: true,
	SymmetryAxis: 0,
	OwnerKind: 'box',
	OwnerIndex: 0,
	OwnerKey: 'BOX1',
	OwnerLabel: 'G512-Pro',
	BoxIndex: 0,
	BoxKey: 'BOX1',
	BoxLabel: 'G512-Pro',
};

const frameGeometry = {
	Vertices: [ {}, {} ],
	Edges: [ {} ],
	Faces: [],
	IsSymmetric: false,
	SymmetryAxis: 0,
	OwnerKind: 'frame',
	OwnerIndex: 0,
	OwnerKey: 'FR1',
	OwnerLabel: 'Fly Frame',
	BoxIndex: -1,
	BoxKey: '',
	BoxLabel: '',
};

/**
 * The common shape across the reference corpus: box types and filter groups
 * present, no frames, no limits and no warnings at all.
 */
const dataPartlyEmpty = {
	GenSystem: { Label: 'G512-Pro' },
	Database: {
		BoxTypes: [
			{
				Label: 'G512-Pro',
				Key: 'BOX1',
				Weight: 38.5,
				Sources: [ 'LF', 'HF' ],
				SourcePlacements: [],
				HorizontalOpeningAngle: 90,
				VerticalOpeningAngle: 10,
			},
		],
		CaseGeometries: [ boxGeometry ],
		Frames: [],
		Limits: [],
		Warnings: [],
		FilterGroups: [
			{
				Label: 'Presets',
				Key: 'FG1',
				IsOverridable: true,
				Filters: [
					{
						Label: 'Flat',
						Key: 'F1',
						Bank: { Gain: 0, Delay: 0, Filters: [] },
					},
				],
			},
		],
	},
};

/** Every section populated, so no help text should appear anywhere. */
const dataComplete = {
	GenSystem: { Label: 'G512-Pro' },
	Database: {
		BoxTypes: dataPartlyEmpty.Database.BoxTypes,
		CaseGeometries: [ boxGeometry, frameGeometry ],
		Frames: [
			{
				Label: 'Fly Frame',
				Key: 'FR1',
				IsFlown: true,
				Weight: 12,
				PinPoints: [
					{ Label: 'Pin A', Vector: { x: 0, y: 0.1, z: 0.2 } },
				],
				CaseGeometryIndex: 1,
			},
		],
		Limits: [
			{
				Frame: 'Fly Frame',
				BoxType: 'G512-Pro',
				Type: 2,
				TypeLabel: 'Maximum Weight',
				Value: 500,
			},
		],
		Warnings: [
			{
				Frame: 'Fly Frame',
				Type: 2,
				TypeLabel: 'Weight Warning',
				Text: 'Check the rigging points.',
				Value: 400,
			},
		],
		FilterGroups: dataPartlyEmpty.Database.FilterGroups,
	},
};

const dataEmpty = {
	GenSystem: { Label: 'G512-Pro' },
	Database: {
		BoxTypes: [],
		CaseGeometries: [],
		Frames: [],
		Limits: [],
		Warnings: [],
		FilterGroups: [],
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

/**
 * Read the card keys currently rendered, in document order.
 *
 * @param {HTMLElement} container Render container.
 * @return {string[]} Card keys.
 */
function cardKeys( container: HTMLElement ): string[] {
	return Array.from( container.querySelectorAll( '.gll-config-card' ) ).map(
		( card ) => card.getAttribute( 'data-card' ) || ''
	);
}

beforeEach( () => {
	mockLoaderState.data = null;
	mockLoaderState.isLoading = false;
	mockLoaderState.error = null;
	mockLoaderState.load.mockClear();
	mockLoaderState.clear.mockClear();
} );

describe( 'Config Edit', () => {
	it( 'offers a GLL-only file picker when no file is selected', () => {
		const { container } = renderEdit( { fileUrl: '', fileName: '' } );

		expect( screen.getByTestId( 'placeholder' ) ).toBeInTheDocument();
		expect( screen.getByText( 'GLL Configuration' ) ).toBeInTheDocument();
		// The picker offers `application/octet-stream` too: a .gll uploaded
		// before the plugin registered its MIME type is stored as that, and the
		// narrower list used to hide such a file from this block entirely.
		expect( screen.getByTestId( 'placeholder' ) ).toHaveAttribute(
			'data-allowed-types',
			'application/x-gll,application/octet-stream'
		);
		expect( container.querySelector( '.gll-config-card' ) ).toBeNull();
	} );

	it( 'renders one card per section, in the model order', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit();

		expect( cardKeys( container ) ).toEqual( [
			'box-types',
			'frames',
			'filter-groups',
			'limits',
			'warnings',
		] );

		expect( screen.getByText( 'Box Types' ) ).toHaveClass(
			'gll-config-summary-title'
		);
		expect(
			container.querySelector( '.gll-config-summary' )
		).toBeInTheDocument();
	} );

	it( 'counts the entries of each card in its summary badge', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit();

		const counts = Array.from(
			container.querySelectorAll( '.gll-config-count' )
		).map( ( badge ) => badge.textContent );

		expect( counts ).toEqual( [ '1', '1', '1', '1', '1' ] );
	} );

	it( 'fills a card body with one entry per record', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit();

		const boxCard = container.querySelector(
			'[data-card="box-types"] .gll-config-body'
		);
		expect( boxCard?.querySelectorAll( '.gll-config-entry' ) ).toHaveLength(
			1
		);

		expect(
			boxCard?.querySelector( '.gll-config-entry-title' )
		).toHaveTextContent( 'G512-Pro' );
		expect( screen.getByText( /Weight: 38\.50 kg/ ) ).toBeInTheDocument();
		// Geometry summary is on, so the counts come from the owning geometry.
		expect(
			screen.getByText( /4 vertices • 3 edges • 2 faces/ )
		).toBeInTheDocument();
	} );

	it( 'still shows a switched-on but empty section, unlike the front end', () => {
		// Most reference files carry no frames at all. The front end drops the
		// section; the editor must keep it so an author can tell "switched off"
		// from "not in this file".
		mockLoaderState.data = dataPartlyEmpty;
		const { container } = renderEdit();

		const framesCard = container.querySelector( '[data-card="frames"]' );
		expect( framesCard ).toBeInTheDocument();
		expect( framesCard?.querySelector( '.gll-config-body' ) ).toBeNull();
		expect( screen.getByText( 'No frames defined.' ) ).toBeInTheDocument();
		expect(
			screen.getByText( 'No rigging limits defined.' )
		).toBeInTheDocument();
		expect(
			screen.getByText( 'No rigging warnings defined.' )
		).toBeInTheDocument();
	} );

	it( 'drops a section entirely when its toggle is off', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit( {
			showFrames: false,
			showWarnings: false,
		} );

		expect( cardKeys( container ) ).toEqual( [
			'box-types',
			'filter-groups',
			'limits',
		] );
		expect( screen.queryByText( 'Frames' ) ).not.toBeInTheDocument();
		expect(
			screen.queryByText( 'No frames defined.' )
		).not.toBeInTheDocument();
	} );

	it( 'explains in the inspector that the file holds no frames', () => {
		mockLoaderState.data = dataPartlyEmpty;
		renderEdit();

		expect( screen.getByTestId( 'help-Show Frames' ) ).toHaveTextContent(
			'This file contains no frames.'
		);
		expect(
			screen.getByTestId( 'help-Show Rigging Warnings' )
		).toHaveTextContent( 'This file contains no rigging warnings.' );
	} );

	it( 'drops that help text once the section has entries', () => {
		mockLoaderState.data = dataComplete;
		renderEdit();

		expect(
			screen.queryByTestId( 'help-Show Frames' )
		).not.toBeInTheDocument();
		expect(
			screen.queryByTestId( 'help-Show Box Types' )
		).not.toBeInTheDocument();
		expect(
			screen.queryByTestId( 'help-Show Rigging Limits' )
		).not.toBeInTheDocument();
	} );

	it( 'opens every card unless the author asks for collapsed', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit();

		const cards = Array.from(
			container.querySelectorAll< HTMLDetailsElement >(
				'.gll-config-card'
			)
		);
		expect( cards ).toHaveLength( 5 );
		expect( cards.every( ( card ) => card.open ) ).toBe( true );
	} );

	it( 'collapses every card when initiallyCollapsed is set', () => {
		mockLoaderState.data = dataComplete;
		const { container } = renderEdit( { initiallyCollapsed: true } );

		const cards = Array.from(
			container.querySelectorAll< HTMLDetailsElement >(
				'.gll-config-card'
			)
		);
		expect( cards ).toHaveLength( 5 );
		expect( cards.some( ( card ) => card.open ) ).toBe( false );
	} );

	it( 'warns about an empty block rather than actually hiding it', () => {
		mockLoaderState.data = dataEmpty;
		const { container } = renderEdit( { hideWhenEmpty: true } );

		expect(
			container.querySelector( '.gll-config-hidden-notice' )
		).toHaveTextContent(
			'Empty — this block will be hidden on the front end.'
		);
		// The block itself stays selectable, cards and all.
		expect( cardKeys( container ) ).toHaveLength( 5 );
	} );

	it( 'stays quiet about emptiness when hideWhenEmpty is off', () => {
		mockLoaderState.data = dataEmpty;
		const { container } = renderEdit();

		expect(
			container.querySelector( '.gll-config-hidden-notice' )
		).toBeNull();
	} );

	it( 'places the appearance control last in the inspector', () => {
		mockLoaderState.data = dataComplete;
		renderEdit();

		const inspector = screen.getByTestId( 'inspector-controls' );
		expect( inspector.lastElementChild ).toBe(
			screen.getByTestId( 'appearance-control' )
		);
	} );

	it( 'updates an attribute when a toggle changes', () => {
		mockLoaderState.data = dataComplete;
		const { setAttributes } = renderEdit();

		fireEvent.click( screen.getByLabelText( 'Show Pin Points' ) );

		expect( setAttributes ).toHaveBeenCalledWith( { showPinPoints: true } );
	} );

	it( 'shows a spinner while the file is parsing', () => {
		mockLoaderState.isLoading = true;
		const { container } = renderEdit();

		expect( screen.getByTestId( 'spinner' ) ).toBeInTheDocument();
		expect( container.querySelector( '.gll-config-card' ) ).toBeNull();
	} );

	it( 'surfaces a load error', () => {
		mockLoaderState.error = new Error( 'boom' );
		const { container } = renderEdit();

		expect( container.querySelector( '.gll-error' ) ).toHaveTextContent(
			'boom'
		);
	} );

	it( 'records the file triple when one is selected', () => {
		const { setAttributes } = renderEdit( { fileUrl: '', fileName: '' } );

		fireEvent.click( screen.getByTestId( 'trigger-media-select' ) );

		expect( setAttributes ).toHaveBeenCalledWith( {
			fileId: 42,
			fileUrl: 'https://example.com/sample.gll',
			fileName: 'sample.gll',
		} );
	} );

	it( 'clears the file triple and the parsed data on removal', () => {
		mockLoaderState.data = dataComplete;
		const { setAttributes } = renderEdit();

		fireEvent.click( screen.getByTestId( 'trigger-remove' ) );

		expect( setAttributes ).toHaveBeenCalledWith( {
			fileId: 0,
			fileUrl: '',
			fileName: '',
		} );
		expect( mockLoaderState.clear ).toHaveBeenCalled();
	} );
} );
