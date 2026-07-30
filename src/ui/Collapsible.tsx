import React, { useState } from 'react';

interface ToggleComponentProps {
    label: React.ReactNode;
    children: React.ReactNode;
    testId?: string;
    defaultOpen?: boolean;
}

const CollapsibleComponent: React.FC<ToggleComponentProps> = ({ label, children, testId, defaultOpen = false }) => {
    const [isVisible, setIsVisible] = useState(defaultOpen);

    const handleClick = () => {
        setIsVisible(!isVisible);
    };

    const bodyTestId = testId ? `${testId}-body` : undefined;

    return (
        <div>
            <div className="flex items-center">
                {label}
                <button onClick={handleClick} data-testid={testId}>
                    <i className={`ml-2 pt-1 fas ${isVisible ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
                </button>
            </div>
            {isVisible && (
                <div data-testid={bodyTestId}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default CollapsibleComponent;