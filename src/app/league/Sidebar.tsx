'use client'

import { useState } from 'react';
import styles from './Sidebar.module.css';

const Sidebar = () => {
	const [isOpen, setIsOpen] = useState(true);

	const toggleSidebar = () => {
		setIsOpen(!isOpen);
	};

    return (
            <div className={`${styles.sidebar} ${isOpen ? styles.open : ''}`}>
            <button onClick={toggleSidebar} className={styles.toggleButton}>
                {isOpen ? '<<' : '>>'}
            </button>
            <div className={styles.content}>
                <h2>Sidebar Content</h2>
                <p>Some content here...</p>
            </div>
        </div>
    );
};

export default Sidebar;