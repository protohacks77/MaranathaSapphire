import React, { useState, useRef, useEffect } from 'react';

interface DataPoint {
    date: string;
    value: number;
}

interface LineChartProps {
    data: DataPoint[];
}

const LineChart: React.FC<LineChartProps> = ({ data }) => {
    const [tooltip, setTooltip] = useState<{ x: number; y: number; content: string } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setDimensions({
                    width: containerRef.current.offsetWidth,
                    height: containerRef.current.offsetHeight,
                });
            }
        };

        // Initial check
        updateDimensions();

        // Use ResizeObserver for responsiveness
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const margin = { top: 20, right: 30, bottom: 50, left: 40 };
    // Ensure dimensions are non-negative
    const width = Math.max(0, dimensions.width - margin.left - margin.right);
    const height = Math.max(0, dimensions.height - margin.top - margin.bottom);

    // If dimensions are not yet available, render the container to be measured
    if (dimensions.width === 0 || dimensions.height === 0) {
        return <div ref={containerRef} className="w-full h-full" />;
    }

    const xScale = (index: number) => (index / (data.length - 1 || 1)) * width;
    
    const maxValue = Math.max(...data.map(d => d.value), 0) || 1;
    const yScale = (value: number) => height - (value / maxValue) * height;

    const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${xScale(i)} ${yScale(d.value)}`).join(' ');

    const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`;

    const handleMouseOver = (e: React.MouseEvent, d: DataPoint, i: number) => {
        const x = xScale(i) + margin.left;
        const y = yScale(d.value) + margin.top;
        const content = `${new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}: ${d.value} admission${d.value !== 1 ? 's' : ''}`;
        setTooltip({ x, y, content });
    };

    const handleMouseOut = () => {
        setTooltip(null);
    };
    
    const yAxisLabels = [0, Math.ceil(maxValue / 2), maxValue];

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <svg className="chart-svg" width="100%" height="100%">
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {/* Grid Lines */}
                    {yAxisLabels.map((val, i) => (
                        <line key={i} className="grid-line" x1={0} y1={yScale(val)} x2={width} y2={yScale(val)} stroke="#374151" strokeDasharray="4" />
                    ))}

                    {/* Axes */}
                    <g className="axis x-axis" transform={`translate(0, ${height})`}>
                        {data.map((d, i) => {
                            // Simple logic to avoid overlapping labels: show every Nth label based on total points
                            const step = Math.max(1, Math.ceil(data.length / 7));
                            if (i % step === 0) { 
                                return (
                                    <text key={i} x={xScale(i)} y={20} dy="0.71em" textAnchor="middle" fill="#9ca3af" fontSize="10">
                                        {new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                    </text>
                                );
                            }
                            return null;
                        })}
                    </g>
                    <g className="axis y-axis">
                            {yAxisLabels.map((val, i) => (
                            <text key={i} x={-10} y={yScale(val)} dy="0.32em" textAnchor="end" fill="#9ca3af" fontSize="10">
                                {val}
                            </text>
                        ))}
                    </g>

                    {/* Area and Line */}
                    <defs>
                        <linearGradient id="gradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <path className="area-path" d={areaPath} fill="url(#gradient)" />
                    <path className="line-path" stroke="#3b82f6" strokeWidth="2" fill="none" d={linePath} />

                    {/* Data Points */}
                    {data.map((d, i) => (
                        <circle
                            key={i}
                            className="data-point"
                            cx={xScale(i)}
                            cy={yScale(d.value)}
                            r={4}
                            fill="#161B22"
                            stroke="#3b82f6"
                            strokeWidth="2"
                            onMouseOver={(e) => handleMouseOver(e, d, i)}
                            onMouseOut={handleMouseOut}
                        />
                    ))}
                </g>
            </svg>
            {tooltip && (
                <div
                    className="chart-tooltip"
                    style={{
                        position: 'absolute',
                        opacity: 1,
                        top: `${tooltip.y - 40}px`,
                        left: `${tooltip.x}px`,
                        transform: 'translateX(-50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.8)',
                        color: 'white',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        pointerEvents: 'none',
                        zIndex: 10
                    }}
                >
                    {tooltip.content}
                </div>
            )}
        </div>
    );
};

export default LineChart;