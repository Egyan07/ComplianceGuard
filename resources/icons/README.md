# ComplianceGuard Application Icons

This directory contains the application icons for the ComplianceGuard desktop application.

## Required Icons

### Main Application Icon
- **icon.ico** (Windows) - 256x256 pixels, multiple sizes embedded
- **icon.icns** (macOS) - 1024x1024 pixels
- **icon.png** (Linux) - 512x512 pixels

### Tray Icons
- **tray-icon.png** - 32x32 pixels for system tray
- **tray-icon-active.png** - 32x32 pixels for active state
- **notification-icon.png** - 64x64 pixels for notifications

## Creating Icons

1. Design a shield or compliance-themed icon
2. Use the ComplianceGuard blue color scheme (#1976d2)
3. Ensure icons work on both light and dark backgrounds
4. Include multiple sizes in ICO format for Windows

## Tools
- Use [favicon.io](https://favicon.io/) or similar tools to generate ICO files
- Use [ImageMagick](https://imagemagick.org/) for batch processing
- Ensure proper transparency for tray icons

Example ImageMagick commands:
```bash
# Create ICO file with multiple sizes
convert icon-16.png icon-32.png icon-48.png icon-64.png icon-128.png icon-256.png icon.ico

# Resize for tray icon
convert icon.png -resize 32x32 tray-icon.png
```

## Icon Specifications
- Format: PNG with transparency for tray icons
- Color depth: 32-bit with alpha channel
- Sizes: Multiple sizes for ICO, single size for PNGs
- Style: Professional, security-focused design