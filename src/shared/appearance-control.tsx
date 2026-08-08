/**
 * Shared Appearance control for all GLL blocks.
 *
 * One implementation so the five blocks cannot drift apart. The chosen value is
 * serialized as a class on the wrapper (see `appearanceClass`), which is the
 * only thing that crosses into the frontend.
 *
 * @package
 */

import { __ } from '@wordpress/i18n';
import { PanelBody, RadioControl } from '@wordpress/components';

export type GllAppearance = 'auto' | 'plain' | 'transparent';

export const APPEARANCE_VALUES: GllAppearance[] = [
	'auto',
	'plain',
	'transparent',
];

export const DEFAULT_APPEARANCE: GllAppearance = 'auto';

/**
 * Class name for an appearance value.
 *
 * Unknown values fall back to the default rather than emitting a class that
 * matches no rule, which would silently strip all styling.
 *
 * @param appearance Appearance attribute value.
 * @return Wrapper class name.
 */
export function appearanceClass( appearance?: string ): string {
	const value = APPEARANCE_VALUES.includes( appearance as GllAppearance )
		? ( appearance as GllAppearance )
		: DEFAULT_APPEARANCE;
	return `gll-block gll-appearance--${ value }`;
}

interface AppearanceControlProps {
	appearance?: string;
	onChange: ( value: GllAppearance ) => void;
	initialOpen?: boolean;
}

/**
 * Appearance panel for InspectorControls.
 *
 * @param root0
 * @param root0.appearance
 * @param root0.onChange
 * @param root0.initialOpen
 */
export default function AppearanceControl( {
	appearance = DEFAULT_APPEARANCE,
	onChange,
	initialOpen = false,
}: AppearanceControlProps ) {
	return (
		<PanelBody
			title={ __( 'Appearance', 'gll-info' ) }
			initialOpen={ initialOpen }
		>
			<RadioControl
				label={ __( 'Frame', 'gll-info' ) }
				help={ __(
					'Colors always follow the site theme. This controls the frame around the block.',
					'gll-info'
				) }
				selected={
					APPEARANCE_VALUES.includes( appearance as GllAppearance )
						? appearance
						: DEFAULT_APPEARANCE
				}
				options={ [
					{
						label: __( 'Card', 'gll-info' ),
						value: 'auto',
					},
					{
						label: __( 'Plain', 'gll-info' ),
						value: 'plain',
					},
					{
						label: __( 'None', 'gll-info' ),
						value: 'transparent',
					},
				] }
				onChange={ ( value ) => onChange( value as GllAppearance ) }
			/>
		</PanelBody>
	);
}
