import React, { ReactNode } from "react";

export type Titled<T> = {
    name: React.ReactNode;
    shortName: React.ReactNode;
    tooltip?: string;
    value: T;
}

export const DarkLightText: React.FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <span className="bg-white text-black
                         dark:bg-slate-700 dark:text-white">
            {children}
        </span>
    );
}

