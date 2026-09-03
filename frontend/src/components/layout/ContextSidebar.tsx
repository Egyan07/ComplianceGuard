import React from 'react';
import { Box, Divider, Typography } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  DashboardOutlined,
  HistoryOutlined,
  CloudOutlined,
  LibraryBooksOutlined,
  SettingsOutlined,
} from '@mui/icons-material';
import { RADIUS, toneColors } from '../../theme';
import { VERSION } from '../../constants';

interface NavItem { label: string; key: string; onClick: () => void; }
interface NavGroup { title: string; items: NavItem[]; }

const MotionBox = motion(Box);

const NAV_ITEMS = [
  { label: 'Dashboard', route: '/',           icon: <DashboardOutlined sx={{ fontSize: '1.05rem' }} /> },
  { label: 'History',   route: '/history',    icon: <HistoryOutlined   sx={{ fontSize: '1.05rem' }} /> },
  { label: 'Cloud',     route: '/cloud',      icon: <CloudOutlined     sx={{ fontSize: '1.05rem' }} /> },
  { label: 'Frameworks',route: '/frameworks', icon: <LibraryBooksOutlined sx={{ fontSize: '1.05rem' }} /> },
  { label: 'Settings',  route: '/settings',   icon: <SettingsOutlined  sx={{ fontSize: '1.05rem' }} /> },
];

const FRAMEWORKS = [
  { label: 'SOC 2',     key: 'soc2',     id: 1 },
  { label: 'ISO 27001', key: 'iso27001', id: 2 },
  { label: 'HIPAA',     key: 'hipaa',    id: 3 },
  { label: 'GDPR',      key: 'gdpr',     id: 4 },
];

interface ContextSidebarProps {
  selectedFramework?: number;
}

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Typography
    sx={{
      fontSize: '0.68rem',
      fontWeight: 650,
      letterSpacing: '0.2px',
      color: 'text.secondary',
      px: 1.5,
      py: 0.5,
      mb: 0.25,
    }}
  >
    {children}
  </Typography>
);

const ContextSidebar: React.FC<ContextSidebarProps> = ({ selectedFramework = 1 }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const info = toneColors(theme, 'info');
  const path = location.pathname;

  const isNavActive = (route: string): boolean => {
    if (route === '/') return path === '/';
    return path.startsWith(route);
  };

  const getGroups = (): NavGroup[] => {
    if (path === '/') return [
      {
        title: 'Select framework',
        items: FRAMEWORKS.map(f => ({
          label: f.label, key: f.key,
          onClick: () => navigate(`/?fw=${f.id}`),
        })),
      },
    ];
    if (path === '/history') return [{
      title: 'Filter by framework',
      items: [
        { label: 'All', key: 'all', onClick: () => navigate('/history') },
        ...FRAMEWORKS.map(f => ({ label: f.label, key: f.key, onClick: () => navigate(`/history?fw=${f.id}`) })),
      ],
    }];
    if (path === '/frameworks') return [{
      title: 'Browse',
      items: FRAMEWORKS.map(f => ({ label: f.label, key: f.key, onClick: () => {} })),
    }];
    if (path === '/settings') return [{
      title: 'Settings',
      items: [
        { label: 'License',         key: 'license',         onClick: () => {} },
        { label: 'Auto Collection', key: 'auto-collection', onClick: () => {} },
        { label: 'Cloud Sync',      key: 'cloud-sync',      onClick: () => {} },
        { label: 'About',           key: 'about',           onClick: () => {} },
      ],
    }];
    if (path === '/cloud') return [{
      title: 'Cloud',
      items: [
        { label: 'Overview', key: 'overview', onClick: () => {} },
        { label: 'Machines', key: 'machines', onClick: () => {} },
        { label: 'Sync',     key: 'sync',     onClick: () => {} },
      ],
    }];
    return [];
  };

  const getActiveKey = (): string => {
    if (path === '/') return FRAMEWORKS.find(f => f.id === selectedFramework)?.key ?? 'soc2';
    return '';
  };

  const groups = getGroups();
  const activeKey = getActiveKey();
  const isDark = theme.palette.mode === 'dark';

  return (
    <Box
      sx={{
        width: 212,
        flexShrink: 0,
        position: 'sticky',
        top: 44,
        height: 'calc(100vh - 44px)',
        overflowY: 'auto',
        borderRight: '1px solid',
        borderColor: 'divider',
        backgroundColor: isDark ? '#13161F' : '#F1F5F9',
        py: 1.5,
        px: 1,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column',
        gap: 0.5,
      }}
    >
      {/* Global navigation */}
      <Box sx={{ mb: 0.5 }}>
        <SectionLabel>Navigation</SectionLabel>
        {NAV_ITEMS.map(nav => {
          const active = isNavActive(nav.route);
          return (
            <MotionBox
              key={nav.route}
              whileHover={{ x: 2 }}
              transition={{ duration: 0.1 }}
              onClick={() => navigate(nav.route)}
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                px: active ? 1.25 : 1.5,
                py: 0.6,
                borderRadius: '6px',
                cursor: 'pointer',
                color: active ? 'primary.main' : 'text.secondary',
                fontWeight: active ? 600 : 500,
                fontSize: '0.8125rem',
                '&:hover': { backgroundColor: active ? info.surface : 'action.hover' },
                transition: 'background-color 0.15s, color 0.15s',
                userSelect: 'none',
              }}
            >
              {active && (
                <motion.div
                  layoutId="sidebar-active-bg"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: RADIUS.sm,
                    backgroundColor: info.surface,
                    borderLeft: `2px solid ${info.main}`,
                  }}
                  transition={{ type: 'spring', stiffness: 350, damping: 35 }}
                />
              )}
              <Box sx={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center' }}>
                {nav.icon}
              </Box>
              <Box sx={{ position: 'relative', zIndex: 1 }}>{nav.label}</Box>
            </MotionBox>
          );
        })}
      </Box>

      <Divider sx={{ my: 1.5 }} />

      {/* Context-specific groups */}
      {groups.map(group => (
        <Box key={group.title} sx={{ mb: 1.5 }}>
          <SectionLabel>{group.title}</SectionLabel>
          {group.items.map(item => {
            const isActive = activeKey === item.key;
            return (
              <MotionBox
                key={item.key}
                whileHover={{ x: 2 }}
                transition={{ duration: 0.1 }}
                onClick={item.onClick}
                sx={{
                  px: 1.5,
                  py: 0.7,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  backgroundColor: isActive ? info.surface : 'transparent',
                  color: isActive ? 'primary.main' : 'text.secondary',
                  fontWeight: isActive ? 600 : 500,
                  fontSize: '0.8125rem',
                  '&:hover': { backgroundColor: isActive ? info.surface : 'action.hover' },
                  transition: 'background-color 0.15s, color 0.15s',
                  userSelect: 'none',
                }}
              >
                {item.label}
              </MotionBox>
            );
          })}
        </Box>
      ))}

      {/* Version stamp */}
      <Box sx={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
        <Typography sx={{ fontSize: '0.68rem', color: 'text.secondary' }}>
          v{VERSION}
        </Typography>
      </Box>
    </Box>
  );
};

export default ContextSidebar;
