/*
useColorMode — thin re-export kept for import-path compatibility.

The implementation moved to contexts/ColorModeContext.tsx when the mode was
promoted from per-component useState to a shared provider (the Settings dark
mode toggle visibly did nothing because each consumer held its own copy).
New code should import { useColorMode } from '../contexts/ColorModeContext'.
*/

export { useColorMode, type ColorMode } from '../contexts/ColorModeContext';
