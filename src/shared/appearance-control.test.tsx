/**
 * Tests for the shared Appearance control.
 *
 * @package
 */

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AppearanceControl, {
	appearanceClass,
	APPEARANCE_VALUES,
	DEFAULT_APPEARANCE,
} from './appearance-control';

/**
 * Render the control and let its mount effects settle.
 *
 * ToggleGroupControl measures itself and sets state after mount, so a bare
 * render() leaves a pending update and @wordpress/jest-console fails the test
 * on the resulting act() warning.
 *
 * @param props Props for AppearanceControl.
 */
async function renderControl(
	props: Partial< React.ComponentProps< typeof AppearanceControl > > = {}
) {
	await act( async () => {
		render(
			<AppearanceControl onChange={ () => {} } initialOpen { ...props } />
		);
	} );
	await flush();
}

/**
 * Let any state update queued by the radio store land inside act().
 *
 * A microtask is not enough: the store schedules through a timer, so this has
 * to yield a full macrotask.
 */
async function flush() {
	await act( async () => {
		await new Promise( ( resolve ) => setTimeout( resolve, 0 ) );
	} );
}

describe( 'appearanceClass', () => {
	it( 'always includes the base class', () => {
		APPEARANCE_VALUES.forEach( ( value ) => {
			expect( appearanceClass( value ) ).toContain( 'gll-block' );
		} );
	} );

	it( 'maps each value to its variant class', () => {
		expect( appearanceClass( 'auto' ) ).toBe(
			'gll-block gll-appearance--auto'
		);
		expect( appearanceClass( 'plain' ) ).toBe(
			'gll-block gll-appearance--plain'
		);
		expect( appearanceClass( 'transparent' ) ).toBe(
			'gll-block gll-appearance--transparent'
		);
	} );

	it( 'falls back to the default for unknown or missing values', () => {
		// An unmatched variant class would silently strip all styling, so this
		// has to degrade to the default rather than pass the value through.
		const expected = `gll-block gll-appearance--${ DEFAULT_APPEARANCE }`;
		expect( appearanceClass( undefined ) ).toBe( expected );
		expect( appearanceClass( '' ) ).toBe( expected );
		expect( appearanceClass( 'nonsense' ) ).toBe( expected );
	} );
} );

describe( 'AppearanceControl', () => {
	it( 'renders all three options', async () => {
		await renderControl();

		expect( screen.getByRole( 'radio', { name: 'Card' } ) ).toBeVisible();
		expect( screen.getByRole( 'radio', { name: 'Plain' } ) ).toBeVisible();
		expect( screen.getByRole( 'radio', { name: 'None' } ) ).toBeVisible();
	} );

	it( 'marks the current value as selected', async () => {
		await renderControl( { appearance: 'transparent' } );

		expect( screen.getByRole( 'radio', { name: 'None' } ) ).toBeChecked();
	} );

	it( 'reports the chosen value', async () => {
		const user = userEvent.setup();
		const onChange = jest.fn();

		await renderControl( { appearance: 'auto', onChange } );
		await act( async () => {
			await user.click( screen.getByRole( 'radio', { name: 'None' } ) );
		} );
		await flush();

		expect( onChange ).toHaveBeenCalledWith( 'transparent' );
	} );

	it( 'shows the default as selected for an unknown stored value', async () => {
		await renderControl( { appearance: 'nonsense' } );

		expect( screen.getByRole( 'radio', { name: 'Card' } ) ).toBeChecked();
	} );
} );
