import React from 'react';

interface LoadingSpinnerProps {
  fullScreen?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ fullScreen = false }) => {
  const loaderContent = (
    <div className="loading">
      <svg width="64px" height="48px">
          <polyline points="0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24" id="back"></polyline>
        <polyline points="0.157 23.954, 14 23.954, 21.843 48, 43 0, 50 24, 64 24" id="front"></polyline>
      </svg>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 bg-[#0D1117] flex items-center justify-center z-50">
        {loaderContent}
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center p-4">
      {loaderContent}
    </div>
  );
};

export default LoadingSpinner;