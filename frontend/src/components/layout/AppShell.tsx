import React from 'react';
import { Box, CssBaseline } from '@mui/material';
import { ThemeProvider } from '@mui/material/styles';
import { useColorMode } from '../../hooks/useColorMode';
import { getTheme } from '../../theme';
import Topbar from './Topbar';
import ContextSidebar from './ContextSidebar';
import PageTransition from './PageTransition';

interface AppShellProps {
  children: React.ReactNode;
  selectedFramework?: number;
}

const AppShell: React.FC<AppShellProps> = ({ children, selectedFramework = 1 }) => {
  const { mode, toggle } = useColorMode();

  return (
    <ThemeProvider theme={getTheme(mode)}>
      <CssBaseline />
      <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <Topbar mode={mode} onToggleMode={toggle} />
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
    </ThemeProvider>
  );
};

export default AppShell;
