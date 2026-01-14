import React from 'react';

interface ConnectionDotProps {
    cx: number;
    cy: number;
    onCut: () => void;
    onDragStart?: (e: React.MouseEvent) => void;
}

const ConnectionDot: React.FC<ConnectionDotProps> = ({ cx, cy, onCut, onDragStart }) => {
    const [isHovered, setIsHovered] = React.useState(false);

    return (
        <g
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{ cursor: 'pointer' }}
        >
            {/* Invisible larger hit area for easier clicking */}
            <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 12 : 10}
                fill="transparent"
                onMouseDown={onDragStart}
                onClick={(e) => {
                    e.stopPropagation();
                    onCut();
                }}
            />

            {/* Visible dot */}
            <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 6 : 4}
                fill="#6366f1"
                className={`transition-all ${isHovered ? 'drop-shadow-lg' : 'drop-shadow-sm'}`}
                style={{ pointerEvents: 'none' }}
            />

            {/* Outer ring when hovered */}
            {isHovered && (
                <circle
                    cx={cx}
                    cy={cy}
                    r={8}
                    fill="none"
                    stroke="#6366f1"
                    strokeWidth={1.5}
                    className="animate-pulse"
                    style={{ pointerEvents: 'none' }}
                />
            )}
        </g>
    );
};

export default ConnectionDot;
