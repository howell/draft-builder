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
            <div className="flex justify-around">
                {children.map((child, i) => (
                    <button
                        key={`tab-${i}`}
                        onClick={() => handleTabClick(i)}
                        className={`border border-solid border-2 px-4 py-2 ${selectedTab === i ? 'font-bold border-sky-500' : 'border-black '}`} >
                        {child.title}
                    </button>))
                }
            </div>
            <div className="border border-solid border-8 border-white">
                {children.map((child, i) => ( selectedTab === i && <div key="active-tab" className='w-full'>{child.content}</div>))}
            </div>
        </div>
    );
};

export default TabContainer;