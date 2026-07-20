import React, { useState } from 'react';

export type TabTitle = React.ReactNode | ((selected: boolean) => React.ReactNode);

export type TabChild = {
    title: TabTitle;
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
            <div className="flex flex-wrap justify-evenly" role="tablist">
                {pages.map((child, i) => (
                    <button key={`tab-${i}`}
                        role="tab"
                        aria-selected={selectedTab === i}
                        aria-controls={`tabpanel-${i}`}
                        id={`tab-${i}`}
                        onClick={() => handleTabClick(i)}
                        className={`cursor-pointer px-2 sm:px-4 py-2`}>
                        {typeof child.title === 'function' ? child.title(selectedTab === i) : child.title}
                    </button>))
                }
            </div>
            <div className="">
                {pages.map((child, i) =>
                     ( selectedTab === i &&
                      <div key={`tabpanel-${i}`} 
                        role="tabpanel"
                        id={`tabpanel-${i}`}
                        aria-labelledby={`tab-${i}`}
                        className='w-full'>
                        {child.content}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TabContainer;