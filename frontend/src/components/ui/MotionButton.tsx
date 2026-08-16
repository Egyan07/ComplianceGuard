import React from 'react';
import { motion, MotionProps } from 'framer-motion';
import { Button, ButtonProps } from '@mui/material';

const MotionButtonBase = motion(Button);

type MotionButtonProps = ButtonProps & MotionProps;

const MotionButton: React.FC<MotionButtonProps> = (props) => (
  <MotionButtonBase
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.97 }}
    transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    {...props}
  />
);

export default MotionButton;
