/**
 * 3D balloon rendering helpers, split out of view.ts so they can run under
 * jsdom.
 *
 * `view.ts` imports the WASM loader and Three.js at module scope and registers
 * a DOMContentLoaded handler on import. Same split as `resource-render.ts`,
 * `config-render.ts`, `response-render.ts` and `polar-render.ts`.
 *
 * The cut here is the smallest of the three: only the quality lookup, the
 * option reader and the string builders moved. `initThreeScene` and
 * `buildBalloonMesh` stay in view.ts — the latter is a thin wrapper over
 * `buildBalloonGeometryData`, which `balloon-utils.test.ts` already covers
 * exhaustively, and wrapping a THREE.BufferGeometry in a mock to test the
 * wrapper would be negative value.
 *
 * @package
 */

import { __, sprintf } from '@wordpress/i18n';

import { escapeHtml } from '../shared/escape-html';
import { prefersReducedMotion } from '../shared/a11y';

export type QualityPreset = 'low' | 'medium' | 'high';

export interface QualitySettings {
	subsampleStride: number;
	maxPixelRatio: number;
	antialias: boolean;
	directionalLightIntensity: number;
	fillLight: boolean;
}

export interface BlockOptions {
	fileName: string;
	sourceIndex: number;
	frequencyIndex: number;
	dbRange: number;
	scale: number;
	wireframe: boolean;
	autoRotate: boolean;
	showReferenceSphere: boolean;
	showAxesHelper: boolean;
	canvasHeight: number;
	qualityPreset: QualityPreset;
}

/**
 * Resolve a quality preset string to its render parameters.
 *
 * @param {string} preset Stored preset name.
 * @return {QualitySettings} Render parameters.
 */
export function resolveQuality( preset: QualityPreset ): QualitySettings {
	switch ( preset ) {
		case 'low':
			return {
				subsampleStride: 2,
				maxPixelRatio: 1,
				antialias: false,
				directionalLightIntensity: 0,
				fillLight: false,
			};
		case 'high':
			return {
				subsampleStride: 1,
				maxPixelRatio: 2,
				antialias: true,
				directionalLightIntensity: 0.85,
				fillLight: true,
			};
		case 'medium':
		default:
			return {
				subsampleStride: 1,
				maxPixelRatio: 2,
				antialias: true,
				directionalLightIntensity: 0.85,
				fillLight: false,
			};
	}
}

/**
 * Read a block's options out of its `data-` attributes.
 *
 * The defaults are what a post serialized before an attribute existed renders
 * with, since `save()` output is frozen in post content.
 *
 * Note the one place a stored value is deliberately overridden: auto-rotation
 * is unstoppable motion — the block offers no pause control — so a visitor's
 * reduced-motion preference beats the author's choice outright.
 *
 * @param {DOMStringMap} dataset The block element's dataset.
 * @return {BlockOptions} Resolved options.
 */
export function readBlockOptions( dataset: DOMStringMap ): BlockOptions {
	const presetRaw = dataset.qualityPreset;
	const qualityPreset: QualityPreset =
		presetRaw === 'low' || presetRaw === 'high' ? presetRaw : 'medium';

	return {
		fileName: dataset.fileName || __( 'GLL File', 'gll-info' ),
		sourceIndex: parseInt( dataset.sourceIndex || '0', 10 ),
		frequencyIndex: parseInt( dataset.frequencyIndex || '0', 10 ),
		dbRange: parseInt( dataset.dbRange || '40', 10 ),
		scale: parseFloat( dataset.scale || '1.0' ),
		wireframe: dataset.wireframe === 'true',
		autoRotate: dataset.autoRotate === 'true' && ! prefersReducedMotion(),
		showReferenceSphere: dataset.showReferenceSphere !== 'false',
		showAxesHelper: dataset.showAxesHelper !== 'false',
		canvasHeight: parseInt( dataset.canvasHeight || '500', 10 ),
		qualityPreset,
	};
}

/**
 * Build the badge row shown above the balloon.
 *
 * @param {Object} params             Parameters object.
 * @param {string} params.freqLabel   Formatted frequency.
 * @param {number} params.displayMin  Lowest displayed level in dB.
 * @param {number} params.displayMax  Highest displayed level in dB.
 * @param {Object} params.balloonGrid Grid info.
 * @param {Object} params.source      Source definition.
 * @param {Object} params.options     Block options.
 * @return {string} HTML string for the metadata row.
 */
