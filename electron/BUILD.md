# CleanPos - Build Instructions

## Prerequisites

1. **Node.js** (v18 or higher)
2. **npm** or **yarn**
3. **Windows** (for building Windows installer)

## Setup

```bash
cd electron
npm install
```

## Required Assets

Before building, you need to create/add these files in the `build/` folder:

### 1. Application Icon (`build/icon.ico`)

Create a 256x256 icon in .ico format. You can:
- Use an online converter to create from PNG
- Use the included SVG as reference (icon.svg)

### 2. Installer Header Image (`build/installerHeader.bmp`)

- Size: **150 x 57 pixels**
- Format: BMP (24-bit)
- Used at top of installer pages

### 3. Installer Sidebar Image (`build/installerSidebar.bmp`)

- Size: **164 x 314 pixels**
- Format: BMP (24-bit)
- Shown on welcome and finish pages

**Quick Option:** If you don't have these BMP files, remove these lines from package.json:
```json
"installerHeader": "build/installerHeader.bmp",
"installerSidebar": "build/installerSidebar.bmp",
```

## Building

### Development Mode

```bash
npm start
```

Or with DevTools:
```bash
npm start -- --dev
```

### Build Windows Installer

```bash
npm run build:win
```

Output will be in `dist/` folder:
- `CleanPos-Setup-1.0.0.exe` - NSIS installer

### Build for macOS

```bash
npm run build:mac
```

### Build for Linux

```bash
npm run build:linux
```

## Installer Features

The Windows installer includes:

1. **Terms Agreement Page**
   - Must accept terms before installation
   - Links to https://posso.co.uk/software-terms
   - Checkbox must be checked to proceed

2. **Splash Screen**
   - Shows on app startup (3 seconds minimum)
   - Beautiful animated loading screen
   - Posso One Suite branding

3. **Custom Branding**
   - CleanPos name throughout
   - Posso copyright
   - Professional UI

## Troubleshooting

### "Cannot find module electron"
```bash
npm install
```

### NSIS Errors
- Ensure all referenced files exist in `build/` folder
- Check paths in `package.json`

### Icon Issues
- Icon must be valid .ico format
- Minimum 256x256 resolution

## Version Updates

Update version in `package.json`:
```json
"version": "1.0.1"
```

The version appears in:
- Splash screen
- Installer
- About section

---

© 2024 Posso - Posso One Suite
