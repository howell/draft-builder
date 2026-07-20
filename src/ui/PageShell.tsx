import React from 'react';

interface PageShellProps {
  children: React.ReactNode;
  /** Width of the centered content column. */
  maxWidth?: 'md' | '2xl' | '4xl' | '6xl';
  /** Rendered above the content, inside the column (typically <AppHeader />). */
  header?: React.ReactNode;
  /** Offset the column to clear the fixed Sidebar when it is rendered. */
  sidebarOffset?: boolean;
  /** Vertically center the content below the header (e.g. auth screens). */
  centerContent?: boolean;
  className?: string;
}

const maxWidthClasses = {
  md: 'max-w-md',
  '2xl': 'max-w-2xl',
  '4xl': 'max-w-4xl',
  '6xl': 'max-w-6xl',
};

export const PageShell: React.FC<PageShellProps> = ({
  children,
  maxWidth = '2xl',
  header,
  sidebarOffset = false,
  centerContent = false,
  className = '',
}) => {
  return (
    <main
      className={`flex min-h-screen flex-col items-center bg-gray-50 dark:bg-gray-900 px-4 sm:px-8 lg:px-12 pb-16 ${
        sidebarOffset ? 'md:ml-44' : ''
      } ${className}`}
    >
      <div className={`w-full ${maxWidthClasses[maxWidth]} flex flex-1 flex-col`}>
        {header}
        <div className={`flex flex-col ${centerContent ? 'flex-1 justify-center pb-24' : ''}`}>
          {children}
        </div>
      </div>
    </main>
  );
};

export default PageShell;
