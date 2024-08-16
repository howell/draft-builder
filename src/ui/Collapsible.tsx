import React, { useState } from 'react';

interface ToggleComponentProps {
    label: React.ReactNode;
    children: React.ReactNode;
}

const CollapsibleComponent: React.FC<ToggleComponentProps> = ({ label, children }) => {
    const [isVisible, setIsVisible] = useState(false);

    const handleClick = () => {
        setIsVisible(!isVisible);
    };

    return (
        <div>
            <div className="flex items-center">
                {label}
                <button onClick={handleClick}>
                    <i className={`ml-2 pt-1 fas ${isVisible ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
                </button>
            </div>
            {isVisible && children}
        </div>
    );
};

export default CollapsibleComponent;