import React from 'react';
import './LoadingScreen.css'; // Import the CSS file for styling

const LoadingScreen: React.FC = () => {
  return (
	<div className="loading-screen">
	  <div className="loading-spinner"></div>
	  <p>Loading...</p>
	</div>
  );
};

export default LoadingScreen;