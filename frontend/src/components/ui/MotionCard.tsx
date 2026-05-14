import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardProps } from '@mui/material';

const MotionCardBase = motion(Card);

const MotionCard: React.FC<CardProps> = (props) => (
  <MotionCardBase
    whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}
    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
    {...props}
  />
);

export default MotionCard;
