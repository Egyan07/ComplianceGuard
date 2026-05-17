import React from 'react';
import { motion } from 'framer-motion';
import { Card, CardProps } from '@mui/material';

const MotionCardBase = motion(Card);

const MotionCard: React.FC<CardProps> = (props) => (
  <MotionCardBase
    whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    {...(props as any)}
  />
);

export default MotionCard;
