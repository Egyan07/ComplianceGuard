import React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { Card, CardProps } from '@mui/material';

const MotionCardBase = motion(Card);

type MotionCardProps = CardProps & MotionProps;

const MotionCard: React.FC<MotionCardProps> = (props) => (
  <MotionCardBase
    whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.1)' }}
    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    {...props}
  />
);

export default MotionCard;
