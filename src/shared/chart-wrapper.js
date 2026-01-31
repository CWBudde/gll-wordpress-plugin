/**
 * Chart.js wrapper for Gutenberg blocks.
 *
 * @package GllInfo
 */

import { useEffect, useMemo, useRef } from '@wordpress/element';
import Chart from 'chart.js/auto';
import './chart.scss';

/**
 * Chart wrapper component.
 *
 * @param {Object}   props                Component props.
 * @param {Object}   props.config         Chart.js configuration object.
 * @param {string}   props.className      Optional class name for container.
 * @param {number}   props.height         Minimum chart height in pixels.
 * @param {Function} props.onChartReady   Optional callback when chart instance is ready.
 * @return {JSX.Element} Chart wrapper.
 */
export default function ChartWrapper( {
	config,
	className = '',
	height = 320,
	onChartReady,
} ) {
	const canvasRef = useRef( null );
	const chartRef = useRef( null );
	const containerRef = useRef( null );

	const mergedConfig = useMemo(
		() => ( {
			...config,
			options: {
				responsive: true,
				maintainAspectRatio: false,
				...( config?.options || {} ),
			},
		} ),
		[ config ]
	);

	useEffect( () => {
		if ( ! canvasRef.current ) {
			return;
		}

		if ( chartRef.current ) {
			chartRef.current.destroy();
		}

		chartRef.current = new Chart( canvasRef.current, mergedConfig );

		if ( onChartReady ) {
			onChartReady( chartRef.current );
		}

		return () => {
			if ( chartRef.current ) {
				chartRef.current.destroy();
				chartRef.current = null;
			}
		};
	}, [ mergedConfig, onChartReady ] );

	useEffect( () => {
		if ( ! containerRef.current || typeof ResizeObserver === 'undefined' ) {
			return undefined;
		}

		const observer = new ResizeObserver( () => {
			if ( chartRef.current ) {
				chartRef.current.resize();
			}
		} );

		observer.observe( containerRef.current );

		return () => observer.disconnect();
	}, [] );

	return (
		<div
			ref={ containerRef }
			className={ `gll-chart-wrapper ${ className }` }
			style={ { minHeight: height } }
		>
			<canvas ref={ canvasRef } className="gll-chart-canvas" />
		</div>
	);
}
