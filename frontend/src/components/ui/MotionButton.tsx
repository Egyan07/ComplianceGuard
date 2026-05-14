import React from 'react';
import { motion } from 'framer-motion';
import { Button, ButtonProps } from '@mui/material';

const MotionButtonBase = motion(Button);

const MotionButton: React.FC<ButtonProps> = (props) => (
  <MotionButtonBase
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    {...(props as any)}
  />
);

export default MotionButton;
