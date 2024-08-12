import React from 'react';

interface ErrorScreenProps {
  message: string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ message }) => {
  return (
    <div className="justify-center items-center h-screen w-full bg-red-300 text-black">
      <div className="text-center p-8">
        <h1 className='text-2xl'>Oops! Something went wrong</h1>
        <p>{message}</p>
      </div>
    </div>
  );
};

export default ErrorScreen;