/**
 * The one control seven blocks now share.
 *
 * The load-bearing assertion in this file is that typing in the address field
 * changes nothing. A commit starts a download that can run to tens of megabytes,
 * so the field commits on Apply, on Enter and on blur — never per keystroke, and
 * with no debounce, because no interval is both quick enough to feel alive and
 * long enough that a half-typed address is never requested.
 *
 * @package
 */

import { render, screen, fireEvent, within } from '@testing-library/react';

import FileSourceControl, { fromMedia, fromUrl } from './file-source-control';

jest.mock( '@wordpress/block-editor', () => ( {
	__esModule: true,
	MediaUploadCheck: ( { children }: any ) => <>{ children }</>,
	MediaPlaceholder: ( {
		labels,
		allowedTypes,
		onSelect,
		onSelectURL,
	}: any ) => (
		<div
			data-testid="media-placeholder"
			data-allowed-types={ ( allowedTypes || [] ).join( ',' ) }
		>
			<span>{ labels?.title }</span>
			<button
				type="button"
				data-testid="trigger-media-select"
				onClick={ () =>
					onSelect( {
						id: 42,
						url: 'https://example.org/sample.gll',
						filename: 'sample.gll',
					} )
				}
			>
				pick
			</button>
			<button
				type="button"
				data-testid="trigger-select-url"
				onClick={ () =>
					onSelectURL( 'https://cdn.example/remote.gll' )
				}
			>
				url
			</button>
			<button
				type="button"
				data-testid="trigger-select-bad-url"
				onClick={ () => onSelectURL( 'javascript:alert(1)' ) }
			>
				bad url
			</button>
		</div>
	),
	MediaUpload: ( { render: renderProp }: any ) =>
		renderProp( { open: jest.fn() } ),
} ) );

const MEDIA = {
	fileId: 7,
	fileUrl: 'https://example.org/a.gll',
	fileName: 'a.gll',
};
const EXTERNAL = {
	fileId: 0,
	fileUrl: 'https://cdn.example/remote.gll',
	fileName: 'remote.gll',
};
const EMPTY = { fileId: 0, fileUrl: '', fileName: '' };

/**
 * Render the inspector variant with spies attached.
 *
 * @param {Object} value Current file source.
 * @param {Object} extra Extra props.
 * @return {Object} Render result plus the two spies.
 */
function renderInspector( value = MEDIA, extra = {} ) {
	const onChange = jest.fn();
	const onRemove = jest.fn();
	const result = render(
		<FileSourceControl
			variant="inspector"
			value={ value }
			onChange={ onChange }
			onRemove={ onRemove }
			{ ...extra }
		/>
	);

	return { ...result, onChange, onRemove };
}

describe( 'fromMedia', () => {
	it( 'reads the file name, and falls back to the title', () => {
		expect(
			fromMedia( { id: 1, url: 'u', filename: 'a.gll' } ).fileName
		).toBe( 'a.gll' );
		expect( fromMedia( { id: 1, url: 'u', title: 'A' } ).fileName ).toBe(
			'A'
		);
	} );

	it( 'never produces undefined for a string attribute', () => {
		// Six of the seven blocks used to write `undefined` here, which
		// serialises as an empty header on the published page.
		expect( fromMedia( { id: 1, url: 'u' } ).fileName ).toBe( '' );
		expect( fromMedia( undefined ) ).toEqual( EMPTY );
	} );
} );

describe( 'fromUrl', () => {
	it( 'marks the file as external and names it from the address', () => {
		expect( fromUrl( ' https://cdn.example/a/speaker.gll ' ) ).toEqual( {
			fileId: 0,
			fileUrl: 'https://cdn.example/a/speaker.gll',
			fileName: 'speaker.gll',
		} );
	} );
} );

describe( 'FileSourceControl (placeholder)', () => {
	it( 'offers both GLL MIME types', () => {
		render(
			<FileSourceControl
				variant="placeholder"
				label="GLL File Viewer"
				value={ EMPTY }
				onChange={ jest.fn() }
				onRemove={ jest.fn() }
			/>
		);

		expect( screen.getByTestId( 'media-placeholder' ) ).toHaveAttribute(
			'data-allowed-types',
			'application/x-gll,application/octet-stream'
		);
	} );

	it( 'emits the whole triple for a media selection and for an address', () => {
		const onChange = jest.fn();
		render(
			<FileSourceControl
				variant="placeholder"
				value={ EMPTY }
				onChange={ onChange }
				onRemove={ jest.fn() }
			/>
		);

		fireEvent.click( screen.getByTestId( 'trigger-media-select' ) );
		expect( onChange ).toHaveBeenCalledWith( {
			fileId: 42,
			fileUrl: 'https://example.org/sample.gll',
			fileName: 'sample.gll',
		} );

		fireEvent.click( screen.getByTestId( 'trigger-select-url' ) );
		expect( onChange ).toHaveBeenLastCalledWith( EXTERNAL );
	} );

	// The placeholder and the inspector have to agree about what an acceptable
	// address is. They did not: core's "Insert from URL" popover handed its text
	// straight through, so the empty-block picker would store an address the
	// dedicated control refuses — and the author would find out after publishing.
	it( 'holds an address the inspector would refuse, and says why', () => {
		const onChange = jest.fn();
		const { container } = render(
			<FileSourceControl
				variant="placeholder"
				value={ EMPTY }
				onChange={ onChange }
				onRemove={ jest.fn() }
			/>
		);

		// jsdom serves this suite over http:, so an http address is acceptable
		// here; a scheme that can never work is the portable case.
		fireEvent.click( screen.getByTestId( 'trigger-select-url' ) );
		expect( onChange ).toHaveBeenCalledTimes( 1 );

		onChange.mockClear();
		fireEvent.click( screen.getByTestId( 'trigger-select-bad-url' ) );

		expect( onChange ).not.toHaveBeenCalled();
		expect(
			within( container ).getByText( /Only web addresses/ )
		).toBeInTheDocument();
	} );

	it( 'has no Remove button — there is nothing to remove yet', () => {
		render(
			<FileSourceControl
				variant="placeholder"
				value={ EMPTY }
				onChange={ jest.fn() }
				onRemove={ jest.fn() }
			/>
		);

		expect( screen.queryByText( 'Remove' ) ).not.toBeInTheDocument();
	} );
} );

