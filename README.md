# ComplianceGuard Desktop

<div align="center">

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](https://github.com/Egyan07/complianceguard-desktop)
[![Platform](https://img.shields.io/badge/platform-windows-lightgrey.svg)](https://github.com/Egyan07/complianceguard-desktop)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](https://github.com/Egyan07/complianceguard-desktop/blob/main/LICENSE)
[![SOC 2](https://img.shields.io/badge/compliance-SOC%202-orange.svg)](https://github.com/Egyan07/complianceguard-desktop)
[![Electron](https://img.shields.io/badge/electron-28.0.0-blue.svg)](https://electronjs.org/)
[![SQLite](https://img.shields.io/badge/database-SQLite-yellow.svg)](https://sqlite.org/)

**Professional SOC 2 Compliance Automation for Windows**

[Features](#features) • [Installation](#installation) • [Quick Start](#quick-start) • [Architecture](#architecture) • [Documentation](#documentation)

</div>

## 🎯 Overview

ComplianceGuard Desktop is a professional-grade SOC 2 compliance automation tool designed specifically for Windows environments. Built as a standalone desktop application using Electron.js, it provides comprehensive compliance monitoring, evidence collection, and audit preparation capabilities without requiring external servers or cloud dependencies.

Unlike traditional compliance tools that rely on external APIs and cloud services, ComplianceGuard Desktop operates entirely locally, ensuring your sensitive compliance data never leaves your infrastructure.

## ✨ Key Features

### 🔒 Local-First Architecture
- **Zero External Dependencies**: Complete offline operation with local SQLite database
- **Data Sovereignty**: All compliance data stored locally on your Windows system
- **Enhanced Security**: No external API calls or cloud data transmission
- **Enterprise Ready**: Designed for air-gapped and high-security environments

### 🛡️ SOC 2 Compliance Automation
- **54+ Pre-configured Controls**: Complete SOC 2 Type II Trust Service Criteria implementation
- **Automated Evidence Collection**: Windows system integration for real-time monitoring
- **Real-time Compliance Scoring**: Live dashboard with compliance status tracking
- **Comprehensive Reporting**: Detailed compliance reports and audit trails

### 🖥️ Professional Desktop Experience
- **Native Windows Integration**: System tray monitoring and background operation
- **Modern Electron Interface**: Professional GUI with responsive design
- **Background Processing**: Continuous monitoring without disrupting workflow
- **Windows Installer**: Professional MSI and NSIS installer packages

### 🔍 Advanced Monitoring Capabilities
- **Windows Event Log Integration**: Real-time security event monitoring
- **Registry & Service Tracking**: System configuration change detection
- **Network Security Analysis**: Firewall and network configuration monitoring
- **File System Auditing**: Critical system file integrity monitoring

## 🚀 Quick Start

### Prerequisites
- **Windows 10/11** (64-bit)
- **4GB RAM** minimum, **8GB RAM** recommended
- **1GB free disk space**
- **Administrator privileges** (required for evidence collection)

### Installation

#### Option 1: Cross-Platform Docker (Recommended for Development)
```bash
# Clone repository
git clone https://github.com/Egyan07/complianceguard-desktop.git
cd complianceguard-desktop

# Start with Docker Compose (includes backend, frontend, and database)
docker-compose up -d

# Access applications
# Frontend: http://localhost:3000
# Backend API: http://localhost:8000
# API Documentation: http://localhost:8000/docs
```

#### Option 2: Windows Native Application (Production)
1. Download `ComplianceGuard-Setup-1.0.0.exe` from [Releases](#)
2. Run the installer with administrator privileges
3. Follow the installation wizard
4. Launch ComplianceGuard from Start Menu

#### Option 3: Portable Windows Version
1. Download `ComplianceGuard-Portable-1.0.0.zip` from [Releases](#)
2. Extract to any folder
3. Run `ComplianceGuard.exe` as administrator

#### Option 4: Development Setup
```bash
# Clone repository
git clone https://github.com/Egyan07/complianceguard-desktop.git
cd complianceguard-desktop

# Install dependencies
npm install

# Start development version (Electron + React dev server)
npm run dev

# Or build for production
npm run build
npm run package
```
