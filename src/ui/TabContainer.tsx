import React, { useState } from 'react';

export type TabChild = {
    title: string;
    content: React.ReactNode | string;
}

export type TabContainerProps = {
    pages: TabChild[];
};

const TabContainer: React.FC<TabContainerProps> = ({ pages }) => {
    const [selectedTab, setSelectedTab] = useState(0);
    const handleTabClick = (tab: number) => {
        setSelectedTab(tab);
    };

    return (
        <div className="flex flex-col w-auto">
            <div className="flex">
                {pages.map((child, i) => (
                    <div key={`tab-${i}`}
                        onClick={() => handleTabClick(i)}
                        className={`cursor-pointer border-4 rounded-lg px-4 py-2 -mb-0.5 ${selectedTab === i ? 'border-b-0 font-bold border-[blue]' : 'border-black '}`}>
                        {child.title}
                    </div>))
                }
            </div>
            <div className="border-2">
                {pages.map((child, i) =>
                     ( selectedTab === i &&
                      <div key={`tab-${i}`} className='w-full'>
                        {child.content}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TabContainer;