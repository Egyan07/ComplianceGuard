import React from 'react';
import { Box } from '@mui/material';
import Topbar from './Topbar';
import ContextSidebar from './ContextSidebar';
import PageTransition from './PageTransition';

interface AppShellProps {
  children: React.ReactNode;
  selectedFramework?: number;
  mode?: 'light' | 'dark';
  onToggleMode?: () => void;
}

const AppShell: React.FC<AppShellProps> = ({
  children,
  selectedFramework = 1,
  mode = 'light',
  onToggleMode = () => {},
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <Topbar mode={mode} onToggleMode={onToggleMode} />
      <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <ContextSidebar selectedFramework={selectedFramework} />
        <Box
          component="main"
          sx={{ flex: 1, overflow: 'auto', p: 2.5, minHeight: 'calc(100vh - 44px)' }}
        >
          <PageTransition>
            {children}
          </PageTransition>
        </Box>
      </Box>
    </Box>
  );
};

export default AppShell;
