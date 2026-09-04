/**
 * Platform-aware evidence collector.
 * Routes to the OS-specific collector based on process.platform.
 * Returns the same evidence schema on all platforms.
 */
async function collectEvidence() {
  if (process.platform === 'darwin') {
    const { collectMacOSEvidence } = await import('./macos.js');
    return collectMacOSEvidence();
  }
  if (process.platform === 'linux') {
    const { collectLinuxEvidence } = await import('./linux.js');
    return collectLinuxEvidence();
  }
  const { collectWindowsEvidence } = await import('./windows.js');
  return collectWindowsEvidence();
}

module.exports = { collectEvidence };
