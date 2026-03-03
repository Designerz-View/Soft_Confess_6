import React from 'react';

interface ProgressBarProps {
  current: number;
  total: number;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ current, total }) => {
  const percentage = (current / total) * 100;

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between text-sm sm:text-base">
          <span className="font-medium text-gray-700">
            Question {current} of {total}
          </span>
          <span className="text-gray-600">
            {Math.round(percentage)}% Complete
          </span>
        </div>

        <div className="relative h-3 sm:h-4 bg-gray-200 rounded-full overflow-hidden shadow-inner">
          <div
            className="absolute inset-y-0 left-0 bg-gradient-to-r from-rose-400 via-pink-500 to-rose-500 rounded-full transition-all duration-500 ease-out shadow-lg"
            style={{ width: `${percentage}%` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent animate-pulse" />
          </div>
        </div>

        <div className="flex justify-between text-xs sm:text-sm text-gray-500">
          <span>Just started</span>
          <span>Almost there!</span>
        </div>
      </div>
    </div>
  );
};
