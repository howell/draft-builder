'use client';
import { after } from 'node:test';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
    children: ReactNode;
    text: string;
}

export const TOOLTIP_DELAY = 5;
const TOOLTIP_MARGIN = 10;

const Tooltip: React.FC<TooltipProps> = ({ text, children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [position, setPosition] = useState<{ top: number, left: number } | null>(null);
    const parentRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const showTimeout = useRef<NodeJS.Timeout | null>(null);
    const hideTimeout = useRef<NodeJS.Timeout | null>(null);

    const showTooltip = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        if (hideTimeout.current) {
            clearTimeout(hideTimeout.current);
            hideTimeout.current = null;
        }

        showTimeout.current = setTimeout(() => {
            showTimeout.current = null;
            setIsVisible(true);
            if (tooltipRef.current && parentRef.current) {
                const tooltipElement = tooltipRef.current;
                const { top: parentTop, right: parentRight, bottom: parentBottom } = parentRef.current.getBoundingClientRect();
                const { width, height } = tooltipElement.getBoundingClientRect();
                const { width: viewportWidth, } = window.visualViewport ?? { width: window.innerWidth };

                const topBound = window.scrollY + TOOLTIP_MARGIN;
                const rightBound = window.scrollX + viewportWidth - TOOLTIP_MARGIN;
                let newTop = window.scrollY + parentTop - height;
                let newLeft = window.scrollX + parentRight;

                if (newTop < topBound) {
                    newTop = parentBottom + window.scrollY;
                }
                if (newLeft + width > rightBound) {
                    newLeft = newLeft - width;
                }
                setPosition({ top: newTop, left: newLeft });
            }
        }, TOOLTIP_DELAY);

        setIsVisible(true);
    };

    const hideTooltip = () => {
        if (showTimeout.current) {
            return;
        }

        hideTimeout.current = setTimeout(() => {
            setIsVisible(false);
            hideTimeout.current = null;
            setPosition(null);
        }, TOOLTIP_DELAY);
    };

    useEffect(() => {
        // Cleanup timeouts on unmount
        return () => {
            if (showTimeout.current) clearTimeout(showTimeout.current);
            if (hideTimeout.current) clearTimeout(hideTimeout.current);
        };
    }, []);

    return (
        <div className="relative inline-block">
            <div className='flex'>
                {children}
                <i ref={parentRef}
                    className={`p-0.5 fas fa-info-circle text-slate-600 dark:text-slate-600 text-xxs`}
                    role="tooltip-trigger"
                    aria-label="Show tooltip"
                    onMouseEnter={showTooltip}
                    onMouseLeave={hideTooltip}
                    onTouchStart={showTooltip}
                    onTouchEnd={hideTooltip} />
            </div>
            {isVisible && createPortal(
                <div
                    ref={tooltipRef}
                    className={`absolute z-50 w-32 p-2 text-center text-white bg-black rounded shadow-lg`}
                    style={position ?? {}}
                    onMouseEnter={showTooltip}
                    onMouseLeave={hideTooltip}
                    onTouchStart={showTooltip}
                    onTouchEnd={hideTooltip}
                >
                    {text}
                </div>,
                document.body)}
        </div>
    );
};

export default Tooltip;