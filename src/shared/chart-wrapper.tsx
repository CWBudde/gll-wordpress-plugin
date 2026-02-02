/**
 * Chart.js wrapper for Gutenberg blocks.
 *
 * @package GllInfo
 */

import { useEffect, useMemo, useRef } from '@wordpress/element';
import Chart from 'chart.js/auto';
import './chart.scss';

interface ChartWrapperProps {
	// Using 'any' for config to avoid deep Chart.js type mismatches
	config: any;
	className?: string;
	height?: number;
	onChartReady?: ( chart: Chart ) => void;
}

/**
 * Chart wrapper component.
 */
export default function ChartWrapper( {
	config,
	className = '',
	height = 320,
	onChartReady,
}: ChartWrapperProps ) {
	const canvasRef = useRef<HTMLCanvasElement>( null );
	const chartRef = useRef<Chart | null>( null );
	const containerRef = useRef<HTMLDivElement>( null );

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
