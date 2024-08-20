import React, { useState, useEffect, useCallback, ReactElement } from 'react';

interface DropdownMenuProps {
  options: { name: ReactElement, value: any  }[];
  selectedOption: any;
  onSelect: (name: ReactElement, value: any) => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ options, selectedOption, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const handleSelect = useCallback((name: ReactElement, value: any) => {
        onSelect(name, value);
        setIsOpen(false);
    }, [onSelect, setIsOpen]);

    useEffect(() => {
        if (!isOpen) {
            setHighlightedIndex(-1);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (isOpen) {
                if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    setHighlightedIndex((prevIndex) => (prevIndex + 1) % options.length);
                } else if (event.key === 'ArrowUp') {
                    event.preventDefault();
                    setHighlightedIndex((prevIndex) => (prevIndex - 1 + options.length) % options.length);
                } else if (event.key === 'Enter' && highlightedIndex >= 0) {
                    event.preventDefault();
                    handleSelect(options[highlightedIndex].name, options[highlightedIndex].value);
                } else if (event.key === 'Escape') {
                    event.preventDefault();
                    setIsOpen(false);
                }
            }
        };

        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            return () => {
                window.removeEventListener('keydown', handleKeyDown);
            };
        }
    }, [isOpen, highlightedIndex, handleSelect, options]);


    return (
        <div className="relative inline-block w-full h-9 border border-gray-300 p-1">
            <div className="w-full h-full p-2 cursor-pointer flex justify-between items-center"
                onClick={() => setIsOpen(!isOpen)}
                onBlur={() => setIsOpen(false)}>
                {options.find(option => option.value === selectedOption)?.name || ''}
                    <div className="absolute top-1 right-2">
                        <i className={`fas fa-chevron-down`} />
                    </div>
            </div>
            {isOpen && (
                <div className="absolute top-full left-0 w-full border border-gray-300 bg-gray-800 z-50">
                    <ul className="w-full max-h-52 overflow-y-auto">
                        {options.map(option => (
                            <li key={option.value}
                                className={`p-1 cursor-pointer hover:bg-gray-500 ${highlightedIndex === options.indexOf(option) ? 'bg-gray-500' : ''}`}
                                onClick={() => handleSelect(option.name, option.value)}>
                                {option.name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

export default DropdownMenu;