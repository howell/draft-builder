import React, { useState, useEffect } from 'react';
import styles from './DropdownMenu.module.css';

interface DropdownMenuProps {
  options: { name: string, value: any  }[];
  selectedOption: string;
  onSelect: (name: string, value: any) => void;
}

const DropdownMenu: React.FC<DropdownMenuProps> = ({ options, selectedOption, onSelect }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [highlightedIndex, setHighlightedIndex] = useState(-1);

    const handleSelect = (name: string, value: any) => {
        onSelect(name, value);
        setIsOpen(false);
    };

    useEffect(() => {
        if (!isOpen) {
            setHighlightedIndex(-1);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleKeyDown = (event: globalThis.KeyboardEvent) => {
            if (isOpen) {
                if (event.key === 'ArrowDown') {
                    setHighlightedIndex((prevIndex) => (prevIndex + 1) % options.length);
                } else if (event.key === 'ArrowUp') {
                    setHighlightedIndex((prevIndex) => (prevIndex - 1 + options.length) % options.length);
                } else if (event.key === 'Enter' && highlightedIndex >= 0) {
                    handleSelect(options[highlightedIndex].name, options[highlightedIndex].value);
                } else if (event.key === 'Escape') {
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
    }, [isOpen, highlightedIndex]);


    return (
        <div className={styles.dropdown}>
            <div className={`${styles.selected}`}
                onClick={() => setIsOpen(!isOpen)}
                onBlur={() => setIsOpen(false)}>
                {options.find(option => option.name === selectedOption)?.name || ''}
                    <div className={`${styles.iconContainer}`}>
                        <i className={`fas fa-chevron-down`} />
                    </div>
            </div>
            {isOpen && (
                <ul className={styles.options}>
                    {options.map(option => (
                        <li key={option.name}
                            className={highlightedIndex === options.indexOf(option) ? styles.highlighted : ''}
                            onClick={() => handleSelect(option.name, option.value)}>
                            {option.name}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default DropdownMenu;