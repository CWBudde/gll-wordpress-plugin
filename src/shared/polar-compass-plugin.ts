/**
 * Chart.js plugin for polar compass labels.
 *
 * Draws directional labels (Front/Back/Right/Left/Top/Bottom) around the
 * radar chart perimeter. Horizontal slice labels are blue, vertical are red,
 * and shared labels (Front/Back) are neutral.
 *
 * The blue and red are series encoding: they match the horizontal and vertical
 * datasets, so they stay fixed across themes. Only the neutral Front/Back pair
 * is chrome, and it follows the theme via the `textColor` option — which
 * `applyChartTheme` fills in, so callers normally set nothing.
 *
 * Ported from gll-tools web demo (visualization.js polarCompassPlugin).
 *
 * @package
 */

const polarCompassPlugin = {
	id: 'polarCompass',
	defaults: {
		textColor: '#334155',
	},
	afterDraw( chart, _args, options ) {
		const scale = chart.scales?.r;
		if ( ! scale ) {
			return;
		}
		const { xCenter, yCenter, drawingArea } = scale;
		const ctx = chart.ctx;
		const sideOffset = 40;
		const vertOffset = 28;

		ctx.save();
		ctx.font = 'bold 12px sans-serif';

		// Right = Front, Left = Back (shared by both slices, so neutral).
		ctx.fillStyle = options?.textColor || '#334155';
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		ctx.fillText( 'Front', xCenter + drawingArea + sideOffset, yCenter );
		ctx.textAlign = 'right';
		ctx.fillText( 'Back', xCenter - drawingArea - sideOffset, yCenter );

		// Top of chart: Right (horizontal, blue) / Top (vertical, red).
		ctx.textAlign = 'center';
		ctx.textBaseline = 'bottom';
		ctx.fillStyle = '#2563eb';
		ctx.fillText(
			'Right',
			xCenter - 18,
			yCenter - drawingArea - vertOffset
		);
		ctx.fillStyle = '#dc2626';
		ctx.fillText( 'Top', xCenter + 18, yCenter - drawingArea - vertOffset );

		// Bottom of chart: Left (horizontal, blue) / Bottom (vertical, red).
		ctx.textBaseline = 'top';
		ctx.fillStyle = '#2563eb';
		ctx.fillText(
			'Left',
			xCenter - 22,
			yCenter + drawingArea + vertOffset
		);
		ctx.fillStyle = '#dc2626';
		ctx.fillText(
			'Bottom',
			xCenter + 22,
			yCenter + drawingArea + vertOffset
		);

		ctx.restore();
	},
};

export default polarCompassPlugin;
