import React, { useState, useRef, useEffect } from 'react';

interface DataPoint {
    name: string;
    value: number;
}

interface BarChartProps {
    data: DataPoint[];
}

const BarChart: React.FC<BarChartProps> = ({ data }) => {
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

        // Initial measurement
        updateDimensions();

        // Observer for resizing
        const observer = new ResizeObserver(updateDimensions);
        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    const margin = { top: 20, right: 20, bottom: 80, left: 50 };
    // Prevent negative calculations if container is too small
    const width = Math.max(0, dimensions.width - margin.left - margin.right);
    const height = Math.max(0, dimensions.height - margin.top - margin.bottom);

    // If dimensions are not yet available, render the container to be measured
    if (dimensions.width === 0 || dimensions.height === 0) {
        return <div ref={containerRef} className="w-full h-full" />;
    }

    const maxValue = Math.max(...data.map(d => d.value), 0);
    const yScale = (value: number) => height - (value / (maxValue || 1)) * height;

    const barWidth = data.length > 0 ? Math.min(width / data.length * 0.8, 50) : 0;

    const handleMouseOver = (e: React.MouseEvent, d: DataPoint, i: number) => {
        const x = (i * (width / data.length)) + (width / (data.length * 2)) + margin.left;
        const y = yScale(d.value) + margin.top;
        const content = `${d.name}: $${d.value.toFixed(2)}`;
        setTooltip({ x, y, content });
    };

    const handleMouseOut = () => {
        setTooltip(null);
    };
    
    const yAxisLabels = [0, Math.ceil(maxValue / 2), maxValue];
    const colors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#6366f1"];

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <svg className="chart-svg" width="100%" height="100%">
                <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {/* Grid Lines */}
                    {yAxisLabels.map((val, i) => (
                        <line key={i} className="grid-line" x1={0} y1={yScale(val)} x2={width} y2={yScale(val)} stroke="#374151" strokeDasharray="4" />
                    ))}

                    {/* Axes */}
                    <g className="axis y-axis">
                        {yAxisLabels.map((val, i) => (
                            <text key={i} x={-10} y={yScale(val)} dy="0.32em" textAnchor="end" fill="#9ca3af" fontSize="10">
                                {val > 1000 ? `${(val/1000).toFixed(1)}k` : val}
                            </text>
                        ))}
                    </g>

                    {/* Bars */}
                    {data.map((d, i) => {
                        const barHeight = height - yScale(d.value);
                        return (
                            <g key={i} transform={`translate(${i * (width / data.length)}, 0)`}>
                                <rect
                                    className="bar"
                                    x={(width / data.length - barWidth) / 2}
                                    y={yScale(d.value)}
                                    width={barWidth}
                                    height={barHeight}
                                    fill={colors[i % colors.length]}
                                    onMouseOver={(e) => handleMouseOver(e, d, i)}
                                    onMouseOut={handleMouseOut}
                                />
                                    <text 
                                    className="axis x-axis" 
                                    x={width / data.length / 2} 
                                    y={height + 10}
                                    transform={`rotate(-45 ${width / data.length / 2} ${height + 10})`}
                                    textAnchor="end"
                                    style={{ fontStyle: 'italic', fill: 'white', fontSize: '10px' }}
                                >
                                    {d.name.length > 12 ? d.name.substring(0,10)+'...' : d.name}
                                </text>
                            </g>
                        );
                    })}
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

export default BarChart;