describe( 'FileSourceControl (inspector) — the address field', () => {
	it( 'does NOT commit while the author is typing', () => {
		const { onChange } = renderInspector( EMPTY );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.change( field, {
			target: { value: 'https://cdn.example/a.gll' },
		} );

		expect( onChange ).not.toHaveBeenCalled();
	} );

	it( 'commits on Enter', () => {
		const { onChange } = renderInspector( EMPTY );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.change( field, {
			target: { value: 'https://cdn.example/a.gll' },
		} );
		fireEvent.keyDown( field, { key: 'Enter' } );

		expect( onChange ).toHaveBeenCalledTimes( 1 );
		expect( onChange ).toHaveBeenCalledWith( {
			fileId: 0,
			fileUrl: 'https://cdn.example/a.gll',
			fileName: 'a.gll',
		} );
	} );

	it( 'commits on blur after a change, and not otherwise', () => {
		const { onChange } = renderInspector( EXTERNAL );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.blur( field );
		expect( onChange ).not.toHaveBeenCalled();

		fireEvent.change( field, {
			target: { value: 'https://cdn.example/other.gll' },
		} );
		fireEvent.blur( field );
		expect( onChange ).toHaveBeenCalledTimes( 1 );
	} );

	it( 'refuses to commit an address that cannot work', () => {
		const { onChange } = renderInspector( EMPTY );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.change( field, { target: { value: 'javascript:alert(1)' } } );
		fireEvent.keyDown( field, { key: 'Enter' } );

		expect( onChange ).not.toHaveBeenCalled();
	} );

	it( 'commits an address with no .gll ending, and says why it is unsure', () => {
		const { onChange } = renderInspector( EMPTY );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.change( field, {
			target: { value: 'https://cdn.example/download?id=7' },
		} );
		fireEvent.keyDown( field, { key: 'Enter' } );

		expect( onChange ).toHaveBeenCalledTimes( 1 );
		expect(
			screen.getByText( /does not end in \.gll/ )
		).toBeInTheDocument();
	} );

	it( 'treats an emptied address as a removal', () => {
		const { onChange, onRemove } = renderInspector( EXTERNAL );

		const field = screen.getByLabelText( 'Address of a GLL file' );
		fireEvent.change( field, { target: { value: '' } } );
		fireEvent.keyDown( field, { key: 'Enter' } );

		expect( onRemove ).toHaveBeenCalled();
		expect( onChange ).not.toHaveBeenCalled();
	} );
} );

describe( 'FileSourceControl (inspector) — the rest of the panel', () => {
	it( 'removes the file', () => {
		const { onRemove } = renderInspector();

		fireEvent.click( screen.getByText( 'Remove' ) );

		expect( onRemove ).toHaveBeenCalled();
	} );

	it( 'renders whatever the block passes as children', () => {
		renderInspector( MEDIA, {
			children: <p>rebuild control</p>,
		} );

		expect( screen.getByText( 'rebuild control' ) ).toBeInTheDocument();
	} );

	it( 'says nothing about the proxy when the file loaded directly', () => {
		renderInspector( EXTERNAL, { status: { via: 'direct' } } );

		expect(
			screen.queryByText( /Preview loaded through your site/ )
		).not.toBeInTheDocument();
	} );

	// Queries below are scoped to the render container: `Notice` also speaks its
	// text into the shared `a11y-speak` live region, which lives on `document.body`
	// and would otherwise match everything twice.
	it( 'warns when only the server could fetch the file', () => {
		const { container } = renderInspector( EXTERNAL, {
			status: { via: 'proxy' },
		} );
		const panel = within( container );

		expect(
			panel.getByText( /Preview loaded through your site/ )
		).toBeInTheDocument();
		expect(
			panel.getByText( /could not fetch this file from cdn\.example/ )
		).toBeInTheDocument();
		// The five blocks that render measurement data have no cache to fall
		// back on, so their visitors genuinely see an error.
		expect(
			panel.getByText( /will show an error on the published page/ )
		).toBeInTheDocument();
	} );

	it( 'tells a cache-backed block that its visitors will still be served', () => {
		const { container } = renderInspector( EXTERNAL, {
			status: { via: 'proxy' },
			servedFromCache: true,
		} );

		expect(
			within( container ).getByText( /will still work/ )
		).toBeInTheDocument();
	} );
} );