export function buildMetadataHtml( {
	freqLabel,
	displayMin,
	displayMax,
	balloonGrid,
	source,
	options,
}: {
	freqLabel: string;
	displayMin: number;
	displayMax: number;
	balloonGrid: any;
	source: any;
	options: BlockOptions;
} ): string {
	const badges = [];
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Frequency:',
			'gll-info'
		) }</strong> ${ freqLabel }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Display Range:',
			'gll-info'
		) }</strong> ${ displayMin.toFixed( 1 ) } &ndash; ${ displayMax.toFixed(
			1
		) } dB</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Grid:',
			'gll-info'
		) }</strong> ${ balloonGrid.fullMeridianCount } &times; ${
			balloonGrid.fullParallelCount
		}</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Resolution:',
			'gll-info'
		) }</strong> ${ balloonGrid.meridianStep }° × ${
			balloonGrid.parallelStep
		}°</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Symmetry:',
			'gll-info'
		) }</strong> ${ balloonGrid.symmetryName }</span>`
	);
	badges.push(
		`<span class="gll-meta-badge"><strong>${ __(
			'Quality:',
			'gll-info'
		) }</strong> ${ escapeHtml( options.qualityPreset ) }</span>`
	);
	if ( options.wireframe ) {
		badges.push(
			`<span class="gll-meta-badge gll-meta-badge-highlight">${ __(
				'Wireframe',
				'gll-info'
			) }</span>`
		);
	}
	if ( options.autoRotate ) {
		badges.push(
			`<span class="gll-meta-badge gll-meta-badge-highlight">${ __(
				'Auto-Rotate',
				'gll-info'
			) }</span>`
		);
	}
	const sourceLabel = source.Definition?.Label || source.Label || '';
	if ( sourceLabel ) {
		badges.push(
			`<span class="gll-meta-badge"><strong>${ __(
				'Source:',
				'gll-info'
			) }</strong> ${ escapeHtml( sourceLabel ) }</span>`
		);
	}

	return `<div class="gll-balloon-3d-metadata">${ badges.join( '' ) }</div>`;
}

/**
 * Build the SPL colour-bar legend.
 *
 * @param {number} displayMin Lowest displayed level in dB.
 * @param {number} displayMax Highest displayed level in dB.
 * @return {string} HTML string for the colour bar.
 */
export function buildColorbarHtml(
	displayMin: number,
	displayMax: number
): string {
	const midLevel = ( displayMin + displayMax ) / 2;

	/**
	 * Format one colour-bar tick.
	 *
	 * @param {number} level Sound pressure level.
	 * @return {string} Localized "NN dB".
	 */
	const decibelTick = ( level: number ) =>
		sprintf(
			// translators: %s: sound pressure level, already rounded.
			__( '%s dB', 'gll-info' ),
			level.toFixed( 0 )
		);

	return `
		<div class="gll-balloon-3d-colorbar">
			<div class="gll-colorbar-gradient"></div>
			<div class="gll-colorbar-labels">
				<span>${ decibelTick( displayMin ) }</span>
				<span>${ decibelTick( midLevel ) }</span>
				<span>${ decibelTick( displayMax ) }</span>
			</div>
		</div>
	`;
}

/**
 * Describe the balloon for the renderer canvas's text alternative.
 *
 * The canvas is opaque to assistive technology, so this states what is plotted
 * — the frequency, the level range and the grid — rather than the word "chart".
 * The second sentence is the only place the keyboard bindings are stated; they
 * are invisible chrome otherwise.
 *
 * @param {Object} params             Parameters object.
 * @param {string} params.freqLabel   Formatted frequency.
 * @param {number} params.displayMin  Lowest displayed level in dB.
 * @param {number} params.displayMax  Highest displayed level in dB.
 * @param {Object} params.balloonGrid Grid info.
 * @return {string} Label text.
 */
export function buildCanvasLabel( {
	freqLabel,
	displayMin,
	displayMax,
	balloonGrid,
}: {
	freqLabel: string;
	displayMin: number;
	displayMax: number;
	balloonGrid: any;
} ): string {
	return `${ sprintf(
		/* translators: 1: frequency, e.g. "1 kHz". 2: lowest displayed level in dB. 3: highest displayed level in dB. 4: number of meridians. 5: number of parallels. 6: symmetry name. */
		__(
			'3D directivity balloon at %1$s, levels from %2$s to %3$s dB on a %4$d by %5$d measurement grid, %6$s symmetry.',
			'gll-info'
		),
		freqLabel,
		displayMin.toFixed( 1 ),
		displayMax.toFixed( 1 ),
		balloonGrid.fullMeridianCount,
		balloonGrid.fullParallelCount,
		balloonGrid.symmetryName
	) } ${ __(
		'Use the arrow keys to rotate and the plus and minus keys to zoom.',
		'gll-info'
	) }`;
}
