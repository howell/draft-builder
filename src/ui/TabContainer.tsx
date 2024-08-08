import React, { useState } from 'react';

export type TabChild = {
    title: string;
    content: React.ReactNode | string;
}

export type TabContainerProps = {
    children: TabChild[];
};

const TabContainer: React.FC<TabContainerProps> = ({ children }) => {
    const [selectedTab, setSelectedTab] = useState(0);

    const handleTabClick = (tab: number) => {
        setSelectedTab(tab);
    };

    return (
        <div className="flex flex-col w-full">
            <div className="flex justify-around border-b">
                {children.map((child, i) => (
                    <button
                        onClick={() => handleTabClick(i)}
                        className={`px-4 py-2 ${selectedTab === i ? 'font-bold border-b-2 border-blue-500' : ''}`} >
                        child.title
                    </button>))
                }
            </div>
            <div className="mt-4">
                {children.map((child, i) => ( selectedTab === i && <div className='w-full'>{child.content}</div>))}
            </div>
        </div>
    );
};

export default TabContainer;