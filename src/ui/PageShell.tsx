import React from 'react';

interface PageShellProps {
  children: React.ReactNode;
  /** Width of the centered content column. */
  maxWidth?: 'md' | '2xl' | '4xl' | '6xl';
  /** Rendered above the content, inside the column (typically <AppHeader />). */
  header?: React.ReactNode;
  /** Rendered beside the content (typically <Sidebar />), which handles its own responsive behavior. */
  sidebar?: React.ReactNode;
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
  sidebar,
  centerContent = false,
  className = '',
}) => {
  return (
    <div className={`flex min-h-screen w-full bg-gray-50 dark:bg-gray-900 ${className}`}>
      {sidebar}
      <main className="flex flex-1 min-w-0 flex-col items-center px-4 sm:px-8 lg:px-12 pb-16">
        <div className={`w-full ${maxWidthClasses[maxWidth]} flex flex-1 flex-col`}>
          {/* Clear the mobile sidebar-open button when a sidebar is present */}
          {header && <div className={sidebar ? 'pl-12 md:pl-0' : ''}>{header}</div>}
          <div className={`flex flex-col ${centerContent ? 'flex-1 justify-center pb-24' : ''}`}>
            {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default PageShell;
