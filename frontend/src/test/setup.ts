/// <reference types="vitest" />
/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom';

// Mock window.electronAPI for tests (simulates web mode)
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
});
