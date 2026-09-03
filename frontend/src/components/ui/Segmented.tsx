import { Box, Chip } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { toneColors } from '../../theme';

export interface SegmentedOption<T extends string | number> {
  value: T;
  label: string;
}

interface SegmentedProps<T extends string | number> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  sx?: object;
}

/*
Segmented — one shared filter/segment control (used by the control-heatmap
filters and the history framework tabs) so every "All / Failing / Partial"
or "SOC 2 / ISO 27001" switcher looks and behaves the same.
*/
function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  size = 'sm',
  sx,
}: SegmentedProps<T>) {
  const theme = useTheme();
  const active = toneColors(theme, 'info');
  const height = size === 'sm' ? 24 : 30;
  const fontSize = size === 'sm' ? '0.72rem' : '0.78rem';

  return (
    <Box
      role="group"
      sx={{ display: 'inline-flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', ...sx }}
    >
      {options.map((opt) => {
        const isActive = opt.value === value;
        return (
          <Chip
            key={String(opt.value)}
            label={opt.label}
            size="small"
            aria-pressed={isActive}
            onClick={() => onChange(opt.value)}
            sx={{
              height,
              fontSize,
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: isActive ? active.surface : 'transparent',
              color: isActive ? active.onSurface : 'text.secondary',
              border: `1px solid ${isActive ? active.border : 'divider'}`,
              '&:hover': {
                backgroundColor: isActive ? active.surface : 'action.hover',
                color: isActive ? active.onSurface : 'text.primary',
              },
              borderRadius: '6px',
            }}
          />
        );
      })}
    </Box>
  );
}

export default Segmented;
