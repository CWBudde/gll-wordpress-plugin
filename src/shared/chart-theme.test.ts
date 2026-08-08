/**
 * Tests for Chart.js theming.
 *
 * @package
 */

import { applyChartTheme } from './chart-theme';
import type { GllTheme } from './resolve-theme';

const DARK: GllTheme = {
	text: '#ababab',
	textMuted: '#757575',
	border: '#444',
	accent: '#fefefe',
	surface: '#111',
	isDark: true,
};

describe( 'applyChartTheme', () => {
	it( 'fills in text, tick and grid colors', () => {
		const config = applyChartTheme(
			{ options: { scales: { x: {}, y: {} } } },
			DARK
		);

		expect( config.options.color ).toBe( '#ababab' );
		expect( config.options.scales.x.ticks.color ).toBe( '#757575' );
		expect( config.options.scales.y.title.color ).toBe( '#ababab' );
		expect( config.options.scales.x.grid.color ).toBe(
			'rgba(68, 68, 68, 0.25)'
		);
		expect( config.options.plugins.legend.labels.color ).toBe( '#ababab' );
	} );

	it( 'leaves dataset colors untouched', () => {
		const config = applyChartTheme(
			{
				data: {
					datasets: [
						{
							borderColor: '#2563eb',
							backgroundColor: 'rgba(37, 99, 235, 0.1)',
						},
					],
				},
			},
			DARK
		);

		expect( config.data.datasets[ 0 ].borderColor ).toBe( '#2563eb' );
		expect( config.data.datasets[ 0 ].backgroundColor ).toBe(
			'rgba(37, 99, 235, 0.1)'
		);
	} );

	it( 'does not override colors the caller set explicitly', () => {
		const config = applyChartTheme(
			{
				options: {
					color: '#ff0000',
					scales: { x: { ticks: { color: '#00ff00' } } },
				},
			},
			DARK
		);

		expect( config.options.color ).toBe( '#ff0000' );
		expect( config.options.scales.x.ticks.color ).toBe( '#00ff00' );
	} );

	it( 'preserves grid.drawOnChartArea while adding a color', () => {
		const config = applyChartTheme(
			{
				options: {
					scales: { y1: { grid: { drawOnChartArea: false } } },
				},
			},
			DARK
		);

		expect( config.options.scales.y1.grid.drawOnChartArea ).toBe( false );
		expect( config.options.scales.y1.grid.color ).toBe(
			'rgba(68, 68, 68, 0.25)'
		);
	} );

	it( 'themes radial scale angle lines and point labels when present', () => {
		const config = applyChartTheme(
			{ options: { scales: { r: { angleLines: {}, pointLabels: {} } } } },
			DARK
		);

		expect( config.options.scales.r.angleLines.color ).toBe(
			'rgba(68, 68, 68, 0.25)'
		);
		expect( config.options.scales.r.pointLabels.color ).toBe( '#757575' );
	} );

	it( 'themes the polar compass neutral labels', () => {
		const config = applyChartTheme( { type: 'radar' }, DARK );

		expect( config.options.plugins.polarCompass.textColor ).toBe(
			'#757575'
		);
	} );

	it( 'builds the options tree when the config is bare', () => {
		const config = applyChartTheme( { type: 'line' }, DARK );

		expect( config.options.plugins.legend.labels.color ).toBe( '#ababab' );
	} );

	it( 'tolerates a null config', () => {
		expect( applyChartTheme( null, DARK ) ).toBeNull();
	} );
} );
