import React from 'react';
import './ErrorScreen.css'; // Import the CSS file for styling

interface ErrorScreenProps {
  message: string;
}

const ErrorScreen: React.FC<ErrorScreenProps> = ({ message }) => {
  return (
    <div className="error-screen">
      <div className="error-content">
        <h1>Oops! Something went wrong</h1>
        <p>{message}</p>
      </div>
    </div>
  );
};

export default ErrorScreen;