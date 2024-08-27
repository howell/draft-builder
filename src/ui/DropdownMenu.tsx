import React, { useState, useEffect, useCallback, useRef, } from 'react';

interface DropdownMenuProps {
  options: { name: React.ReactNode, value: any  }[];
  selectedOption: any;
  onSelect: (name: React.ReactNode, value: any) => void;
  styles?: DropdownStyleOptions;
}

export type DropdownStyleOptions = {
    bgColor: string;
    textColor: string;
    hoverBgColor: string;
    hoverTextColor: string;
    highlightBgColor: string;
    highlightTextColor: string;
    border: string;
}

export const DEFAULT_DROPDOWN_STYLE: DropdownStyleOptions = {
    bgColor: 'bg-gray-800',
    textColor: 'text-white',
    hoverBgColor: 'hover:bg-gray-500',
    hoverTextColor: 'hover:text-black',
    highlightBgColor: 'bg-gray-500',
    highlightTextColor: 'text-black',
    border: 'border border-gray-300',
};

const DropdownMenu: React.FC<DropdownMenuProps> = ({ options, selectedOption, onSelect, styles }) => {
    styles = styles ?? DEFAULT_DROPDOWN_STYLE;
    const hoverStyle = `${styles.hoverBgColor} ${styles.hoverTextColor}`;
    const highlightedStyle = `${styles.highlightBgColor} ${styles.highlightTextColor}`;
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);
    const [isFocused, setIsFocused] = useState(false);
    const parentRef = useRef<HTMLDivElement>(null);

    const handleSelect = useCallback((name: React.ReactNode, value: any) => {
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
            if (parentRef.current && isFocused && isOpen) {
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
    }, [isOpen, isFocused, highlightedIndex, handleSelect, options]);


    return (
        <div className={`relative inline-block w-full h-9 p-1 ${styles.border}`}
            tabIndex={0}
            onBlur={() => { setIsOpen(false); setIsFocused(false); }}
            ref={parentRef}>
            <div className={`w-full h-full p-2 cursor-pointer flex justify-between items-center
             ${styles.bgColor} ${styles.textColor} `}
                onClick={() => { setIsOpen(!isOpen); setIsFocused(true); }}
                onFocus={() => setIsFocused(true)} >
                {options.find(option => option.value === selectedOption)?.name || ''}
                    <div className="absolute top-1 right-2">
                        <i className={`fas fa-chevron-down`} />
                    </div>
            </div>
            {isOpen && (
                <div className={`absolute top-full left-0 w-full z-50
                     ${styles.border}
                     ${styles.bgColor}
                     ${styles.textColor}`}>
                    <ul className="w-full max-h-52 overflow-y-auto">
                        {options.map((option, i) => (
                            <li key={`option-${i}`}
                                className={`p-1 cursor-pointer
                                    ${hoverStyle}
                                    ${highlightedIndex === options.indexOf(option) ? highlightedStyle : ''}`}
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