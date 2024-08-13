import { ReactNode } from "react";

export const DarkLightText: React.FC<{ children: ReactNode }> = ({ children }) => {
    return (
        <span className="bg-white text-black
                         dark:bg-slate-700 dark:text-white">
            {children}
        </span>
    );
}

