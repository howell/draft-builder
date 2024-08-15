import React, { ReactNode } from 'react';

interface TooltipProps {
    children: ReactNode;
    content: string;
    color?: string;
}

const Tooltip: React.FC<TooltipProps> = ({ children, content, color = 'slate-500' }) => {
    return (
        <div className={`after:font-font-awesome after:content-info-circle after:ml-0.5 after:text-xxs after:align-top after:text-${color}`}
            title={content}>
            {children}
        </div>
    );
};

export default Tooltip;