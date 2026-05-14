import React from 'react';
import { Box, Typography } from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';

interface NavItem { label: string; key: string; onClick: () => void; }
interface NavGroup { title: string; items: NavItem[]; }

const MotionBox = motion(Box);

const NavItemRow: React.FC<{ item: NavItem; active: boolean }> = ({ item, active }) => (
  <MotionBox
    whileHover={{ x: 2 }}
    transition={{ duration: 0.1 }}
    onClick={item.onClick}
    sx={{
      px: 1.5, py: 0.75, borderRadius: '6px', cursor: 'pointer',
      backgroundColor: active ? 'rgba(37,99,235,0.08)' : 'transparent',
      color: active ? 'primary.main' : 'text.secondary',
      fontWeight: active ? 600 : 400,
      fontSize: '0.8rem',
      '&:hover': { backgroundColor: active ? 'rgba(37,99,235,0.08)' : 'action.hover' },
      transition: 'background-color 0.15s',
      userSelect: 'none',
    }}
  >
    {item.label}
  </MotionBox>
);

const FRAMEWORKS = [
  { label: 'SOC 2',     key: 'soc2',    id: 1 },
  { label: 'ISO 27001', key: 'iso27001', id: 2 },
  { label: 'HIPAA',     key: 'hipaa',   id: 3 },
];

interface ContextSidebarProps {
  selectedFramework?: number;
}

const ContextSidebar: React.FC<ContextSidebarProps> = ({ selectedFramework = 1 }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const path = location.pathname;

  const getGroups = (): NavGroup[] => {
    if (path === '/') return [
      {
        title: 'Frameworks',
        items: FRAMEWORKS.map(f => ({
          label: f.label, key: f.key,
          onClick: () => navigate(`/?fw=${f.id}`),
        })),
      },
    ];
    if (path === '/history') return [{
      title: 'Filter',
      items: [
        { label: 'All Frameworks', key: 'all', onClick: () => navigate('/history') },
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

  return (
    <Box
      sx={{
        width: 200, flexShrink: 0,
        position: 'sticky', top: 44,
        height: 'calc(100vh - 44px)', overflowY: 'auto',
        borderRight: '1px solid', borderColor: 'divider',
        backgroundColor: 'background.paper',
        py: 1.5, px: 1,
        display: { xs: 'none', md: 'flex' },
        flexDirection: 'column', gap: 0.5,
      }}
    >
      {groups.map(group => (
        <Box key={group.title} sx={{ mb: 1.5 }}>
          <Typography
            sx={{
              fontSize: '0.6rem', fontWeight: 600, letterSpacing: '1.5px',
              textTransform: 'uppercase', color: 'text.disabled',
              px: 1.5, py: 0.5, mb: 0.5,
            }}
          >
            {group.title}
          </Typography>
          {group.items.map(item => (
            <NavItemRow key={item.key} item={item} active={activeKey === item.key} />
          ))}
        </Box>
      ))}
    </Box>
  );
};

export default ContextSidebar;
