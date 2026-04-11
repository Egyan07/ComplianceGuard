# ComplianceGuard Electron Desktop Application Setup

## Overview
This guide explains how to set up and run the ComplianceGuard desktop application using Electron.js.

## Prerequisites

### Windows Requirements
- Node.js 18+ (https://nodejs.org/)
- Python 3.9+ (for some native modules)
- Visual Studio Build Tools (for native module compilation)
- Git (for version control)

### Install Visual Studio Build Tools
```cmd
npm install --global windows-build-tools
```

## Installation Steps

### 1. Navigate to the Project Directory
```cmd
cd "C:\My Projects\Projects\complianceguard\frontend"
```

### 2. Install Dependencies
```cmd
npm install
```

This will install:
- React and Vite for the frontend
- Electron for the desktop application
- Electron Builder for creating installers
- All required development tools

### 3. Install Additional Windows Dependencies
Some Windows system monitoring features require additional native modules:
```cmd
npm install winreg windows-event-log node-windows --save
```

## Development Workflow

### Start Development Mode
Run both React development server and Electron in development mode:
```cmd
npm run electron:dev
```

This will:
1. Start the React development server on http://localhost:3000
2. Wait for it to be ready
3. Launch Electron application
4. Enable hot reload for both processes

### Start Only Electron (for testing)
If React server is already running:
```cmd
npm run electron
```

### Start Only React Development Server
```cmd
npm run dev
```

## Building for Production

### Build React Application
```cmd
npm run build
```

### Create Windows Installer
```cmd
npm run electron:package
```

This creates:
- `dist/ComplianceGuard-Setup-{version}.msi` - Windows Installer
- `dist/ComplianceGuard-Setup-{version}.exe` - NSIS Installer

### Build All Platforms
```cmd
npm run electron:build
```

## Application Structure

```
complianceguard/
├── electron/                    # Electron main process files
│   ├── main.js                 # Main Electron process
│   ├── preload.js             # Secure bridge between main and renderer
│   └── system/                # Windows system integration
│       └── windows.js         # Windows evidence collection
├── frontend/                   # React frontend (existing)
├── resources/                  # Application resources
│   └── icons/                 # Application icons
└── package.json               # Updated with Electron scripts
```

## Key Features Implemented

### 1. System Integration
- Windows Event Log collection
- Registry security settings audit
- Service status monitoring
- Firewall configuration analysis
- User account and permission auditing

### 2. Desktop Features
- System tray integration with status indicators
- Background evidence collection
- Desktop notifications for compliance issues
- One-click evidence collection from tray menu

### 3. Security
- Context isolation between main and renderer processes
- Secure IPC communication
- No nodeIntegration in renderer process
- Proper error handling and logging

## Configuration

### Environment Variables
Create a `.env` file in the frontend directory:
```env
# Development/Production
NODE_ENV=development

# API Configuration
VITE_API_BASE_URL=http://localhost:8000

# Electron Configuration
ELECTRON_DISABLE_SECURITY_WARNINGS=true
```

### Electron Builder Configuration
Edit `electron-builder.json` to customize:
- Application metadata
- Installer settings
- File inclusion/exclusion
- Publishing configuration

## Troubleshooting

### Common Issues

#### 1. Native Module Compilation Fails
```cmd
# Install Windows Build Tools
npm install --global windows-build-tools

# Clear npm cache and retry
npm cache clean --force
npm install
```

#### 2. Electron Won't Start
```cmd
# Check if React server is running on port 3000
netstat -ano | findstr :3000

# Kill any process using port 3000
taskkill /PID <PID> /F
```

#### 3. Windows Evidence Collection Fails
- Run application as Administrator for full system access
- Ensure Windows Management Instrumentation (WMI) is enabled
- Check Windows Firewall settings

### Debug Mode
Enable verbose logging:
```cmd
set ELECTRON_ENABLE_LOGGING=true
npm run electron
```

## Distribution

### Create Installer
```cmd
npm run electron:package
```

### Install on Target Machine
1. Copy the generated `.msi` file to target machine
2. Run the installer as Administrator
3. Application will be installed in Program Files
4. Start menu shortcut will be created

### Auto-Updates
The application includes auto-update functionality:
- Checks for updates every hour
- Downloads updates in background
- Prompts user to restart for installation

## Next Steps

### Phase 2 Enhancements
1. **Enhanced GUI Components** - System monitoring dashboard
2. **Local Evidence Wizard** - Guided evidence collection
3. **Report Generation** - PDF/Excel export capabilities
4. **Advanced Monitoring** - Real-time compliance scoring
5. **Cloud Integration** - Sync with web platform

### Testing
- Test on Windows 10 and Windows 11
- Verify all system integration features work
- Test installer on clean Windows machine
- Validate auto-update functionality

## Support
For issues with the Electron desktop application:
1. Check the troubleshooting section above
2. Review Electron logs in `%APPDATA%\ComplianceGuard\logs`
3. Check Windows Event Viewer for application errors
4. Create an issue on GitHub with detailed error information