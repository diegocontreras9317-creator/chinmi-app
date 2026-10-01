import React from 'react';

interface FacebookIconProps {
  className?: string;
}

export const FacebookIcon: React.FC<FacebookIconProps> = ({ className = 'w-5 h-5' }) => {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#1877F2" />
      <path
        d="M16.5 12.05H13.88V20.25H10.5V12.05H8.88V9.18H10.5V7.12C10.5 5.78 11.37 4.25 13.9 4.25H16.25V7.08H14.54C13.68 7.08 13.5 7.49 13.5 8.1V9.18H16.5L16.05 12.05Z"
        fill="white"
      />
    </svg>
  );
};
