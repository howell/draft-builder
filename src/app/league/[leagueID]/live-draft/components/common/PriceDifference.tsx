'use client';

import React from 'react';
import { format, ui } from '../../utils';

export interface PriceDifferenceProps {
  difference: number;
  className?: string;
  showSign?: boolean;
}

const PriceDifference: React.FC<PriceDifferenceProps> = ({
  difference,
  className = '',
  showSign = true
}) => {
  return (
    <span className={`text-sm font-medium ${ui.getPriceDifferenceColor(difference)} ${className}`}>
      {showSign ? format.priceDifference(difference) : format.currency(Math.abs(difference))}
    </span>
  );
};

export default PriceDifference;