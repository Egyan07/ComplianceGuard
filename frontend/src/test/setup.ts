import '@testing-library/jest-dom/vitest';

// Mock window.electronAPI for tests (simulates web mode)
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
});
