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
            <button onClick={handleClick}>
                <div className="flex items-center">
                    {label}
                    <i className={`ml-2 fas ${isVisible ? 'fa-chevron-down' : 'fa-chevron-up'}`} />
                 </div>
            </button>
            {isVisible && children}
        </div>
    );
};

export default CollapsibleComponent;