/**
 * Tests for the "refresh stored summary" inspector control.
 *
 * The clicks are wrapped in `act()` rather than left to `userEvent` alone: the
 * click handler is async, so the state update that follows the awaited rebuild
 * lands in a later microtask than the one `userEvent` flushes.
 *
 * @package
 */

import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import CacheRebuildControl from './cache-rebuild-control';

/**
 * Click the control and let its async handler settle.
 *
 * @param {Object} user userEvent session.
 */
async function press( user ) {
	await act( async () => {
		await user.click( screen.getByRole( 'button' ) );
	} );
}

describe( 'CacheRebuildControl', () => {
	it( 'rebuilds on click and confirms when it worked', async () => {
		const user = userEvent.setup();
		const rebuild = jest.fn().mockResolvedValue( true );

		render( <CacheRebuildControl rebuild={ rebuild } enabled={ true } /> );

		await press( user );

		expect( rebuild ).toHaveBeenCalledTimes( 1 );
		expect( screen.getByRole( 'status' ) ).toHaveTextContent(
			'Stored summary refreshed.'
		);
	} );

	it( 'says what a failure means for the reader, not just that it failed', async () => {
		const user = userEvent.setup();

		render(
			<CacheRebuildControl
				rebuild={ jest.fn().mockResolvedValue( false ) }
				enabled={ true }
			/>
		);

		await press( user );

		// The block still works when the write fails, and the message has to
		// say so — an author who reads "could not be stored" and nothing else
		// has no way to tell whether their page is broken.
		expect( screen.getByRole( 'alert' ) ).toHaveTextContent(
			/still works/
		);
	} );

	it( 'is disabled until there is a parse to rebuild from', () => {
		render(
			<CacheRebuildControl rebuild={ jest.fn() } enabled={ false } />
		);

		expect( screen.getByRole( 'button' ) ).toBeDisabled();
	} );

	it( 'cannot be pressed twice while a rebuild is in flight', async () => {
		const user = userEvent.setup();
		let release: ( value: boolean ) => void = () => {};
		const rebuild = jest.fn().mockReturnValue(
			new Promise< boolean >( ( resolve ) => {
				release = resolve;
			} )
		);

		render( <CacheRebuildControl rebuild={ rebuild } enabled={ true } /> );

		const button = screen.getByRole( 'button' );

		// Safe to await even though the rebuild promise is still pending: React
		// ignores an event handler's return value, so this resolves once the
		// handler's synchronous half — the switch to 'working' — has run.
		await act( async () => {
			await user.click( button );
		} );

		expect( button ).toBeDisabled();
		expect( button ).toHaveTextContent( 'Refreshing…' );

		await act( async () => {
			release( true );
		} );

		await waitFor( () => expect( rebuild ).toHaveBeenCalledTimes( 1 ) );
	} );

	// The two file kinds differ in a way the author has to know about: an
	// attachment's stored summary is discarded automatically as soon as the
	// file's bytes change, and a file on another server has nothing here that
	// could notice. Pressing this button is the only refresh it will ever get.
	describe( 'the hint', () => {
		it( 'describes automatic storage for a file in the media library', () => {
			render(
				<CacheRebuildControl rebuild={ jest.fn() } enabled={ true } />
			);

			expect(
				screen.getByText( /stored when the file is uploaded/ )
			).toBeInTheDocument();
		} );

		it( 'warns that nothing tracks a file hosted elsewhere', () => {
			render(
				<CacheRebuildControl
					rebuild={ jest.fn() }
					enabled={ true }
					isExternal
				/>
			);

			expect(
				screen.getByText( /nothing here can tell when it changes/ )
			).toBeInTheDocument();
		} );
	} );
} );
