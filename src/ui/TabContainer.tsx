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
    console.log('Selected tab:', selectedTab);

    const handleTabClick = (tab: number) => {
    console.log('Selected tab:', tab);
        setSelectedTab(tab);
    };
    // 

    return (
        <div className="flex flex-col w-full">
            <div className="flex">
                {children.map((child, i) => (
                    <div key={`tab-${i}`}
                        onClick={() => handleTabClick(i)}
                        className={`cursor-pointer border-4 rounded-lg px-4 py-2 -mb-0.5 ${selectedTab === i ? 'border-b-0 font-bold border-[blue]' : 'border-black '}`}>
                        {child.title}
                    </div>))
                }
            </div>
            <div className="border-2">
                {children.map((child, i) => ( selectedTab === i && <div key="active-tab" className='w-full'>{child.content}</div>))}
            </div>
        </div>
    );
};

export default TabContainer;